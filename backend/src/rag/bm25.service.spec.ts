import { Bm25Service } from './bm25.service';
import { Chunk } from './interfaces/rag.interfaces';

describe('Bm25Service.tokenize', () => {
  let service: Bm25Service;
  beforeEach(() => {
    service = new Bm25Service();
  });

  it('中文连续字符拆为 bigram + unigram', () => {
    const tokens = service.tokenize('股票分析');
    expect(tokens).toEqual(
      expect.arrayContaining(['股', '票', '分', '析']),
    );
    expect(tokens).toEqual(
      expect.arrayContaining(['股票', '票分', '分析']),
    );
  });

  it('英文按边界切分并转小写', () => {
    const tokens = service.tokenize('Buy TSLA now');
    expect(tokens).toEqual(expect.arrayContaining(['buy', 'tsla', 'now']));
  });

  it('中英混合各自切分', () => {
    const tokens = service.tokenize('特斯拉 TSLA');
    expect(tokens).toEqual(
      expect.arrayContaining(['特斯', '斯拉', '特', '斯', '拉', 'tsla']),
    );
  });

  it('空字符串返回空数组', () => {
    expect(service.tokenize('')).toEqual([]);
    expect(service.tokenize('   ')).toEqual([]);
  });
});

function chunk(id: string, text: string): Chunk {
  return { id, docId: 'd', sessionId: 's', text, index: 0 };
}

describe('Bm25Service.rank', () => {
  let service: Bm25Service;
  beforeEach(() => {
    service = new Bm25Service();
  });

  it('含查询词的 chunk 得分高于不含的', () => {
    const chunks = [
      chunk('a', '特斯拉发布新车型'),
      chunk('b', '今天天气很好'),
    ];
    const ranked = service.rank('特斯拉', chunks);
    expect(ranked[0].chunkId).toBe('a');
    expect(ranked[0].score).toBeGreaterThan(0);
    const b = ranked.find((r) => r.chunkId === 'b');
    expect(b?.score ?? 0).toBe(0);
  });

  it('稀有词 idf 更高，使专有名词命中更突出', () => {
    const chunks = [
      chunk('a', 'TSLA TSLA 股价'),
      chunk('b', '股价 股价 股价'),
    ];
    const ranked = service.rank('TSLA', chunks);
    expect(ranked[0].chunkId).toBe('a');
  });

  it('空查询返回空数组', () => {
    const ranked = service.rank('', [chunk('a', '内容')]);
    expect(ranked).toEqual([]);
  });

  it('空语料返回空数组', () => {
    expect(service.rank('查询', [])).toEqual([]);
  });
});
