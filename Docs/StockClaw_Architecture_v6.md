# StockClaw Architecture v6 — RAG 文档问答

> v6 在现有 Agent + Skill 体系上叠加 RAG 能力：用户可在聊天框上传 PDF、Word、TXT 等文档，上传后自动解析分块、向量化入库，后续对话自动检索相关段落注入上下文。前端以「+」按钮触发上传，对用户完全无感。

---

## 一、问题背景

当前系统的上下文窗口固定，无法处理超长文档（年报、研究报告、合同等）。用户需要把完整 PDF 内容复制粘贴进对话框，体验很差，且超长内容往往超过模型 token 限制。

v6 的目标：

| 目标 | 说明 |
|------|------|
| 文档上传 | 前端 `+` 按钮支持 PDF / Word / TXT，单文件 ≤ 20 MB |
| 自动解析 | 后端解析文本内容，按段落分块，无需用户干预 |
| 向量检索 | 每次对话前检索最相关的 Top-K 段落，注入 system prompt |
| 会话隔离 | 文档归属于上传时的 Session，不跨 Session 共享 |
| 零破坏 | 不改变现有 Agent / Skill / Monitor 架构，RAG 作为可选层叠加 |

---

## 二、整体架构

```
用户上传文档
     │
     ▼
POST /api/rag/upload  (multipart/form-data)
     │
     ├── DocumentParserService   ← 提取纯文本
     │      ├── pdf-parse        PDF → text
     │      ├── mammoth          .docx → text
     │      └── fs.readFile      .txt → text
     │
     ├── ChunkingService         ← 固定大小分块 + 重叠
     │      └── chunks[]  { text, index, docId }
     │
     ├── EmbeddingService        ← 批量调用 Embedding API
     │      └── vectors[]  Float32Array
     │
     └── VectorStoreService      ← 持久化到本地向量库
            └── data/vectors/<sessionId>/<docId>.json

                    ↓ 存储完成
            返回 { docId, chunkCount, filename }

─────────────────────────────────────────────────

用户发送消息
     │
     ▼
POST /api/chat  (带 sessionId)
     │
     ├── RAGService.retrieve(sessionId, userMessage)
     │      ├── 查询 VectorStoreService 该 session 的所有文档
     │      ├── 对 userMessage 做 embedding
     │      ├── 余弦相似度排序，取 Top-5 段落
     │      └── 返回 RetrievedChunk[]
     │
     ├── AgentController.assemble()
     │      ├── 现有：session history + skill config
     │      └── 新增：RAGService 检索结果 → 注入 system prompt 底部
     │
     └── AgentService.run(context)  ← 无变化
```

---

## 三、模块设计

### 3.1 新增模块 `backend/src/rag/`

```
backend/src/rag/
├── rag.module.ts
├── rag.controller.ts          # POST /api/rag/upload, GET /api/rag/docs/:sessionId
├── rag.service.ts             # 主编排：upload 流程 + retrieve 流程
├── document-parser.service.ts # 文档 → 纯文本
├── chunking.service.ts        # 纯文本 → Chunk[]
├── embedding.service.ts       # Chunk[] → 带向量的 Chunk[]
├── vector-store.service.ts    # 持久化 + 相似度查询
└── interfaces/
    └── rag.interfaces.ts      # Document, Chunk, RetrievedChunk
```

### 3.2 核心接口

```typescript
// rag.interfaces.ts

interface RagDocument {
  id: string;               // nanoid
  sessionId: string;
  filename: string;
  mimeType: string;
  uploadedAt: number;
  chunkCount: number;
}

interface Chunk {
  id: string;               // `${docId}-${index}`
  docId: string;
  sessionId: string;
  text: string;
  index: number;
  vector?: number[];        // 存储时写入
}

interface RetrievedChunk {
  text: string;
  docId: string;
  filename: string;
  score: number;            // 余弦相似度 0–1
}
```

### 3.3 DocumentParserService

```typescript
// document-parser.service.ts

async parse(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return (await pdfParse(buffer)).text;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return (await mammoth.extractRawText({ buffer })).value;
    case 'text/plain':
      return buffer.toString('utf-8');
    default:
      throw new BadRequestException(`不支持的文件类型: ${mimeType}`);
  }
}
```

支持格式：

| 格式 | MIME | 解析库 |
|------|------|--------|
| PDF | `application/pdf` | `pdf-parse` |
| Word (.docx) | `application/vnd.openxmlformats-...` | `mammoth` |
| 纯文本 | `text/plain` | Node.js Buffer |

### 3.4 ChunkingService

固定窗口分块，相邻块有重叠，确保跨段语义不丢失：

```
参数（可配置，暂硬编码）：
  chunkSize   = 500 tokens（约 750 中文字符 / 1000 英文字符）
  chunkOverlap = 100 tokens
```

实现：按段落（`\n\n`）优先切割，段落过长再按 chunkSize 强制切割，保证每块不超过 500 tokens。

### 3.5 EmbeddingService

使用 DeepSeek Embedding API（`deepseek-embedding` 模型），批量请求：

```typescript
// embedding.service.ts
pip install zai-sdk

调用示例
from zai import ZhipuAiClient

client = ZhipuAiClient(api_key="your api key")
response = client.embeddings.create(
    model="embedding-3", #填写需要调用的模型编码
    input=[
        "美食非常美味，服务员也很友好。",
        "这部电影既刺激又令人兴奋。",
        "阅读书籍是扩展知识的好方法。"
    ],
)
print(response)

async embed(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.deepseek.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.configService.get('DEEPSEEK_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'embedding-3',
      input: texts,
    }),
  });
  const data = await response.json();
  return data.data.map((d: any) => d.embedding);
}
```

批量上限：每次最多 100 条，超出分批请求。


### 3.6 VectorStoreService

**存储格式：**

```
data/vectors/
└── <sessionId>/
    └── <docId>.json        # 包含文档元数据 + 所有 chunks + 向量
```

```typescript
// 文件内容结构
interface VectorFile {
  doc: RagDocument;
  chunks: Chunk[];          // chunk.vector 已填充
}
```

**检索算法：**

```typescript
async retrieve(sessionId: string, queryVector: number[], topK = 5): Promise<RetrievedChunk[]> {
  // 1. 扫描 data/vectors/<sessionId>/ 下所有 .json 文件
  // 2. 对每个 chunk 计算余弦相似度
  // 3. 排序取 TopK
  // 4. score 低于阈值（0.3）的过滤掉
  return topResults;
}

// 余弦相似度（纯 JS，无需 BLAS）
function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**性能说明：** 每个 session 预期文档数 ≤ 10，总 chunk 数 ≤ 5000，线性扫描（O(n)）延迟 < 50ms，无需引入向量数据库。

### 3.7 RAGService（编排层）

```typescript
// rag.service.ts

// 上传流程
async upload(file: Express.Multer.File, sessionId: string): Promise<RagDocument> {
  const text = await this.parser.parse(file.buffer, file.mimetype);
  const chunks = this.chunking.split(text, docId, sessionId);
  const vectors = await this.embedding.embed(chunks.map(c => c.text));
  chunks.forEach((c, i) => (c.vector = vectors[i]));
  return this.vectorStore.save(doc, chunks);
}

// 检索流程（供 AgentController 调用）
async retrieve(sessionId: string, query: string): Promise<RetrievedChunk[]> {
  const [queryVector] = await this.embedding.embed([query]);
  return this.vectorStore.retrieve(sessionId, queryVector);
}
```

### 3.8 注入 AgentController

在 `agent.controller.ts` 的 `assemble()` 逻辑里，新增 RAG 检索步骤：

```typescript
// agent.controller.ts（修改部分）

// 1. 检索文档片段
const chunks = await this.ragService.retrieve(sessionId, userMessage);

// 2. 构造 RAG 上下文字符串
const ragContext = chunks.length > 0
  ? `\n\n---\n以下是用户上传的相关文档片段（按相关度排序）：\n\n` +
    chunks.map((c, i) => `【片段 ${i + 1}（${c.filename}，相关度 ${(c.score * 100).toFixed(0)}%）】\n${c.text}`).join('\n\n')
  : '';

// 3. 注入 system prompt 末尾（不改变 AgentContext 结构）
context.system = skillConfig.systemPrompt + ragContext;
```

**关键设计：** RAG 上下文注入 `system` 字段末尾，不修改 `messages` 数组，不改变 `AgentContext` 接口，对 `AgentService` 完全透明。

---

## 四、API 端点

### RAG 专属端点

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/rag/upload` | 上传文档，`multipart/form-data`，字段 `file` + `sessionId` |
| `GET` | `/api/rag/docs/:sessionId` | 列出该 Session 下所有已上传文档 |
| `DELETE` | `/api/rag/docs/:sessionId/:docId` | 删除指定文档（清除向量文件） |

### 请求 / 响应示例

**上传：**
```
POST /api/rag/upload
Content-Type: multipart/form-data

file: <binary>
sessionId: "sess_abc123"

→ 200 { docId, filename, chunkCount, uploadedAt }
```

**文档列表：**
```
GET /api/rag/docs/sess_abc123

→ 200 [{ id, filename, chunkCount, uploadedAt }, ...]
```

---

## 五、前端改动

### 5.1 ChatInput — 新增「+」按钮

在输入框左侧添加 `+` 图标按钮，点击触发 `<input type="file">` 隐藏元素：

```
┌─────────────────────────────────────────────┐
│ [+]  输入消息...                    [发送 ↑] │
└─────────────────────────────────────────────┘
    ↑
    点击弹出文件选择，accept=".pdf,.docx,.txt"
```

上传流程：

```
用户选择文件
  → 前端 POST /api/rag/upload (multipart)
  → 显示上传进度条（Uploading...）
  → 成功后在输入框上方显示文件标签 [📄 report.pdf ×]
  → 可继续上传多个文件，也可点 × 删除
  → 发送消息时文件已经处理完毕，不额外传参
```

### 5.2 新增组件 `FileChip.tsx`

显示已上传文件的标签，支持删除：

```
[📄 report.pdf ×]  [📄 Q3-earnings.docx ×]
```

### 5.3 新增 `api/rag.ts`

```typescript
export async function uploadDocument(file: File, sessionId: string): Promise<RagDocument>
export async function listDocuments(sessionId: string): Promise<RagDocument[]>
export async function deleteDocument(sessionId: string, docId: string): Promise<void>
```

### 5.4 ChatPanel 改动

- 维护 `uploadedDocs: RagDocument[]` 状态，Session 切换时加载该 Session 的文档列表
- 上传成功追加到列表；删除时调用 DELETE 接口并从列表移除
- 有上传文档时，消息发送前无需额外处理（RAG 检索在后端自动触发）

---

## 六、数据存储

```
data/
├── sessions/         # 现有，不变
├── reports/          # 现有，不变
├── monitor-config.json
└── vectors/          # 新增
    └── <sessionId>/
        └── <docId>.json    # VectorFile（元数据 + chunks + 向量）
```

单文件大小估算（500 chunks × 1536 维向量 × 4 bytes ≈ 3 MB），单 Session 上传 10 份文档约 30 MB，可接受。

---

## 七、新增依赖

| 包 | 用途 | 大小 |
|----|------|------|
| `pdf-parse` | PDF 文本提取 | 轻量，无 native 依赖 |
| `mammoth` | .docx 文本提取 | 纯 JS |
| `@nestjs/platform-express` | Multer 文件上传（NestJS 已内置） | — |
| `nanoid` | 生成 docId（已有？） | 轻量 |

无需引入向量数据库（如 Chroma、Qdrant、pgvector），JSON 文件存储即可满足当前规模。

---

## 八、不改动的内容

| 模块 | 原因 |
|------|------|
| `AgentService` | 只接收 `AgentContext`，RAG 注入在上游完成 |
| `SkillRegistry` | Skill 定义不变，RAG 是运行时叠加层 |
| `SessionService` | Session 结构不变，向量文件独立存储 |
| `MonitorService` | 独立 pipeline，与 RAG 无交集 |
| `FeishuService` | 无变化 |
| 前端 `AssistantBubble` | 消息渲染无变化 |
| 前端 `Sidebar` | Session 管理逻辑无变化 |

---

## 九、实施阶段

```
Phase A — 后端 RAG 基础设施（后端先行）
  ├── 安装依赖：pdf-parse, mammoth
  ├── 新建 rag/ 模块（5 个 service + controller）
  ├── POST /api/rag/upload 上传 + 解析 + 向量化 + 存储
  ├── GET  /api/rag/docs/:sessionId 文档列表
  └── DELETE /api/rag/docs/:sessionId/:docId

Phase B — Agent 集成（接入检索）
  ├── agent.controller.ts 引入 RagService
  ├── 在 assemble() 里调用 retrieve()
  └── 将检索片段注入 system prompt 末尾

Phase C — 前端上传 UI
  ├── ChatInput 新增「+」按钮 + 隐藏 file input
  ├── 新建 FileChip.tsx 组件
  ├── 新建 api/rag.ts
  └── ChatPanel 维护 uploadedDocs 状态 + 加载逻辑

Phase D — 打磨（可选）
  ├── 上传进度 SSE（大文件向量化耗时较长时提示）
  ├── 文档管理面板（在 Sidebar 或单独 tab 展示）
  └── 多文档跨 Session 引用（高级功能，暂不规划）
```

---

## 十、关键设计决策 & 权衡

| 决策 | 选择 | 理由 |
|------|------|------|
| 向量数据库 | JSON 文件 | 与项目现有存储风格一致；当前规模无需引入独立服务 |
| Embedding 模型 | DeepSeek Embedding | 复用现有 API Key，无需新账户；中文支持好 |
| 分块策略 | 固定窗口 + 段落优先 | 实现简单，效果可接受；后续可换成语义分块 |
| 注入位置 | system prompt 末尾 | 不破坏 AgentContext 接口，对 AgentService 透明 |
| 检索算法 | 余弦相似度线性扫描 | 5000 chunks 内 < 50ms，无需 HNSW 等近似算法 |
| 文件存储位置 | `data/vectors/<sessionId>/` | 与 sessions / reports 风格对齐，Session 级隔离 |
| 前端触发方式 | 「+」按钮 | 与主流 Chat UI（ChatGPT、Claude）习惯一致 |
