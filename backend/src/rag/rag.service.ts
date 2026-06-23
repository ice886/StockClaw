import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DocumentParserService } from './document-parser.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';
import { RagDocument, RetrievedChunk } from './interfaces/rag.interfaces';

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

  /** 检索流程（供 AgentController 调用） */
  async retrieve(sessionId: string, query: string): Promise<RetrievedChunk[]> {
    if (!query.trim()) return [];
    try {
      const docs = await this.prisma.ragDocument.findMany({
        where: { sessionId },
        select: { id: true, filename: true },
      });
      if (docs.length === 0) return [];

      const filenames: Record<string, string> = {};
      for (const d of docs) filenames[d.id] = d.filename;

      const [queryVector] = await this.embedding.embed([query]);
      return await this.vectorStore.retrieve(sessionId, queryVector, filenames);
    } catch (err) {
      this.logger.warn(`RAG 检索失败，跳过注入: ${err}`);
      return [];
    }
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
