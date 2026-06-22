import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DocumentParserService } from './document-parser.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';
import { RagDocument, RetrievedChunk } from './interfaces/rag.interfaces';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private parser: DocumentParserService,
    private chunking: ChunkingService,
    private embedding: EmbeddingService,
    private vectorStore: VectorStoreService,
  ) {}

  /** 上传流程：解析 → 分块 → 向量化 → 存储 */
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
    const doc: RagDocument = {
      id: docId,
      sessionId,
      filename,
      mimeType: file.mimetype,
      uploadedAt: Date.now(),
      chunkCount: chunks.length,
    };

    await this.vectorStore.save(doc, chunks);
    this.logger.log(
      `已处理文档 ${filename}（${chunks.length} 块）→ session ${sessionId}`,
    );
    return doc;
  }

  /** 检索流程（供 AgentController 调用） */
  async retrieve(sessionId: string, query: string): Promise<RetrievedChunk[]> {
    if (!query.trim()) return [];
    try {
      const [queryVector] = await this.embedding.embed([query]);
      return await this.vectorStore.retrieve(sessionId, queryVector);
    } catch (err) {
      this.logger.warn(`RAG 检索失败，跳过注入: ${err}`);
      return [];
    }
  }

  listDocuments(sessionId: string): Promise<RagDocument[]> {
    return this.vectorStore.listDocs(sessionId);
  }

  deleteDocument(sessionId: string, docId: string): Promise<boolean> {
    return this.vectorStore.deleteDoc(sessionId, docId);
  }

  /** multer 默认按 latin1 解析文件名，转回 utf-8 以正确显示中文 */
  private decodeFilename(name: string): string {
    return Buffer.from(name, 'latin1').toString('utf-8');
  }
}
