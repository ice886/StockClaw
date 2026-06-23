# StockClaw

AI agent chatbot that monitors tech celebrity activity and analyzes short-term stock impact. Built with NestJS + React/Vite.

## Features

- **Chat agent** — multi-skill AI assistant with streaming responses and session history
- **RAG** — upload documents per session; chunked, embedded, and retrieved as context during chat
- **Celebrity monitor** — automated pipeline that crawls news, extracts events, and generates stock signals for tracked figures (Jensen Huang, Elon Musk, Lisa Su, Sam Altman, Mark Zuckerberg)
- **Feishu push** — incremental reports grouped by celebrity, sent to a Feishu webhook
- **Monitor dashboard** — split-layout UI with signal board and event stream, auto-refresh, report history

## Stack

| Layer | Tech |
|-------|------|
| Backend | NestJS, TypeScript, AI SDK (`ai`, `@ai-sdk/deepseek`), Exa search, Zod |
| Frontend | React 18, Vite, TypeScript |
| AI models | DeepSeek (chat + analysis) |
| Storage | SQLite via Prisma (`data/app.db`); RAG vector files on disk (`data/vectors/`) |

## Getting started

### Prerequisites

- Node.js 20+
- DeepSeek API key
- Exa API key
- (Optional) Feishu webhook URL

### Backend

```bash
cd backend
cp .env.example .env   # fill in API keys
npm install
npm run db:migrate      # create SQLite schema + generate Prisma client
npm run start:dev      # http://localhost:3000
```

> 已有旧版 JSON 数据（`data/sessions/` 等）需要迁移到 SQLite 时，运行 `npm run db:migrate-data`（幂等，原 JSON 保留）。

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### Environment variables (`backend/.env`)

```
DEEPSEEK_API_KEY=
EXA_API_KEY=
FEISHU_WEBHOOK_URL=       # optional, enables Feishu push
MONITOR_INTERVAL_HOURS=4  # default scan interval
```

## Monitor pipeline

```
MonitorScheduler (cron every N hours, or POST /api/monitor/run)
  → CrawlerService        — Exa webSearch × 3 queries per celebrity
  → EventExtractorService — DeepSeek extracts structured CelebrityEvent[]
  → StockAnalyzerService  — DeepSeek generates StockSignal[] with confidence scores
  → EventDeduplicator     — removes events already seen in the previous report
  → FeishuService         — posts interactive card grouped by celebrity
```

Enable scheduling via `PUT /api/monitor/config`:

```json
{
  "enabled": true,
  "feishuWebhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/...",
  "intervalHours": 4,
  "signalThreshold": 65
}
```

## Chat skills

| Skill | Description |
|-------|-------------|
| `general-chat` | General assistant, no tools |
| `file-ops` | Filesystem read/write/search |
| `web-research` | Web search via Exa, cites sources |
| `stock-analysis` | Stock analysis with market context |
| `celebrity-monitor` | Event extraction focused prompt |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat/stream` | SSE chat stream |
| `GET` | `/api/sessions` | List sessions |
| `POST` | `/api/rag/upload` | Upload a document to a session |
| `GET` | `/api/rag/docs/:sessionId` | List session documents |
| `DELETE` | `/api/rag/docs/:sessionId/:docId` | Delete a document |
| `GET/PUT` | `/api/monitor/config` | Monitor config |
| `GET` | `/api/monitor/status` | Status + next run |
| `POST` | `/api/monitor/run` | Manual run (SSE progress) |
| `GET` | `/api/monitor/reports` | Report list |
| `GET` | `/api/monitor/reports/:id` | Report detail |
| `POST` | `/api/monitor/reports/:id/resend` | Resend to Feishu |

## Project structure

```
StockClaw/
├── prisma/             # Prisma schema (SQLite)
├── backend/src/
│   ├── agent/          # AI execution core
│   ├── chat/           # Assembly layer (session + skill → AgentContext)
│   ├── database/       # PrismaService + global DatabaseModule
│   ├── session/        # Session CRUD (Prisma)
│   ├── rag/            # Document upload, chunking, embedding, vector store
│   ├── skills/         # Skill registry + built-in skills
│   ├── tools/          # Tool registry + built-in tools
│   ├── monitor/        # Celebrity monitor pipeline
│   └── feishu/         # Feishu webhook push
├── frontend/src/
│   ├── components/     # Chat + Monitor UI components
│   ├── api/            # REST + SSE client
│   ├── hooks/          # useMonitor, useSessions
│   └── types/          # Shared TypeScript types
└── Docs/               # Architecture docs, changelog
```
