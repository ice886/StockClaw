import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DocumentParserService } from './document-parser.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';
import { Bm25Service } from './bm25.service';
import {
  RagDocument,
  RetrievedChunk,
  RankedChunk,
  Chunk,
} from './interfaces/rag.interfaces';

type RagDocRow = {
  id: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  chunkCount: number;
  uploadedAt: Date;
};

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private prisma: PrismaService,
    private parser: DocumentParserService,
    private chunking: ChunkingService,
    private embedding: EmbeddingService,
    private vectorStore: VectorStoreService,
    private bm25: Bm25Service,
  ) {}

  /** Prisma 行 → RagDocument（Date→epoch ms，保持前端契约不变） */
  private toDoc(r: RagDocRow): RagDocument {
    return {
      id: r.id,
      sessionId: r.sessionId,
      filename: r.filename,
      mimeType: r.mimeType,
      uploadedAt: r.uploadedAt.getTime(),
      chunkCount: r.chunkCount,
    };
  }

  /** 上传流程：解析 → 分块 → 向量化 → 存储（向量文件 + DB 元数据） */
  async upload(
    file: Express.Multer.File,
    sessionId: string,
  ): Promise<RagDocument> {
    if (!file) throw new BadRequestException('缺少文件');
    if (!sessionId) throw new BadRequestException('缺少 sessionId');

    const docId = Math.random().toString(36).substring(2);
    const text = await this.parser.parse(file.buffer, file.mimetype);
    if (!text.trim()) {
      throw new BadRequestException('文档内容为空，无法处理');
    }

    const chunks = this.chunking.split(text, docId, sessionId);
    const vectors = await this.embedding.embed(chunks.map((c) => c.text));
    chunks.forEach((c, i) => (c.vector = vectors[i]));

    const filename = this.decodeFilename(file.originalname);

    // 先写向量文件，再写 DB 元数据（DB 是文档存在性的权威来源）
    await this.vectorStore.save(sessionId, docId, chunks);
    const row = await this.prisma.ragDocument.create({
      data: {
        id: docId,
        sessionId,
        filename,
        mimeType: file.mimetype,
        chunkCount: chunks.length,
      },
    });

    this.logger.log(
      `已处理文档 ${filename}（${chunks.length} 块）→ session ${sessionId}`,
    );
    return this.toDoc(row);
  }

  /** 混合检索：向量路 + BM25 词法路，RRF 融合后取 TopK */
  async retrieve(
    sessionId: string,
    query: string,
    topK = 5,
  ): Promise<RetrievedChunk[]> {
    if (!query.trim()) return [];
    try {
      const docs = await this.prisma.ragDocument.findMany({
        where: { sessionId },
        select: { id: true, filename: true },
      });
      if (docs.length === 0) return [];

      const filenames: Record<string, string> = {};
      for (const d of docs) filenames[d.id] = d.filename;

      const chunks = await this.vectorStore.loadChunks(sessionId);
      if (chunks.length === 0) return [];

      const bmRanked = this.bm25.rank(query, chunks);

      let vecRanked: RankedChunk[] = [];
      try {
        const [queryVector] = await this.embedding.embed([query]);
        vecRanked = chunks
          .filter((c) => c.vector)
          .map((c) => ({
            chunkId: c.id,
            score: cosineSim(queryVector, c.vector as number[]),
          }))
          .sort((a, b) => b.score - a.score);
      } catch (err) {
        this.logger.warn(`向量检索失败，降级为仅 BM25: ${err}`);
      }

      return this.fuse(vecRanked, bmRanked, chunks, filenames, topK);
    } catch (err) {
      this.logger.warn(`RAG 检索失败，跳过注入: ${err}`);
      return [];
    }
  }

  /**
   * RRF 融合两路排名。
   * fusedScore(chunk) = Σ 1/(k + rank_i)，k=60，rank 为 1-based。
   * 只在一路出现的 chunk，另一路不贡献。
   */
  private fuse(
    vecRanked: RankedChunk[],
    bmRanked: RankedChunk[],
    chunks: Chunk[],
    filenames: Record<string, string>,
    topK: number,
  ): RetrievedChunk[] {
    const K = 60;
    const fused = new Map<string, number>();
    const addRanks = (ranked: RankedChunk[]) => {
      ranked.forEach((r: RankedChunk, i: number) => {
        const rank = i + 1;
        fused.set(r.chunkId, (fused.get(r.chunkId) ?? 0) + 1 / (K + rank));
      });
    };
    addRanks(vecRanked);
    addRanks(bmRanked);

    const byId = new Map(chunks.map((c) => [c.id, c]));
    return [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([chunkId, score]) => {
        const c = byId.get(chunkId);
        const docId = c?.docId ?? '';
        return {
          text: c?.text ?? '',
          docId,
          filename: filenames[docId] ?? '未知文档',
          score,
        };
      });
  }

  async listDocuments(sessionId: string): Promise<RagDocument[]> {
    const rows = await this.prisma.ragDocument.findMany({
      where: { sessionId },
      orderBy: { uploadedAt: 'desc' },
    });
    return rows.map((r) => this.toDoc(r));
  }

  async deleteDocument(sessionId: string, docId: string): Promise<boolean> {
    try {
      // DB 元数据 + 向量文件一并删除（DB 删除失败则视为文档不存在）
      await this.prisma.ragDocument.delete({
        where: { id: docId },
      });
      await this.vectorStore.deleteDoc(sessionId, docId);
      return true;
    } catch {
      return false;
    }
  }

  /** multer 默认按 latin1 解析文件名，转回 utf-8 以正确显示中文 */
  private decodeFilename(name: string): string {
    return Buffer.from(name, 'latin1').toString('utf-8');
  }
}

/** 余弦相似度（纯 JS） */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
