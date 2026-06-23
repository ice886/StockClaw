# RAG 混合检索设计（BM25 + 向量 + RRF 融合）

> 状态：设计已确认，待评审
> 日期：2026-06-23

## 背景

当前 RAG 检索是**纯向量**路径：`RagService.retrieve()` 把查询 embed 成向量，由 `VectorStoreService.retrieve()` 在 session 内所有 chunk 上做余弦相似度，过滤 `score >= 0.3` 后取 TopK=5。

向量检索擅长语义匹配（近义、改写），但对**精确关键词**偏弱——股票代码（TSLA / NVDA）、人名（马斯克 / 黄仁勋）这类专有名词，靠语义嵌入容易被稀释。BM25 是经典的词法检索，正好补这块短板：词项精确命中、稀有词权重高。

本设计在不改动现有上传 / 存储流程的前提下，增加 BM25 词法检索路，用 RRF（Reciprocal Rank Fusion，倒数排名融合）合并两路结果，得到更稳健的混合检索。

## 目标与非目标

**目标：**
- 增加 BM25 词法检索，与现有向量检索并行
- 用 RRF 融合两路排名，提升关键词 / 专有名词命中率
- 中文用内置 bigram 分词，零新增依赖
- 对外接口（`RagService.retrieve()` 返回 `RetrievedChunk[]`）和前端契约不变

**非目标：**
- 不持久化 BM25 索引（查询时实时计算）
- 不改向量文件格式 / 上传流程 / DB schema
- 不引入第三方分词库或检索引擎

## 架构

新增 `Bm25Service`（`src/rag/bm25.service.ts`），职责单一：**给定查询字符串和一组 chunk，返回 BM25 排序结果**。纯计算，不碰文件、不碰 DB——与现有 `cosine()` 同性质。

检索编排集中在 `RagService.retrieve()`：

```
RagService.retrieve(sessionId, query)
  ├── 读 DB 拿 docId→filename                      (已有)
  ├── VectorStore.loadChunks(sessionId)            ← 新增：暴露原始 chunk（含 text + vector）
  ├── 向量路: embed(query) → cosine 排序 → 排名列表  (cosine 逻辑保留)
  ├── 词法路: Bm25Service.rank(query, chunks)       ← 新增 → 排名列表
  └── fuse(向量排名, 词法排名) → TopK               ← 新增 RRF 融合
```

**关键决策：BM25 查询时实时计算，不持久化索引。** 单 session 语料很小（几个文档、几十到上百 chunk），`retrieve()` 本来就要把整个 session 的 chunk 读进内存做 cosine，BM25 复用同一批数据，在内存里现算 IDF 与平均文档长度即可。零额外存储、零索引维护、不动 `save()`。

## 组件设计

### 1. 分词器 `tokenize(text): string[]`

放在 `Bm25Service` 内（或同文件的纯函数）。规则：

- **中文连续字符**：提取所有相邻 bigram。例「股票分析」→ `股票`、`票分`、`分析`；同时保留单字 unigram（`股`、`票`、`分`、`析`），覆盖单字查询。
- **英文 / 数字**：按非字母数字边界切分并转小写。例 `TSLA` → `tsla`。
- 中英混合句子各自按上述规则切，合并为词项列表。

这样「特斯拉股价 TSLA」既命中中文 bigram，也精确命中 `tsla`。

### 2. BM25 打分 `rank(query, chunks): { chunkId, score }[]`

标准 BM25 公式，参数 `k1 = 1.5`、`b = 0.75`：

- 对传入的全部 chunk 当场统计：每个词项的文档频率 df（出现在多少个 chunk）、各 chunk 的词项数（文档长度）、平均文档长度 avgdl。
- 查询分词后，对每个 chunk 累加每个查询词的 BM25 贡献项：
  ```
  idf(t)   = ln( 1 + (N - df + 0.5) / (df + 0.5) )
  score   += idf(t) * ( f(t,d) * (k1+1) ) / ( f(t,d) + k1 * (1 - b + b * |d|/avgdl) )
  ```
  其中 N 为 chunk 总数，f(t,d) 为词项 t 在 chunk d 中的频次。
- 返回按 score 降序的 `{ chunkId, score }[]`。纯内存，无 IO。

### 3. RRF 融合 `fuse(rankings): RetrievedChunk[]`

两路各产出一个**排名列表**（向量路按 cosine 降序、词法路按 BM25 降序）。RRF 只看排名、不看分数量纲，避免归一化调参：

```
fusedScore(chunk) = Σ_i  1 / (k + rank_i)      k = 60（业界惯例）
```

对每个 chunk，在两个列表里各取其 1-based 排名代入求和；某 chunk 只在一路出现则另一路不贡献。最后按 `fusedScore` 降序取 TopK=5。

### 4. 接口与阈值变化

- `RetrievedChunk` 结构不变，`score` 字段语义改为**融合分**（RRF 值）。
- **移除余弦绝对阈值** `SCORE_THRESHOLD = 0.3`：该阈值针对的是余弦分，对融合分无意义。改由 TopK 截断保证结果量；两路都为空时返回空数组。

## 改动文件

| 文件 | 改动 |
|------|------|
| `src/rag/bm25.service.ts` | **新增**：`tokenize` + `rank`（BM25 打分） |
| `src/rag/vector-store.service.ts` | 新增 `loadChunks(sessionId): Chunk[]`，暴露原始 chunk；`retrieve()` 的 cosine 排名逻辑保留（或重构为返回排名列表供融合） |
| `src/rag/rag.service.ts` | `retrieve()` 编排两路 + RRF 融合；新增私有 `fuse()` |
| `src/rag/rag.module.ts` | 注册 `Bm25Service` provider |
| `src/rag/interfaces/rag.interfaces.ts` | 如需，新增内部排名类型（`RankedChunk { chunkId; score }`） |

## 数据流（单次检索）

```
查询 "TSLA 最新动态"
  → RagService.retrieve(sessionId, query)
      ├── DB: ragDocument.findMany → docId→filename
      ├── VectorStore.loadChunks(sessionId) → Chunk[]（含 vector）
      ├── 向量路: embedding.embed([query]) → cosine(每 chunk) → 降序 → 排名 R_vec
      ├── 词法路: Bm25Service.rank(query, chunks) → 降序 → 排名 R_bm25
      └── fuse(R_vec, R_bm25) → TopK=5 RetrievedChunk[]（score=RRF 融合分）
  → 注入 AgentContext（已有逻辑不变）
```

## 错误处理

- `retrieve()` 整体已包在 try/catch 中（失败则跳过 RAG 注入、返回空数组），新增逻辑沿用此保护。
- 向量路失败（如 embedding API 报错）：可降级为仅 BM25 结果，而非整体失败——词法路无外部依赖，提升鲁棒性。
- chunk 无 vector（历史数据）：向量路跳过该 chunk，词法路仍可用。

## 测试

- `bm25.service.spec.ts`：
  - 分词：纯中文、纯英文、中英混合、股票代码大小写
  - 打分：稀有词 idf 更高；高频词在长文档中不过度加权（验证 b 归一化）
  - 空查询 / 空语料边界
- 融合逻辑单测：构造两路已知排名，验证 RRF 求和与 TopK 截断正确；验证单路命中也能进结果。
- 端到端回归（真实 DB + embedding）：上传文档 → 用一个「语义弱、关键词强」的查询（如精确股票代码）验证 BM25 把正确 chunk 拉进 TopK，对比纯向量基线。

## 验证方式

1. `cd backend && npm run build` 编译通过
2. `npm run test -- bm25` 单测通过
3. 启动后端，上传一份含特定股票代码 / 人名的文档，调用检索接口（或经 chat 注入），确认精确关键词查询能命中对应 chunk
