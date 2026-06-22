import { Injectable } from '@nestjs/common';
import { Chunk } from './interfaces/rag.interfaces';

// 无 tokenizer，按字符近似：500 tokens ≈ 750 中文字符
const CHUNK_SIZE = 750;
const CHUNK_OVERLAP = 150;

@Injectable()
export class ChunkingService {
  /**
   * 固定窗口分块，段落优先：
   * 1. 按空行（\n\n）切分段落
   * 2. 累积段落直到接近 CHUNK_SIZE
   * 3. 单段过长则按 CHUNK_SIZE 强制切割（带重叠）
   */
  split(text: string, docId: string, sessionId: string): Chunk[] {
    const pieces: string[] = [];
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    let buffer = '';
    const flush = () => {
      const trimmed = buffer.trim();
      if (trimmed) pieces.push(trimmed);
      buffer = '';
    };

    for (const para of paragraphs) {
      if (para.length > CHUNK_SIZE) {
        flush();
        pieces.push(...this.forceSplit(para));
        continue;
      }
      if (buffer.length + para.length + 2 > CHUNK_SIZE) {
        flush();
      }
      buffer += (buffer ? '\n\n' : '') + para;
    }
    flush();

    return pieces.map((text, index) => ({
      id: `${docId}-${index}`,
      docId,
      sessionId,
      text,
      index,
    }));
  }

  /** 超长段落按固定窗口 + 重叠强制切割 */
  private forceSplit(text: string): string[] {
    const out: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      out.push(text.slice(start, end));
      if (end >= text.length) break;
      start = end - CHUNK_OVERLAP;
    }
    return out;
  }
}
