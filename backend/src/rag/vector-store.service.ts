import { Injectable, Logger } from '@nestjs/common';
import { readdir, readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { Chunk, RetrievedChunk, VectorFile } from './interfaces/rag.interfaces';

const VECTORS_DIR = resolve('data/vectors');
const SCORE_THRESHOLD = 0.3;

@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  private sessionDir(sessionId: string): string {
    return join(VECTORS_DIR, sessionId);
  }

  private docPath(sessionId: string, docId: string): string {
    return join(this.sessionDir(sessionId), `${docId}.json`);
  }

  /** 持久化带向量的 chunks（文档元数据由 RagService 写入 DB） */
  async save(sessionId: string, docId: string, chunks: Chunk[]): Promise<void> {
    const dir = this.sessionDir(sessionId);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const file: VectorFile = { chunks };
    await writeFile(
      this.docPath(sessionId, docId),
      JSON.stringify(file),
      'utf-8',
    );
  }

  /** 删除指定文档的向量文件 */
  async deleteDoc(sessionId: string, docId: string): Promise<boolean> {
    try {
      await unlink(this.docPath(sessionId, docId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 在该 session 所有 chunk 上做余弦相似度检索，返回 TopK。
   * filenames：docId → filename 映射，由 RagService 从 DB 查出后传入，
   * 使本服务保持无 DB 依赖。
   */
  async retrieve(
    sessionId: string,
    queryVector: number[],
    filenames: Record<string, string>,
    topK = 5,
  ): Promise<RetrievedChunk[]> {
    const files = await this.readSessionFiles(sessionId);

    const scored: RetrievedChunk[] = [];
    for (const file of files) {
      for (const chunk of file.chunks) {
        if (!chunk.vector) continue;
        const score = cosine(queryVector, chunk.vector);
        scored.push({
          text: chunk.text,
          docId: chunk.docId,
          filename: filenames[chunk.docId] ?? '未知文档',
          score,
        });
      }
    }

    return scored
      .filter((c) => c.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /** 读取 session 目录下所有 VectorFile，损坏文件跳过 */
  private async readSessionFiles(sessionId: string): Promise<VectorFile[]> {
    const dir = this.sessionDir(sessionId);
    if (!existsSync(dir)) return [];

    const names = await readdir(dir);
    const files: VectorFile[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const content = await readFile(join(dir, name), 'utf-8');
        files.push(JSON.parse(content) as VectorFile);
      } catch (err) {
        this.logger.warn(`跳过损坏的向量文件 ${name}: ${err}`);
      }
    }
    return files;
  }
}

/** 余弦相似度（纯 JS，无需 BLAS） */
function cosine(a: number[], b: number[]): number {
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
