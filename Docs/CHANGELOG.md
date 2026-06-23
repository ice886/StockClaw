# 开发日志

## 2026-06-23 — Monitor sidebar 股票信号速览

### 股票信号从主面板移至 sidebar

- 新增 `useLatestSignals` hook：拉取最新报告信号，按置信度降序
- 新增 `SignalOverview` 组件：sidebar 信号速览，每行 ticker + 方向箭头 + 置信度，点击就地展开 reasoning/程度/时间窗
- `App.tsx` 新增 `monitorRefreshKey`：扫描完成后通知 sidebar 刷新信号
- `MonitorDashboard` 移除左侧信号栏，主面板改为单栏事件流（全宽）
- 方向/程度/时间窗标签抽到共享 `signalLabels.ts`，`StockSignalCard` 与 `SignalOverview` 共用

## 2026-06-23 — RAG 混合检索（BM25 + 向量 + RRF）

### 新增 BM25 词法检索路，与向量检索 RRF 融合

- 新增 `Bm25Service`：bigram 中文分词 + 标准 BM25 打分（k1=1.5, b=0.75），纯计算无 IO，查询时实时统计 idf/avgdl，不持久化索引
- `VectorStoreService` 新增 `loadChunks()` 暴露原始 chunk 供两路复用
- `RagService.retrieve()` 改为混合检索：向量路（cosine）+ 词法路（BM25），RRF 融合（k=60）后取 TopK；移除余弦绝对阈值，改由 TopK 截断；向量路失败可降级为仅 BM25
- 接口 `RetrievedChunk` 不变，`score` 语义改为融合分；前端契约不变
- 测试：`bm25.service.spec.ts`（分词 + 打分 8 例）、`rag.service.spec.ts`（RRF 融合 3 例）；为兼容 Prisma v7 生成 client 的 `.js` 导入，jest 配置新增 `moduleNameMapper`

## 2026-06-23 — v7 数据库集成（Phase E 清理）

### Phase E — 收尾清理

**运行时数据脱离 git 跟踪（以 SQLite 为单一数据源）：**

- `.gitignore` 新增 `data/sessions/`、`data/reports/`、`data/monitor-config.json`、`data/vectors/`（与已有的 `data/*.db` 规则一致）
- `git rm -r --cached` 停止跟踪上述运行时文件；磁盘文件保留作回滚备份，不删除
- 此后所有结构化数据以 `data/app.db` 为权威来源，旧 JSON 仅为迁移前历史快照

**代码清理：**

- `SessionService` 的 fs 操作已在 Phase B 移除，无残留
- `MonitorService` 的 fs/path 操作已在 Phase D 移除
- 唯一保留 fs 的业务服务是 `vector-store.service.ts`——按 v7 §十二 决策，向量文件存储不变（非清理目标）

**文档同步：**

- `CLAUDE.md`：新增 "Data storage" 段（Prisma/SQLite 模型归属表 + 迁移说明），修正模块表 `session/` 行与 Monitor pipeline 中的 JSON 文件引用
- `Docs/StockClaw_Architecture_v7.md`：Phase D / E 标记完成

## 2026-06-23 — v7 数据库集成（Phase D MonitorService 替换）

### Phase D — MonitorService 切换到 Prisma

**实现替换（接口签名 / 前端契约不变）：**

- `monitor.service.ts`：移除全部 `fs`/`path` 文件 I/O，注入 `PrismaService`
  - `getConfig` / `saveConfig`：改用 `monitorConfig.upsert`（单行约定 `id=1`，配置 JSON 序列化进 `data` 列）
  - `saveReport`：`report.upsert`——完整报告 JSON 存 `data` 列；`celebrity` 列存去重后的名人姓名列表（逗号连接），仅作检索辅助（报告去重后可能跨多位名人）
  - `getReport` / `listReports` / `getLatestReportEvents`：`findUnique` / `findMany`（`createdAt desc` 取最近 50）/ `findFirst`
  - 上述方法全部转为 `async`
- `monitor.controller.ts` / `monitor.scheduler.ts`：调用方对 `getConfig` / `markFeishuSent` / `getReport` 加 `await`；`getStatus` / `getConfig` 路由处理器改 async；路由与签名不变（`listReports` / `getReport` 返回 Promise，由 Nest 自动解析）

**数据迁移：**

- `scripts/migrate-to-db.ts`：拆为 `migrateSessions` / `migrateReports` / `migrateConfig` 三段，幂等可重跑
  - reports：读取 `data/reports/*.json` → `report.create`（同 id 跳过），`createdAt` 取自 `generatedAt`，`celebrity` 列同服务端逻辑去重生成
  - config：读取 `data/monitor-config.json` → `monitorConfig.upsert(id=1)`，入库前校验合法 JSON
- 迁移结果：**1 份历史报告 + monitor-config** 入库（sessions 目录已在 Phase B 归档）

**回归测试（真实 DB + 运行中后端）：**

- `npm run build` 通过；`npm run db:migrate-data` 迁移成功
- 端点验证：`GET status / config / reports / reports/:id` 均从 DB 正确返回（报告 14 事件 / 11 信号，feishuSent=true）
- 写入 roundtrip：`PUT config {signalThreshold:70}` → API 回读 70 → 直连 DB 确认 `data` 列已持久化 70（证明 upsert 写路径生效）
- 注：原 `monitor-config.json` 无 `signalThreshold` 字段，迁移忠实保留为 `undefined`，运行时由 `?? 65` 兜底

## 2026-06-23 — v7 数据库集成（Phase C RagService 元数据替换）

### Phase C — RagService 文档元数据切换到 Prisma

**职责切分（元数据进 DB，向量留文件）：**

- 文档元数据（filename / mimeType / chunkCount / uploadedAt）→ Prisma `RagDocument` 表（结构化，需查询 + 级联删除）
- chunks + 向量 → 保留 JSON 文件 `data/vectors/<sessionId>/<docId>.json`（非结构化、体积大，SQLite BLOB 无优势——符合 v7 §十二 决策）

**实现替换（接口签名 / 前端契约不变）：**

- `interfaces/rag.interfaces.ts`：`VectorFile` 去掉 `doc` 字段，只剩 `chunks`
- `vector-store.service.ts`：改为纯向量存储——`save(sessionId, docId, chunks)`；删除 `listDocs`；`retrieve()` 新增 `filenames: Record<docId, filename>` 入参，由 RagService 从 DB 查出后传入，保持本服务无 DB 依赖
- `rag.service.ts`：注入 `PrismaService`
  - `upload`：先写向量文件 → 再 `prisma.ragDocument.create`（先文件后 DB，DB 为文档存在性权威来源，避免幽灵文档）
  - `listDocuments`：`findMany`（按 `uploadedAt desc`）
  - `retrieve`：先查 DB 拿 docId→filename 映射 → 传给 VectorStore 做余弦检索
  - `deleteDocument`：`prisma.ragDocument.delete`（**权威**）+ 向量文件 `unlink`（尽力而为，失败不影响结果）
  - `toDoc()` 转换层：Prisma `Date` → epoch ms，`RagDocument` 接口与前端契约不变
- `rag.controller.ts` / `rag.module.ts`：无需改（PrismaService 来自 `@Global()` DatabaseModule，API 签名不变）

**回归测试（真实 DB + 智谱 embedding）：** upload → DB 有元数据（filename/chunkCount 正确）→ listDocuments → retrieve（命中 score 0.419）→ deleteDocument → DB 与 list 均清空、无残留

## 2026-06-23 — v7 数据库集成（Phase B SessionService 替换）

### Phase B — SessionService 切换到 Prisma

**实现替换（接口签名不变，前端无感）：**

- `session.service.ts`：注入 `PrismaService`，5 个方法全部改用 Prisma
  - `createSession`：`prisma.session.create`
  - `getSessions`：`findMany` + `include messages`（按 `updatedAt desc` / 消息 `createdAt asc`）
  - `getSession`：`findUnique`，未命中返回 `undefined`（保持原行为）
  - `updateSession`：全量覆盖语义——`$transaction` 内 `deleteMany` 旧消息 → `createMany` 重建 → 更新标题
  - `deleteSession`：`prisma.session.delete`，靠 schema `onDelete: Cascade` 级联删消息
- `toRecord()` 转换层：Prisma `Date` → epoch ms，`SessionRecord` 接口与前端契约不变
- 消息无原始 id/时间戳，按数组顺序赋递增 `createdAt`（`now + i`）保证读取时顺序还原

**数据迁移：**

- `scripts/migrate-to-db.ts`：读取 `data/sessions/*.json` → 写入 Session + Message 表；幂等（同 id 跳过），原 JSON 保留可回滚
- 迁移结果：**5 个 session / 49 条消息**全部入库，二次运行全部跳过、零重复
- 运行方式：`npm run db:migrate-data`（`tsc -p tsconfig.scripts.json` 编译脚本 + generated client → `dist-scripts/` → node 运行）。直接 ts-node 因 generated client 的 `.js` 显式导入无法解析，故走编译产物

**工程：**

- `tsconfig.build.json` 额外排除 `scripts`（否则 rootDir 上抬导致 `dist/main.js` 路径错位）
- 新增 `tsconfig.scripts.json`（CommonJS，emit 到 `dist-scripts/`）；`.gitignore` 忽略 `dist-scripts/`
- `package.json` 新增 `db:migrate-data` 脚本

**回归测试（真实 API）：** 迁移数据读取正常（5 session）→ CREATE → UPDATE（写 2 条消息）→ GET（标题/消息顺序/内容正确）→ DELETE → 再 GET 返回空；级联删除验证：删带 3 条消息的 session 后，Message 表对应行清零、总数 52→49 无孤儿

## 2026-06-23 — v7 数据库集成（Phase A 基础设施）

### Phase A — Prisma + SQLite 基础设施

**新增依赖（`backend/`）：** `prisma`、`@prisma/client`、`better-sqlite3`、`@prisma/adapter-better-sqlite3`

**Prisma Schema（`prisma/schema.prisma`）：** 5 个 model——`Session` / `Message` / `RagDocument` / `Report` / `MonitorConfig`；`Message`、`RagDocument` 对 `Session` 设 `onDelete: Cascade`

**迁移：** `prisma migrate dev --name init` → `prisma/migrations/20260623030612_init`，数据库落在 `backend/data/app.db`

**新增模块 `database/`：**

- `prisma.service.ts`：`extends PrismaClient`，构造时注入 `PrismaBetterSqlite3` adapter，`onModuleInit/Destroy` 管理 `$connect/$disconnect`
- `database.module.ts`：`@Global()`，导出 `PrismaService`，各模块无需重复 import
- `app.module.ts`：注册 `DatabaseModule`

**验证：** `npm run build` 通过；启动日志 `DatabaseModule dependencies initialized` + `Nest application successfully started`，adapter 连接无错，CRUD + 级联删除冒烟通过

### 与 v7 架构文档的偏离（实装 Prisma 7.8，文档按 Prisma 6 写）

| 项 | 文档（Prisma 6） | 实装（Prisma 7） |
|------|------|------|
| datasource url | 写在 `schema.prisma` | Prisma 7 禁止，移到 `backend/prisma.config.ts`，仅供 CLI |
| SQLite 连接 | 内置连接器，"不需要 better-sqlite3" | 必须经 driver adapter，`PrismaService` 注入 `PrismaBetterSqlite3` |
| client 生成 | `node_modules/.prisma/client`，provider `prisma-client-js` | provider `prisma-client` + `output` 到 `backend/src/generated/prisma`，加 `moduleFormat = "cjs"` 匹配项目 CommonJS |
| 数据库位置 | 仓库根 `data/app.db` | 后端以 `backend/` 为 cwd，与现有 sessions/reports 同目录 → `backend/data/app.db` |

**工程：** `backend/package.json` 加 `postinstall: prisma generate`（生成物 gitignore，安装时自动重建）+ `db:generate` / `db:migrate` 脚本；`eslint.config.mjs` 与 `.gitignore` 忽略 `src/generated/`；`tsconfig.build.json` 排除 `prisma.config.ts`（避免 rootDir 上抬导致 `dist/main.js` 路径错位）

**遗留（与 Phase A 无关）：** `app.module.ts` 的 `SkillModule` 为未使用导入（lint 报错），改动前已存在，未处理

## 2026-06-22 — v6 RAG 文档问答（Phase A + B）

### Phase A — 后端 RAG 基础设施

**新增模块：`rag/`**

- **DocumentParserService**：PDF（`pdf-parse`）/ Word（`mammoth`）/ TXT 三格式 → 纯文本，非法类型抛 `BadRequestException`
- **ChunkingService**：段落优先 + 固定窗口（750 字/150 重叠）分块；超长段落强制切割保证单块不超限
- **EmbeddingService**：接入智谱 `embedding-3` 模型（`open.bigmodel.cn`），64 条/批自动分批，响应按 index 排序保证输入输出对齐
- **VectorStoreService**：JSON 文件持久化（`data/vectors/<sessionId>/<docId>.json`），检索时扫描全部 chunk 做余弦相似度排序，取 Top-5，过滤 score < 0.3
- **RagService**：上传编排（parse → chunk → embed → save）+ 检索编排（embed query → cosine topK），文件名 latin1→utf-8 解码
- **RagController**：`POST /api/rag/upload`（20 MB 上限）、`GET /api/rag/docs/:sessionId`、`DELETE /api/rag/docs/:sessionId/:docId`
- **RagModule**：独立模块，导入 `ConfigModule`，导出 `RagService`

**安装依赖：** `pdf-parse`、`mammoth`、`@types/multer`

### Phase B — Agent 集成（检索接入对话）

**Backend：**

- **AgentModule** 导入 `RagModule`，使 `RagService` 可注入 `AgentController`
- **AgentController** 改造：
  - `ChatRequestDto` 新增可选 `sessionId` 字段
  - 新增 `resolveSystem()` 方法：提取最后一条 user message → `RagService.retrieve()` → 检索片段拼入 system prompt 末尾
  - `chat()` / `chatStream()` 均调用 `resolveSystem()` 组装 system prompt
  - 无 session / 无匹配文档时退化为原始 skill prompt，对无上传场景完全透明

**Frontend：**

- `api/agent.ts`：`sendMessage()` / `sendMessageStream()` 新增可选 `sessionId` 参数，透传到 JSON body
- `ChatPanel.tsx`：两处发送调用（`handleSend` / `handleEdit`）传入 `sessionId ?? undefined`

### 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Embedding 提供商 | 智谱 `embedding-3` | DeepSeek 无 Embedding API；`.env` 已有 `ZHIPUAI_API_KEY` |
| ID 生成 | `Math.random().toString(36)` | 复用 `SessionService` 风格，避免引入 ESM-only 的 nanoid v5 |
| 注入位置 | system prompt 末尾 | 不改变 `AgentContext` 接口，对 `AgentService` 完全透明 |
| 未上传时行为 | 跳过检索，skill prompt 不变 | 对无文档用户零影响 |

### Phase C — 前端上传 UI

**新增文件（`frontend/src/`）：**

- `types/rag.ts`：`RagDocument` 类型，对齐后端接口
- `api/rag.ts`：`uploadDocument()`（FormData multipart）、`listDocuments()`、`deleteDocument()` 三个调用
- `components/FileChip.tsx` + `.css`：文件标签 `[📄 report.pdf ×]`，支持 `uploading` 态（spinner 替代 × 按钮）

**修改：**

- `ChatInput.tsx`：新增可选 props（`docs` / `uploadingNames` / `onUpload` / `onRemoveDoc`）；输入框左侧加 `+` 按钮 + 隐藏 `<input type="file" accept=".pdf,.docx,.txt" multiple>`；输入框上方渲染 chips 行；props 全可选，未传时退化为原始输入框
- `ChatInput.css`：新增 `.chat-input-wrap` / `.chat-input-chips` / `.upload-btn`，`border-top` 上移到 wrap
- `ChatPanel.tsx`：维护 `docs` + `uploadingNames` 状态；session 切换时 `listDocuments()` 加载；`handleUpload`（逐文件上传、失败隔离）+ `handleRemoveDoc`（DELETE + 移除）；透传给 ChatInput

### Phase C 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 上传进度展示 | chip 上 spinner | `fetch` 无原生上传进度事件，spinner 比文字进度条更轻量 |
| 多文件上传 | `multiple` + 逐个上传 | 单个文件失败不阻断其余 |
| 发送时传参 | 不额外传参 | 上传即向量化入库，后端 `resolveSystem` 自动检索注入 |

## 2026-06-13 (2)

### P0 — 正确性 & 性能

- **Zod 替换类型断言**：`EventExtractorService` 引入 `ExtractedEventSchema`，`StockAnalyzerService` 引入 `AnalysisResponseSchema`，在解析边界收窄 `sourceType` / `importance` / `direction` 类型，移除全部 `as 'high'` 补丁
- **MonitorService 并行化**：串行 `for` 循环改为 `Promise.all` + `pLimit(3)`，5 位名人并行处理，运行时间从 ~60s 降至 ~15s
- **删除 `celebrity.interface.ts`**：与 `celebrities.config.ts` 重复定义，统一到后者
- **安装依赖**：`zod`（schema 校验）、`p-limit`（并发控制）

### P1 — 数据质量

- **EventDeduplicatorService**（新服务）：三级去重策略——① URL 精确匹配 ② Jaccard title 相似度 > 0.85 ③ 同名人 + ticker + 6h 时间窗口重叠；返回 `{ newEvents, mergedCount, filteredCount }`
- **EventExtractor few-shot 示例**：system prompt 注入 5 条标注好的评级示例（2 条 high、1 条 medium、2 条 low），稳定 importance 评级，减少 high↔medium 漂移
- **StockAnalyzer 置信度矩阵**：显式定义 90–100 / 70–89 / 50–69 / 30–49 / <30 五个区间的含义，消除模型自由打分导致的 85–90 虚高问题

### P2 — 产品体验

- **增量推送**：每次运行对比上次报告，只推送新事件（sourceUrl + title hash 去重），同一事件不重复推送
- **`signalThreshold` 可配置**：`MonitorConfig` 新增字段（默认 65），替换原硬编码阈值，支持通过 `PUT /api/monitor/config` 调整
- **飞书卡片改版**：按名人分组展示高影响事件，移除 medium/low 信号条目（信息密度过高），只保留高置信信号汇总
- **Dashboard 左右分栏**：信号看板固定在左侧（280px sticky），事件流在右侧，替代原纵向列表
- **EventCard 🆕 徽章**：最新报告的事件显示 🆕 标记
- **ReportHistory 翻页**：每页 10 条，避免报告积累后全量加载性能下降
- **Dashboard 自动刷新**：每 5 分钟调用 `GET /api/monitor/status`，无需手动刷新


### Phase C — 前端监控面板

**新增文件（`frontend/src/`）：**

- `types/monitor.ts`：前端类型定义——`Celebrity`、`CelebrityEvent`、`StockSignal`、`MonitorReport`、`MonitorReportSummary`、`MonitorConfig`、`MonitorStatus`、`RunProgressEvent`
- `api/monitor.ts`：全部 Monitor REST 调用封装；`runMonitor()` 实现 SSE 异步生成器，逐事件 yield `RunProgressEvent`
- `hooks/useMonitor.ts`：封装状态管理——`status`、`reports`、`running`、`progressLog`、`error`；`run()` 消费 SSE 并更新进度日志

**新增组件（`components/monitor/`）：**

- `EventCard`：事件卡片，高/中/低影响配色左边框（红/黄/灰），显示名人、时间差、来源链接
- `StockSignalCard`：信号卡片，看涨/看跌/中性顶部色条 + 置信度进度条 + 推理摘要
- `ConfigDrawer`：右侧抽屉，支持启用开关、监控间隔选择（1h/2h/4h/8h/24h）、名人复选、飞书 Webhook 输入，PUT `/api/monitor/config` 保存
- `ReportHistory`：可展开历史报告列表，内嵌 `StockSignalCard` + `EventCard`，支持「重发飞书」（POST `/api/monitor/reports/:id/resend`）
- `MonitorDashboard`：主面板——状态头（运行状态圆点 + 下次运行倒计时）、SSE 运行进度条、统计 Bar（名人数/报告数/间隔/飞书状态）、Tab 切换（最新报告 / 历史记录）

**修改：**

- `Sidebar`：顶部新增 💬 Chat / 📡 Monitor 导航 tab，Monitor 模式下隐藏会话列表；接收 `activeView` / `onViewChange` props
- `App.tsx`：增加 `activeView` 状态，按视图渲染 `MonitorDashboard` 或 `ChatPanel`

## 2026-06-13

### Monitor pipeline bug fixes

- **CrawlerService**：修复 `webSearch().execute()` 返回值解析——SDK 返回 `{ results: [...] }` 而非裸数组，导致 `Array.isArray()` 始终为 false、所有搜索结果被丢弃。新增 `ExaResult`/`ExaResponse` 类型替换 `any`，移除 `slice(0, 2)` 让全部 searchKeywords 参与查询
- **EventExtractorService**：新增 `ExtractedEvent` 接口替换 `any` 类型
- **FeishuService**：卡片标题和页脚 `StackClaw` → `StockClaw`；事件卡片新增发布时间显示（`MM-DD HH:MM`）
- **配置**：`monitor-config.json` 同步全部 3 位名人；扫描间隔 4h → 6h；更新飞书群机器人 webhook
- **工程**：删除空壳 interface 文件（`stock-signal.interface.ts`、`monitor-config.interface.ts`）；ESLint 全零错误

## 2026-06-12

### Phase A — 名人事件监控后端（celebrity monitor pipeline）

**新模块：`monitor/`**

- **CrawlerService**：封装 Exa `webSearch`，每位名人执行 3 条差异化查询（公告/合作、股票关联、关键词），结果按 URL 去重
- **EventExtractorService**：将原始搜索结果喂给 DeepSeek，提取结构化 `CelebrityEvent[]`（title、summary、sourceType、importance），JSON 输出含容错解析（strip code fence + regex fallback）
- **StockAnalyzerService**：对 high/medium 事件调用 DeepSeek，输出 `StockSignal[]`（ticker、direction、magnitude、confidence 0-100、reasoning、timeHorizon）
- **MonitorService**：串联抓取→提取→分析全流程，报告持久化为 `data/reports/<id>.json`，配置持久化为 `data/monitor-config.json`
- **MonitorScheduler**：`@Cron('0 */4 * * *')` 定时触发，调用 `FeishuService` 推送；支持手动触发
- **MonitorController**：7 个端点（status / config / run / reports / reports/:id / reports/:id/resend），`POST /run` 返回 SSE 实时进度流

**新模块：`feishu/`**

- **FeishuService**：构建飞书 interactive card，高影响事件时 header 标红，卡片含事件详情、股票信号方向/置信度星级、注脚免责声明
- **FeishuModule**：独立模块，导出 `FeishuService` 供 `MonitorModule` 使用

**新 Skill：**

- `celebrity-monitor`：动态注入当前日期，事件提取专用 prompt，含重要性判断标准和过滤规则
- `stock-analysis`：动态注入当前日期，量化分析框架，置信度分级标准

**配置：**

- `src/config/celebrities.config.ts`：5 位初始监控名人（黄仁勋/苏姿丰/奥特曼/马斯克/扎克伯格）及各自主要/关联股票映射
- `.env` 新增 `FEISHU_WEBHOOK_URL`、`MONITOR_INTERVAL_HOURS`、`MONITOR_ENABLED`
- `app.module.ts`：引入 `MonitorModule`，`ConfigModule` 改为 `isGlobal: true`
- 安装依赖：`@nestjs/schedule`、`axios`

## 2026-06-10

暂停，在想harness engineering怎么做

## 2026-06-09

### Phase 6 — 流式输出

- **agent.service.ts**：新增 `runStream()`，用 `streamText` + `fullStream` 替代 `generateText`，返回 `AsyncGenerator<AgentStreamEvent>`
- **agent.controller.ts**：新增 `POST /api/chat/stream` SSE 端点，`text/event-stream` + `res.write()` 逐事件推送
- **前端 sendMessageStream**：`fetch` + `ReadableStream.getReader()` 解析 SSE `data:` 帧
- **ChatPanel 流式改造**：`handleSend` / `handleEdit` 插入空 assistant 占位 → 逐 text-delta 更新最后一条消息，用户看到文字逐字出现
- **tool-input-start 处理**：DeepSeek 最早的工具调用信号，映射为 `tool-call` 事件发给前端
- **tool-error 处理**：工具执行失败时前端清除指示器，不终止整个响应

### 前端 — 工具执行状态指示器

- **呼吸圆点动画**：3 个 8px 圆点依次跳动（`breathe` keyframe，各延迟 0s/0.2s/0.4s），替代旧的「思考中...」文字
- **工具名标签**：`🔧 {toolName}` 胶囊样式，工具调用时显示
- **反闪烁设计**：badge 一出现即持续可见，tool-result 后不清除，只在 text-delta 时清除；CSS `transition` 替代 `animation`，消除重播闪烁
- **门控逻辑**：`{(loading || toolName) && ...}` — 文字输出中再次调用工具时 badge 仍能显示

### 前端 — 样式修复

- **代码块横向溢出**：flex 链（ChatPanel → message-list → message）加 `min-width: 0`，`pre` 加 `overflow-x: auto`，长代码行不再撑开窗口
- **Copy/Edit 图标跳动修复**：`.label` 从 `display: none/block` 改为 `position: absolute` + `visibility: hidden/visible`，脱离文档流消除左右/上下跳动
- **图标大小**：📋 ✏️ 从 13px → 15px

### 前端 — 输入交互

- **上键历史召回**：`↑` 空输入框时回填上一条 user message，连续按 ↑ 浏览更早历史，`↓` 回到更新消息，手动输入或发送后重置

### 后端 — 动态日期注入

- **web-research skill**：`systemPrompt` 从静态字符串改为 `() => string`，每次调用时用 `Date.now()` 生成中文日期（如「今天的日期是 2026年6月9日星期二」）
- **SkillConfig 接口**：`systemPrompt` 类型放宽为 `string | (() => string)`
- **SkillRegistry.resolvePrompt()**：自动判断并求值

### 工程

- 确认 `backend/.env` 未进入 git 历史，创建 `backend/.env.example` 模板

## 2026-06-08

### 前端 — Skill 选择器

- **SkillSelector 组件**：ChatPanel 顶部 tab 栏，切换当前使用的技能（💬 通用对话 / 📁 文件操作 / 🔍 网络调研）
- **技能切换**：选中技能后，后续对话使用该技能的 system prompt + 工具集，不影响已有历史消息
- 从后端 `/api/skills` 动态加载技能列表，icon + name + description

### 后端 — Skill 系统

- **SkillRegistry**：技能注册中心，`get(name)` / `list()`，构造函数预注册 3 个内置技能
- **SkillConfig 接口**：`name`、`description`、`systemPrompt`、`toolNames`、`maxSteps`、`icon`
- **3 个内置技能**：
  - `general-chat`：通用助手，无工具，1 轮回复
  - `file-ops`：文件管理专家，6 个文件系统工具，最多 10 轮 tool-calling
  - `web-research`：调研专家，webSearch 工具，要求引用来源，最多 8 轮
- **agent.service.ts 改造**：根据 `skillName` 查询 SkillRegistry，动态加载对应的 system prompt 和工具集
- **GET /api/skills** 端点：返回所有可用技能列表

### 前端 — Message Markdown 渲染

- **AssistantBubble 组件**：`react-markdown` 渲染 AI 回复，替代纯文本展示
- **语法高亮**：代码块通过 `react-syntax-highlighter` + `oneDark` 主题着色，自动检测语言
- **行内代码**：`` `code` `` 无语言标注且单行 → `inline-code` 样式
- **链接**：`<a>` 统一加 `target="_blank" rel="noopener noreferrer"`
- **表格**：`<table>` 外层包裹 `.table-wrapper` 支持横向滚动

### 前端 — Phase 3 消息操作（Copy + Edit）

- **MessageBubble 组件**：每条消息独立渲染，气泡下方显示操作按钮
- **Copy 消息**：hover message 浮现 📋 图标，hover 图标显示「Copy message」，点击复制到剪贴板
- **Edit 消息**：user 消息 hover 显示 ✏️ 图标，点击进入编辑模式（textarea），Enter 保存并重发，Escape 取消
- **Edit 分叉逻辑**：保留 edit 点之前的消息，丢弃之后的消息，重新发送获取新回复
- **图标交互**：默认透明不可见，hover message 淡入；图标始终占位避免布局跳动

### 前端 — 取消生成

- **ChatInput 取消按钮**：loading 时「发送」→ 灰色「取消」，点击或按 Esc 终止请求
- **前端 AbortController**：`sendMessage` 接受 `AbortSignal`，取消后 text 不清空可重发
- **后端 AbortController**：`req.on('close')` 感知连接断开 → `generateText({ abortSignal })` 停止 LLM 调用
- 取消后静默处理 AbortError，不显示错误消息

## 2026-06-07

### 前端 — Phase 2 Session 侧边栏 + 布局改造

- **新增 Sidebar 侧边栏**：260px 宽度，显示 Session 列表 +「新建对话」按钮 + Recents 标题
- **新增 SessionItem 组件**：单条 Session 展示，hover 显示删除按钮，active 态高亮
- **改造 App 布局**：flex row，Sidebar + ChatPanel 并排；#root 全宽，移除居中约束
- **ChatPanel 改造**：接收 `sessionId`，切换时加载历史消息，发送后自动持久化；`key` 模式管理生命周期
- **标题自动生成**：首次对话后调用 `/api/sessions/generate-title`，DeepSeek 生成 ≤10 字标题
- **MessageList 自动滚底**：`scrollIntoView` 锚点，打开历史 session 时自动滚到最新消息
- **删除 useSessions hook**：单一消费者，逻辑合入 Sidebar，去掉过度抽象

### 后端 — 工具链迁移到 AI SDK

- **agent.service.ts**：裸 fetch DeepSeek API → `generateText()` + `@ai-sdk/deepseek`，90 行 → 40 行
- **工具系统重构**：`server.registerTool()` → AI SDK `tool()` 格式，删除 `tools/registry.ts`、`tools/base.ts`
- **移除 `zod-to-json-schema`**：zod v4 原生 `z.toJSONSchema()` 替代
- **文件系统工具 6 个**：`read_file`、`write_file`、`edit_file`、`list_directory`、`create_directory`、`search_file`
- **删除 chat 中间层**：`chat.service.ts`、`chat.module.ts`、`chat/dto/` 全部删除，`AgentController` 直调 `AgentService`

### 后端 — Session 存储

- **Phase 1 完成**：JSON 文件存储，`data/sessions/{id}.json`，5 个 REST 端点
- **Session 模块**：`session.controller.ts` + `session.service.ts` + `session.interface.ts`
- **generate-title 端点**：`POST /api/sessions/generate-title`，调用 DeepSeek 总结标题

### 前端 — 样式修正

- 消息文字靠左显示（修复 `#root text-align: center` 继承）
- Exa search 简体中文配置（`userLocation: 'CN'`、中文财经源、简体提示词）

## 2026-06-06

### 项目初始化

- NestJS 后端 + Vite React 前端骨架
- DeepSeek API 接入，tool-calling 循环（10 轮上限）
- 前端 chat UI：ChatPanel、ChatInput、MessageList
- Exa `@exalabs/ai-sdk` 集成 `webSearch` 工具
