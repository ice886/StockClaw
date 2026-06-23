# StockClaw Architecture v7 — 数据库集成

> v7 将所有 JSON 文件存储替换为 SQLite 数据库，通过 Prisma ORM 统一管理。向量文件保持不变。各模块的公开接口不变，只替换内部实现。

> **实装说明（2026-06-23）：** Phase A 实际安装的是 **Prisma 7.8**，与本文最初按 Prisma 6 设计的部分写法不同。下文 Schema（§四）/ database 模块（§五）/ 依赖（§九）/ 实施阶段（§十一）各节已更新为 Prisma 7 的实际做法。完整差异另见 `Docs/CHANGELOG.md` 的 v7 Phase A 条目。

---

## 一、问题背景

当前数据层用 JSON 文件模拟数据库，有以下问题：

| 问题 | 现状 | 引发场景 |
|------|------|---------|
| 并发写入不安全 | 多个请求同时写同一文件会损坏数据 | Monitor 定时任务 + 用户聊天同时运行 |
| 无法查询 | 只能全量读取再过滤 | 报告分页、Session 搜索 |
| 无关联完整性 | Session 删除后 RAG 文档元数据孤立 | 手动删除文件后残留 |
| 原子性缺失 | 追加消息 = 读文件 → 修改 → 写文件，三步非原子 | 重启期间写操作中断 |
| 扩展性天花板 | 百条 Session × 千条消息时内存占用陡增 | 长期使用后性能劣化 |

v7 目标：

| 目标 | 说明 |
|------|------|
| 统一存储 | 所有结构化数据进 SQLite |
| 零破坏 | AgentService / SkillRegistry / RAGService（向量层）接口不变 |
| 类型安全 | Prisma 自动生成 TypeScript 类型，消除手写接口与实际存储的漂移 |
| 迁移脚本 | 提供一次性 JSON → SQLite 迁移工具，不丢失历史数据 |

---

## 二、整体架构

```
                        ┌─────────────────────────────────┐
                        │          业务层（不变）            │
                        │  AgentService  MonitorService    │
                        │  SkillRegistry  FeishuService    │
                        └──────────────┬──────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │          服务层（实现替换）         │
                        │  SessionService   RagService     │
                        │  MonitorConfigSvc  ReportService │
                        └──────────────┬──────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │        Prisma Client             │
                        │   (自动生成，类型安全 ORM)          │
                        └──────────────┬──────────────────┘
                                       │
                   ┌───────────────────┼───────────────────┐
                   │                   │                   │
          ┌────────▼───────┐  ┌───────▼────────┐  ┌──────▼──────┐
          │  SQLite 文件    │  │  向量 JSON 文件  │  │  上传临时目录 │
          │  data/app.db   │  │  data/vectors/  │  │  （不变）    │
          └────────────────┘  └────────────────┘  └─────────────┘
```

**关键原则：** Prisma 只出现在各模块的 Service 层，Controller 和上层业务模块无感知。

---

## 三、数据库选型

| 选项 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| SQLite + Prisma | 零部署、文件级备份、Prisma 提供类型安全迁移 | 不支持水平扩展（当前不需要） | ✅ 选用 |
| PostgreSQL + Prisma | 生产级、支持 pgvector | 需要独立服务，增加部署复杂度 | 未来可选 |
| TypeORM + SQLite | NestJS 原生集成 | 迁移管理不如 Prisma 清晰 | 不选 |
| better-sqlite3 裸写 | 轻量 | 无 schema 管理，需手写 SQL | 不选 |

**选用：** `prisma` + `@prisma/client`，数据库文件落在 `data/app.db`。

后续如需切换 PostgreSQL，只需修改 `prisma/schema.prisma` 中的 `provider`，服务层代码不变。

---

## 四、Prisma Schema

Prisma 7 起，数据库 URL **不再允许**写在 `schema.prisma` 的 `datasource` 块里，需移到单独的 `prisma.config.ts`。同时，SQLite 必须通过 driver adapter 连接，不能使用内置驱动。

**`prisma/schema.prisma`**（只声明 provider，不写 url）：

```prisma
// prisma/schema.prisma

generator client {
  // Prisma 7：prisma-client-js 已弃用，改用 prisma-client；
  // 显式 output（schema 在根 prisma/，client 生成进 backend）；
  // moduleFormat=cjs 匹配 backend 的 CommonJS
  provider     = "prisma-client"
  output       = "../backend/src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  // Prisma 7：url 不再写在此处，移到 backend/prisma.config.ts
  provider = "sqlite"
}

model Session {
  id        String    @id
  title     String
  skillName String    @default("general-chat")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  messages  Message[]
  ragDocs   RagDocument[]
}

model Message {
  id        String   @id
  sessionId String
  role      String   // 'user' | 'assistant'
  content   String
  createdAt DateTime @default(now())

  session   Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model RagDocument {
  id         String   @id
  sessionId  String
  filename   String
  mimeType   String
  chunkCount Int
  uploadedAt DateTime @default(now())

  session    Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model Report {
  id        String   @id
  celebrity String
  data      String   // JSON 序列化的报告对象
  createdAt DateTime @default(now())
}

model MonitorConfig {
  id        Int      @id @default(autoincrement())
  data      String   // JSON 序列化的配置对象
  updatedAt DateTime @updatedAt
}
```

**`backend/prisma.config.ts`**（CLI 用的 datasource url 放这里；运行时连接由 `PrismaService` 的 adapter 负责，二者分离）：

```typescript
// backend/prisma.config.ts
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// 后端以 backend/ 为 cwd 运行，业务数据都在 backend/data/，
// app.db 与 sessions/reports 同目录；schema 在仓库根 prisma/。
const root = path.join(__dirname, '..');
const dbPath = path.join(__dirname, 'data', 'app.db');

export default defineConfig({
  schema: path.join(root, 'prisma', 'schema.prisma'),
  datasource: { url: `file:${dbPath}` },
  migrations: { path: path.join(root, 'prisma', 'migrations') },
});
```

> 注意：`prisma.config.ts` 必须放在能解析到 `prisma/config` 模块的位置（即 prisma 所在的 `backend/`），不能放仓库根。`tsconfig.build.json` 需排除此文件，否则 Nest 编译会上抬 rootDir 导致 `dist/main.js` 路径错位。

**关联说明：**

- `Session` → `Message`：`onDelete: Cascade`，删 Session 自动删全部消息
- `Session` → `RagDocument`：`onDelete: Cascade`，删 Session 自动删文档元数据（向量文件由 RagService 手动清理）
- `Report`、`MonitorConfig`：独立表，无外键

---

## 五、新增模块：`database/`

```
backend/src/database/
├── database.module.ts      # 全局单例，提供 PrismaService
└── prisma.service.ts       # extends PrismaClient，处理连接生命周期
```

```typescript
// prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { resolve } from 'node:path';

// 后端以 backend/ 为 cwd，数据库与其它业务数据同在 backend/data/
const DB_URL = `file:${resolve(process.cwd(), 'data', 'app.db')}`;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaBetterSqlite3({ url: DB_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// database.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()   // 全局注册，各模块无需重复 import
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class DatabaseModule {}
```

`DatabaseModule` 在 `AppModule` 中注册一次，其他模块直接注入 `PrismaService`。

---

## 六、模块改造

### 6.1 SessionService

**接口不变，实现替换：**

```typescript
// session.service.ts — 改造前后对比

// 改造前（文件 I/O）
async getSession(id: string): Promise<SessionRecord> {
  const raw = await fs.readFile(`data/sessions/${id}.json`, 'utf-8');
  return JSON.parse(raw);
}

// 改造后（Prisma）
async getSession(id: string): Promise<SessionRecord> {
  const session = await this.prisma.session.findUniqueOrThrow({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  return this.toRecord(session);   // 格式转换，保持返回类型不变
}
```

**受影响方法（全部内部改造，签名不变）：**

| 方法 | 改造内容 |
|------|---------|
| `listSessions()` | `prisma.session.findMany()` |
| `getSession(id)` | `prisma.session.findUniqueOrThrow()` + include messages |
| `createSession(dto)` | `prisma.session.create()` |
| `updateSession(id, dto)` | `prisma.session.update()` |
| `deleteSession(id)` | `prisma.session.delete()`（级联删消息 + 文档元数据） |
| `appendMessages(id, msgs)` | `prisma.message.createMany()` |

### 6.2 RagService — 文档元数据层

当前 `RagDocument` 元数据嵌在向量 JSON 文件里。v7 拆分：

| 数据 | 存储位置 | 变化 |
|------|---------|------|
| 文档元数据（id、filename、chunkCount…） | `RagDocument` 表 | 移入 DB |
| Chunk 向量 | `data/vectors/<sessionId>/<docId>.json` | 不变 |

```typescript
// rag.service.ts — upload 流程改造

async upload(file: Express.Multer.File, sessionId: string): Promise<RagDocument> {
  const text = await this.parser.parse(file.buffer, file.mimetype);
  const chunks = this.chunking.split(text, docId, sessionId);
  const vectors = await this.embedding.embed(chunks.map(c => c.text));
  chunks.forEach((c, i) => (c.vector = vectors[i]));

  // 向量仍写 JSON 文件
  await this.vectorStore.save(docId, sessionId, chunks);

  // 元数据写 DB（新增）
  return this.prisma.ragDocument.create({
    data: { id: docId, sessionId, filename: file.originalname,
            mimeType: file.mimetype, chunkCount: chunks.length },
  });
}

// 列出文档：改为查 DB
async listDocuments(sessionId: string) {
  return this.prisma.ragDocument.findMany({ where: { sessionId } });
}

// 删除文档：DB + 向量文件
async deleteDocument(sessionId: string, docId: string) {
  await this.prisma.ragDocument.delete({ where: { id: docId } });
  await this.vectorStore.remove(sessionId, docId);   // 删向量文件
}
```

### 6.3 MonitorService — 报告 & 配置

**报告持久化：**

```typescript
// monitor.service.ts

// 改造前
await fs.writeFile(`data/reports/${id}.json`, JSON.stringify(report));

// 改造后
await this.prisma.report.create({
  data: { id, celebrity: report.celebrity, data: JSON.stringify(report) },
});
```

**配置持久化：**

```typescript
// 改造前：读写 data/monitor-config.json

// 改造后：upsert 单行
await this.prisma.monitorConfig.upsert({
  where: { id: 1 },
  update: { data: JSON.stringify(config) },
  create: { id: 1, data: JSON.stringify(config) },
});
```

**不变：** `MonitorConfig` 仍以 JSON 对象的形式在内存中使用，`data` 列只做序列化存储。

---

## 七、数据迁移

提供一次性迁移脚本，现有 JSON 数据不丢失：

```
backend/scripts/
└── migrate-to-db.ts    # ts-node 执行
```

迁移顺序：

```
1. 运行 prisma migrate deploy  → 建表
2. 读取 data/sessions/*.json   → 写入 Session + Message 表
3. 读取 data/reports/*.json    → 写入 Report 表
4. 读取 data/monitor-config.json → 写入 MonitorConfig 表
5. 读取 data/vectors/*/*.json  → 提取 RagDocument 元数据 → 写入 RagDocument 表
   （向量 JSON 文件保留，内容不变）
6. 校验：对比条数，输出报告
```

迁移脚本幂等（同 id 跳过），可重复执行。

**迁移完成后：** 旧 JSON 文件可以归档删除，也可以保留作备份。

---

## 八、目录结构变化

```
StockClaw/
├── prisma/
│   ├── schema.prisma           # 新增（只声明 provider，不写 url）
│   └── migrations/             # Prisma 自动生成
├── backend/
│   ├── prisma.config.ts        # 新增（CLI 用 url；放 backend/ 以解析 prisma/config）
│   ├── src/
│   │   ├── generated/prisma/   # 新增（prisma generate 产物，gitignore）
│   │   ├── database/           # 新增模块
│   │   │   ├── database.module.ts
│   │   │   └── prisma.service.ts
│   │   ├── session/
│   │   │   └── session.service.ts    ← 内部实现替换
│   │   ├── rag/
│   │   │   └── rag.service.ts        ← 元数据操作替换
│   │   ├── monitor/
│   │   │   └── monitor.service.ts    ← 存储操作替换
│   │   └── app.module.ts             ← 注册 DatabaseModule
│   ├── data/
│   │   ├── app.db              # 新增（SQLite 文件，与现有数据同目录）
│   │   ├── sessions/           # 迁移后可归档
│   │   └── reports/            # 迁移后可归档
│   └── scripts/
│       └── migrate-to-db.ts    # 新增迁移脚本
└── data/
    └── vectors/                # 向量文件保留不变
```

---

## 九、新增依赖

```bash
# backend 目录
npm install @prisma/client better-sqlite3 @prisma/adapter-better-sqlite3
npm install -D prisma
```

> `@types/better-sqlite3` 无需安装——代码只通过 adapter 间接使用 better-sqlite3，不直接 import。

| 包 | 用途 |
|----|------|
| `@prisma/client` | 自动生成的查询客户端 |
| `prisma` (devDep) | CLI：`migrate`、`generate`、`studio` |
| `better-sqlite3` | Prisma 7 SQLite driver adapter 的底层驱动（必须） |
| `@prisma/adapter-better-sqlite3` | 将 better-sqlite3 接入 Prisma adapter 接口 |

---

## 十、不改动的内容

| 模块 | 原因 |
|------|------|
| `AgentService` | 纯 AI 执行层，无存储依赖 |
| `SkillRegistry` | 内存注册表，无持久化需求 |
| `ToolRegistry` | 同上 |
| `FeishuService` | 只做 HTTP 推送，无存储 |
| `VectorStoreService` | 向量文件存储不变 |
| `EmbeddingService` | 无存储依赖 |
| `ChunkingService` | 纯计算，无存储依赖 |
| `DocumentParserService` | 纯解析，无存储依赖 |
| 所有 Controller | 接口签名和路由不变 |
| 前端全部代码 | API 合约不变，前端无感知 |

---

## 十一、实施阶段

```
Phase A — 基础设施 ✅ 已完成（2026-06-23）
  ├── 安装依赖：@prisma/client better-sqlite3 @prisma/adapter-better-sqlite3 + prisma(devDep)
  ├── 编写 prisma/schema.prisma（5 个 model；generator=prisma-client + cjs；datasource 不含 url）
  ├── 编写 backend/prisma.config.ts（CLI 用 url；放 backend/ 以解析 prisma/config）
  ├── cd backend && npx prisma migrate dev --name init（config 自动从 cwd 加载）
  ├── npx prisma generate（生成 client 到 backend/src/generated/prisma）
  ├── 新建 DatabaseModule + PrismaService（构造函数传 PrismaBetterSqlite3 adapter）
  ├── tsconfig.build.json 排除 prisma.config.ts；gitignore + eslint 忽略 src/generated/
  └── 在 AppModule 注册 DatabaseModule

Phase B — SessionService 替换
  ├── 注入 PrismaService，替换所有文件 I/O
  ├── 运行 migrate-to-db.ts 迁移历史 Session 数据
  └── 回归测试：CRUD + 消息追加 + 级联删除

Phase C — RagService 元数据替换
  ├── upload / listDocuments / deleteDocument 改用 Prisma
  ├── VectorStoreService 向量文件路径逻辑不变
  └── 回归测试：上传文档 → 列表 → 删除 → 检索

Phase D — MonitorService 替换
  ├── 报告写入改用 prisma.report.create()
  ├── 配置读写改用 prisma.monitorConfig.upsert()
  ├── 迁移历史报告
  └── 回归测试：手动触发 Monitor → 报告入库 → 查询

Phase E — 清理（可选）
  ├── 归档旧 JSON 文件
  ├── 删除 SessionService 中的 fs 操作代码
  └── 更新 CLAUDE.md 存储说明
```

---

## 十二、关键设计决策 & 权衡

| 决策 | 选择 | 理由 |
|------|------|------|
| 数据库类型 | SQLite | 零部署；与项目"本地文件优先"的风格一致；后续可无缝迁移 PostgreSQL |
| ORM | Prisma | 类型安全迁移；自动生成 TS 类型；比 TypeORM 的装饰器方案更清晰 |
| Schema 位置 | 项目根 `prisma/` | Prisma 惯例；与 backend/frontend 解耦 |
| 向量存储 | 保留 JSON 文件 | 向量数据非结构化、体积大，SQLite BLOB 无优势；现有实现工作良好 |
| MonitorConfig 序列化 | JSON 字符串列 | 配置结构可能演进，JSON 列比频繁 schema 迁移更灵活 |
| Report.data 序列化 | JSON 字符串列 | 报告结构复杂，全量 JSON 存储便于直接反序列化为现有类型 |
| 迁移策略 | 脚本迁移 + 原文件保留 | 安全；可回滚；不强制一次性切换 |
