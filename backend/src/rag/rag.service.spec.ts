import { RagService } from './rag.service';
import { RankedChunk, Chunk } from './interfaces/rag.interfaces';

function chunk(id: string): Chunk {
  return { id, docId: id.split('-')[0], sessionId: 's', text: id, index: 0 };
}

describe('RagService.fuse (RRF)', () => {
  const service = new RagService(
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
  );

  it('两路都命中的 chunk 融合分最高', () => {
    const chunks = [chunk('d1-0'), chunk('d1-1'), chunk('d2-0')];
    const vec: RankedChunk[] = [
      { chunkId: 'd1-0', score: 0.9 },
      { chunkId: 'd1-1', score: 0.5 },
    ];
    const bm: RankedChunk[] = [
      { chunkId: 'd1-0', score: 8 },
      { chunkId: 'd2-0', score: 3 },
    ];
    const filenames = { d1: 'a.txt', d2: 'b.txt' };
    const out = (service as any).fuse(vec, bm, chunks, filenames, 5) as {
      docId: string;
      filename: string;
      score: number;
      text: string;
    }[];
    expect(out[0].text).toBe('d1-0');
    expect(out[0].filename).toBe('a.txt');
  });

  it('单路命中也能进入结果', () => {
    const chunks = [chunk('d1-0'), chunk('d2-0')];
    const vec: RankedChunk[] = [{ chunkId: 'd1-0', score: 0.9 }];
    const bm: RankedChunk[] = [{ chunkId: 'd2-0', score: 5 }];
    const out = (service as any).fuse(vec, bm, chunks, {}, 5) as {
      text: string;
    }[];
    const ids = out.map((o) => o.text);
    expect(ids).toEqual(expect.arrayContaining(['d1-0', 'd2-0']));
  });

  it('TopK 截断', () => {
    const chunks = ['a-0', 'a-1', 'a-2', 'a-3'].map(chunk);
    const vec: RankedChunk[] = chunks.map((c, i) => ({
      chunkId: c.id,
      score: 1 - i * 0.1,
    }));
    const out = (service as any).fuse(vec, [], chunks, {}, 2) as unknown[];
    expect(out).toHaveLength(2);
  });
});
