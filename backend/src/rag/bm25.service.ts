import { Injectable } from '@nestjs/common';
import { Chunk, RankedChunk } from './interfaces/rag.interfaces';

const K1 = 1.5;
const B = 0.75;

@Injectable()
export class Bm25Service {
  /**
   * 分词：
   * - 中文连续段：相邻 bigram + 单字 unigram
   * - 英文/数字连续段：转小写，整段作为一个词项
   * - 其它字符作为分隔符
   */
  tokenize(text: string): string[] {
    const tokens: string[] = [];
    const re = /[一-鿿]+|[a-zA-Z0-9]+/g;
    const matches = text.match(re) ?? [];
    for (const seg of matches) {
      if (/[一-鿿]/.test(seg[0])) {
        for (let i = 0; i < seg.length; i++) {
          tokens.push(seg[i]);
          if (i + 1 < seg.length) tokens.push(seg.slice(i, i + 2));
        }
      } else {
        tokens.push(seg.toLowerCase());
      }
    }
    return tokens;
  }

  /**
   * 在传入 chunks 上做 BM25 打分，返回按分数降序的排名。
   * 词频/文档频率/平均长度均在本批 chunk 上实时统计。
   */
  rank(query: string, chunks: Chunk[]): RankedChunk[] {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0 || chunks.length === 0) return [];

    const docs = chunks.map((c) => {
      const terms = this.tokenize(c.text);
      const tf = new Map<string, number>();
      for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      return { id: c.id, len: terms.length, tf };
    });

    const N = docs.length;
    const avgdl = docs.reduce((s, d) => s + d.len, 0) / N || 0;

    const uniqueQueryTerms = [...new Set(queryTerms)];
    const df = new Map<string, number>();
    for (const t of uniqueQueryTerms) {
      let count = 0;
      for (const d of docs) if (d.tf.has(t)) count++;
      df.set(t, count);
    }

    const scored: RankedChunk[] = docs.map((d) => {
      let score = 0;
      for (const t of uniqueQueryTerms) {
        const f = d.tf.get(t) ?? 0;
        if (f === 0) continue;
        const n = df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        const denom = f + K1 * (1 - B + (B * d.len) / (avgdl || 1));
        score += idf * ((f * (K1 + 1)) / denom);
      }
      return { chunkId: d.id, score };
    });

    return scored.sort((a, b) => b.score - a.score);
  }
}
