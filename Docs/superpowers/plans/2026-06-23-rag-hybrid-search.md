# RAG 混合检索（BM25 + 向量 + RRF）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有纯向量 RAG 检索上增加 BM25 词法检索，用 RRF 融合两路排名，提升关键词/专有名词命中率。

**Architecture:** 新增 `Bm25Service`（纯计算，bigram 中文分词 + BM25 打分）。`VectorStoreService` 暴露 `loadChunks()` 供检索复用。`RagService.retrieve()` 编排向量路 + 词法路，用 RRF 融合后取 TopK。BM25 查询时实时计算，不持久化索引，不改存储格式。

**Tech Stack:** NestJS, TypeScript, Jest (ts-jest, `rootDir: src`, 测试文件 `*.spec.ts` 与源码同目录)。

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `src/rag/bm25.service.ts` | **新增**：`tokenize()` bigram 分词 + `rank()` BM25 打分 |
| `src/rag/bm25.service.spec.ts` | **新增**：分词 + 打分单测 |
| `src/rag/interfaces/rag.interfaces.ts` | **修改**：新增 `RankedChunk` 内部类型 |
| `src/rag/vector-store.service.ts` | **修改**：新增 `loadChunks()`；`retrieve()` 保留 |
| `src/rag/rag.service.ts` | **修改**：`retrieve()` 改为两路 + RRF 融合；新增私有 `fuse()` |
| `src/rag/rag.service.spec.ts` | **新增**：RRF 融合逻辑单测 |
| `src/rag/rag.module.ts` | **修改**：注册 `Bm25Service` |

---

## Task 1: 新增内部类型 `RankedChunk`

**Files:**
- Modify: `src/rag/interfaces/rag.interfaces.ts`

- [ ] **Step 1: 在接口文件末尾追加类型**

在 `src/rag/interfaces/rag.interfaces.ts` 文件末尾追加：

```typescript
/** 单路检索的排名结果（内部用，融合前） */
export interface RankedChunk {
  chunkId: string; // chunk.id，即 `${docId}-${index}`
  score: number; // 该路的原始分（cosine 或 BM25）
}
```

- [ ] **Step 2: 编译确认无误**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: 无报错（仅新增导出类型）

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/rag/interfaces/rag.interfaces.ts
git commit -m "feat(rag): add RankedChunk interface for hybrid retrieval"
```

---

## Task 2: `Bm25Service` 分词器 `tokenize()`

**Files:**
- Create: `src/rag/bm25.service.ts`
- Test: `src/rag/bm25.service.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/rag/bm25.service.spec.ts`：

```typescript
import { Bm25Service } from './bm25.service';

describe('Bm25Service.tokenize', () => {
  let service: Bm25Service;
  beforeEach(() => {
    service = new Bm25Service();
  });

  it('中文连续字符拆为 bigram + unigram', () => {
    const tokens = service.tokenize('股票分析');
    // unigram
    expect(tokens).toEqual(
      expect.arrayContaining(['股', '票', '分', '析']),
    );
    // bigram
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest bm25 -v`
Expected: FAIL，报 `Cannot find module './bm25.service'`

- [ ] **Step 3: 实现 `Bm25Service` 与 `tokenize`**

创建 `src/rag/bm25.service.ts`：

```typescript
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
    // 连续匹配：CJK 段 或 英数字段
    const re = /[一-鿿]+|[a-zA-Z0-9]+/g;
    const matches = text.match(re) ?? [];
    for (const seg of matches) {
      if (/[一-鿿]/.test(seg[0])) {
        // 中文段
        for (let i = 0; i < seg.length; i++) {
          tokens.push(seg[i]); // unigram
          if (i + 1 < seg.length) tokens.push(seg.slice(i, i + 2)); // bigram
        }
      } else {
        tokens.push(seg.toLowerCase());
      }
    }
    return tokens;
  }

  /** 占位：Task 3 实现 */
  rank(query: string, chunks: Chunk[]): RankedChunk[] {
    void query;
    void chunks;
    return [];
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx jest bm25 -v`
Expected: PASS（4 个 tokenize 测试通过）

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/rag/bm25.service.ts src/rag/bm25.service.spec.ts
git commit -m "feat(rag): add Bm25Service tokenizer (bigram + english)"
```

---

## Task 3: `Bm25Service.rank()` BM25 打分

**Files:**
- Modify: `src/rag/bm25.service.ts`
- Test: `src/rag/bm25.service.spec.ts`

- [ ] **Step 1: 追加失败测试**

在 `src/rag/bm25.service.spec.ts` 末尾追加：

```typescript
import { Chunk } from './interfaces/rag.interfaces';

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
    // 不含查询词的得分为 0，按降序排在后面
    const b = ranked.find((r) => r.chunkId === 'b');
    expect(b?.score ?? 0).toBe(0);
  });

  it('稀有词 idf 更高，使专有名词命中更突出', () => {
    const chunks = [
      chunk('a', 'TSLA TSLA 股价'),
      chunk('b', '股价 股价 股价'),
    ];
    // 查询稀有词 tsla，只在 a 出现
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest bm25 -v`
Expected: FAIL（`rank` 当前返回 `[]`，第一个 rank 测试断言 `ranked[0].chunkId === 'a'` 失败）

- [ ] **Step 3: 实现 `rank`**

替换 `src/rag/bm25.service.ts` 中的 `rank` 占位方法：

```typescript
  /**
   * 在传入 chunks 上做 BM25 打分，返回按分数降序的排名。
   * 词频/文档频率/平均长度均在本批 chunk 上实时统计。
   */
  rank(query: string, chunks: Chunk[]): RankedChunk[] {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0 || chunks.length === 0) return [];

    // 每个 chunk 的词项列表与词频表
    const docs = chunks.map((c) => {
      const terms = this.tokenize(c.text);
      const tf = new Map<string, number>();
      for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      return { id: c.id, len: terms.length, tf };
    });

    const N = docs.length;
    const avgdl = docs.reduce((s, d) => s + d.len, 0) / N || 0;

    // 文档频率 df：每个查询词出现在多少个 chunk
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx jest bm25 -v`
Expected: PASS（tokenize + rank 全部测试通过）

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/rag/bm25.service.ts src/rag/bm25.service.spec.ts
git commit -m "feat(rag): implement BM25 scoring in Bm25Service.rank"
```

---

## Task 4: `VectorStoreService.loadChunks()`

**Files:**
- Modify: `src/rag/vector-store.service.ts`

- [ ] **Step 1: 新增 `loadChunks` 方法**

在 `src/rag/vector-store.service.ts` 的 `retrieve()` 方法之后、`readSessionFiles()` 之前，新增公开方法：

```typescript
  /** 读取 session 内全部 chunk（含 vector），供混合检索复用 */
  async loadChunks(sessionId: string): Promise<Chunk[]> {
    const files = await this.readSessionFiles(sessionId);
    return files.flatMap((f) => f.chunks);
  }
```

> 注：`Chunk` 已在该文件顶部从 `./interfaces/rag.interfaces` 导入，无需新增 import。

- [ ] **Step 2: 编译确认无误**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/rag/vector-store.service.ts
git commit -m "feat(rag): expose loadChunks for hybrid retrieval"
```

---

## Task 5: `RagService.retrieve()` 两路 + RRF 融合

**Files:**
- Modify: `src/rag/rag.service.ts`
- Test: `src/rag/rag.service.spec.ts`

- [ ] **Step 1: 写失败测试（验证 RRF 融合逻辑）**

创建 `src/rag/rag.service.spec.ts`。该测试只验证纯函数 `fuse`，通过 `(service as any).fuse(...)` 访问私有方法，避免依赖 DB / embedding：

```typescript
import { RagService } from './rag.service';
import { RankedChunk, Chunk } from './interfaces/rag.interfaces';

function chunk(id: string): Chunk {
  return { id, docId: id.split('-')[0], sessionId: 's', text: id, index: 0 };
}

describe('RagService.fuse (RRF)', () => {
  // 仅测纯函数，依赖传 null
  const service = new RagService(
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
    const out = (service as any).fuse(
      vec,
      bm,
      chunks,
      filenames,
      5,
    ) as { docId: string; filename: string; score: number; text: string }[];
    // d1-0 在两路都排第 1，融合分最高
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest rag.service -v`
Expected: FAIL，报 `(service as any).fuse is not a function`

- [ ] **Step 3: 改写 `retrieve` 并新增 `fuse`**

在 `src/rag/rag.service.ts`：

3a. 顶部 import 增加 `Bm25Service` 与类型：

```typescript
import { Bm25Service } from './bm25.service';
import {
  RagDocument,
  RetrievedChunk,
  RankedChunk,
  Chunk,
} from './interfaces/rag.interfaces';
```

（替换原有的 `import { RagDocument, RetrievedChunk } from './interfaces/rag.interfaces';`）

3b. 构造函数注入 `Bm25Service`：

```typescript
  constructor(
    private prisma: PrismaService,
    private parser: DocumentParserService,
    private chunking: ChunkingService,
    private embedding: EmbeddingService,
    private vectorStore: VectorStoreService,
    private bm25: Bm25Service,
  ) {}
```

3c. 用以下实现替换整个 `retrieve` 方法：

```typescript
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

      // 词法路（无外部依赖，先算）
      const bmRanked = this.bm25.rank(query, chunks);

      // 向量路（embedding 失败则降级为仅 BM25）
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
      ranked.forEach((r, i) => {
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
```

3d. 在文件末尾（`export class RagService` 闭合大括号之后）新增余弦相似度纯函数：

```typescript
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx jest rag.service -v`
Expected: PASS（3 个 fuse 测试通过）

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/rag/rag.service.ts src/rag/rag.service.spec.ts
git commit -m "feat(rag): hybrid retrieve with BM25 + vector RRF fusion"
```

---

## Task 6: 注册 `Bm25Service` 到模块

**Files:**
- Modify: `src/rag/rag.module.ts`

- [ ] **Step 1: 注册 provider**

在 `src/rag/rag.module.ts`：

import 增加：

```typescript
import { Bm25Service } from './bm25.service';
```

`providers` 数组中加入 `Bm25Service`：

```typescript
  providers: [
    RagService,
    DocumentParserService,
    ChunkingService,
    EmbeddingService,
    VectorStoreService,
    Bm25Service,
  ],
```

- [ ] **Step 2: 全量构建确认依赖注入正确**

Run: `cd backend && npm run build`
Expected: `nest build` 成功，无报错（若 `Bm25Service` 未注册，Nest 启动时会报 RagService 依赖无法解析——构建期 TS 不报，但这步确认编译通过）

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/rag/rag.module.ts
git commit -m "feat(rag): register Bm25Service provider"
```

---

## Task 7: 全量测试 + 端到端验证

**Files:** 无新增

- [ ] **Step 1: 跑全部单测**

Run: `cd backend && npm test`
Expected: 全部 PASS（含新增 bm25 / rag.service 测试）

- [ ] **Step 2: 启动后端，确认 DI 正常**

Run: `cd backend && npm run start:dev`
Expected: 日志出现 `Nest application successfully started`，无 `Nest can't resolve dependencies of the RagService` 报错。确认后 Ctrl-C 停止。

> 若 3000 端口被占用，先停掉已有进程或忽略 `EADDRINUSE`——只要看到路由映射与 started 日志即说明 DI 成功。

- [ ] **Step 3: 端到端检索验证（手动）**

启动后端后，上传一份含明确专有名词（如股票代码 `TSLA` 或人名）的文档：

```bash
curl -F "file=@/path/to/doc.txt" -F "sessionId=test-hybrid" localhost:3000/api/rag/upload
```

用一个**关键词强、语义弱**的查询经 chat 触发检索（或临时加日志打印 `retrieve()` 结果），确认包含该关键词的 chunk 进入 TopK。对比纯向量基线，BM25 应让精确关键词命中更靠前。

> 这步是人工观察验证，无自动断言。确认现象符合预期即可。

- [ ] **Step 4: 更新 CHANGELOG**

在 `Docs/CHANGELOG.md` 顶部（`# 开发日志` 之后）追加：

```markdown
## 2026-06-23 — RAG 混合检索（BM25 + 向量 + RRF）

### 新增 BM25 词法检索路，与向量检索 RRF 融合

- 新增 `Bm25Service`：bigram 中文分词 + 标准 BM25 打分（k1=1.5, b=0.75），纯计算无 IO，查询时实时统计 idf/avgdl，不持久化索引
- `VectorStoreService` 新增 `loadChunks()` 暴露原始 chunk 供两路复用
- `RagService.retrieve()` 改为混合检索：向量路（cosine）+ 词法路（BM25），RRF 融合（k=60）后取 TopK；移除余弦绝对阈值，改由 TopK 截断；向量路失败可降级为仅 BM25
- 接口 `RetrievedChunk` 不变，`score` 语义改为融合分；前端契约不变
```

- [ ] **Step 5: Commit**

```bash
cd backend && cd .. && git add Docs/CHANGELOG.md
git commit -m "docs(rag): changelog for hybrid search"
```

---

## Self-Review 结果

- **Spec 覆盖**：分词（Task 2）、BM25 打分（Task 3）、loadChunks（Task 4）、RRF 融合 + 阈值移除 + 降级（Task 5）、模块注册（Task 6）、测试与端到端验证（Task 7）——spec 各节均有对应任务。
- **类型一致**：`RankedChunk { chunkId; score }`（Task 1）在 Task 3 `rank` 返回、Task 5 `fuse` 入参中一致使用；`Chunk.id` 即 `${docId}-${index}`，`fuse` 通过 `byId` 反查 `docId`/`text` 一致。
- **无 placeholder**：所有代码步骤含完整实现；Task 2 的 `rank` 占位明确标注「Task 3 实现」并在 Task 3 替换。
- **命名一致**：服务名 `Bm25Service`、方法 `tokenize`/`rank`/`loadChunks`/`fuse`/`retrieve` 全程统一；余弦函数 `cosineSim`（避免与 vector-store 内 `cosine` 混淆，因二者在不同文件，均为模块私有）。
