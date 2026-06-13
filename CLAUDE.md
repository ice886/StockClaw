# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StackClaw is an AI agent chatbot with a NestJS backend and React + Vite frontend (monorepo, no shared root package.json).

## Commands

### Backend (`cd backend`)
```bash
npm run start:dev   # dev server with watch mode (port 3000)
npm run build       # compile TypeScript to /dist
npm run start:prod  # run compiled output
npm run lint        # ESLint with auto-fix
npm run test        # Jest unit tests
npm run test:e2e    # end-to-end tests
npm run test:cov    # coverage report
```

### Frontend (`cd frontend`)
```bash
npm run dev     # Vite dev server (port 5173)
npm run build   # TypeScript + Vite bundle
npm run lint    # ESLint
npm run preview # preview production build
```

## Architecture

The project follows a **progressive disclosure** pattern — the three layers (Session, Skill, Agent) are zero-coupled and connected only through the assembly layer.

```
Session (history) + Skill (config) + User message
              ↓
     ChatService.assemble()   ← sole assembly point
              ↓
   AgentContext { system, messages, tools, maxSteps }
              ↓
       AgentService.run()     ← only knows AgentContext
```

**Key rule:** `AgentService` must never import `SessionService` or `SkillRegistry`. All composition happens in `ChatService`.

### Backend modules (`backend/src/`)

| Module | Responsibility |
|--------|---------------|
| `agent/` | AI execution core — zero external module deps; `run(context: AgentContext)` |
| `chat/` | Assembly layer — reads session history + skill config, builds `AgentContext` |
| `session/` | Pure CRUD over JSON files in `data/sessions/` |
| `skills/` | Skill registry + built-in skill definitions (general-chat, file-ops, web-research, celebrity-monitor, stock-analysis) |
| `tools/` | Tool registry + built-in tools (filesystem ops, web search) |
| `monitor/` | Celebrity event monitoring pipeline: CrawlerService → EventExtractorService → StockAnalyzerService → MonitorService; MonitorScheduler runs cron |
| `feishu/` | Feishu webhook push — FeishuService.sendReport() builds interactive card and POSTs to webhook URL |

### Frontend (`frontend/src/`)

- `App.tsx` — flex row layout: `<Sidebar>` + `<ChatPanel>`
- `components/ChatPanel.tsx` — main chat interface, holds message state
- `components/AssistantBubble.tsx` — ReactMarkdown + syntax highlighting for assistant output
- `api/agent.ts` — `sendMessage()`, stream handling
- `api/session.ts` — session CRUD calls
- `hooks/useSessions.ts` — session list state

### Data flow (single request)

```
POST /api/chat { messages, sessionId?, skillName? }
  → AgentController → ChatService.assemble()
      ├── SessionService.getSession()     → history
      ├── SkillRegistry.get(skillName)    → system prompt + toolNames
      └── ToolRegistry.resolve(toolNames) → Tool objects
  → AgentContext assembled
  → AgentService.run(context) → generateText / streamText
  → ChatService appends [userMsg, assistantMsg] to session
```

### Monitor pipeline

```
MonitorScheduler (@Cron every 4h, or POST /api/monitor/run)
  → MonitorService.runFullCycle()
      → CrawlerService.fetchRawEvents(celebrity, hoursBack)   ← Exa webSearch x3 queries
      → EventExtractorService.extract(celebrity, rawResults)  ← DeepSeek JSON extraction
      → StockAnalyzerService.analyze(celebrity, events)       ← DeepSeek JSON signals
  → save report to data/reports/<id>.json
  → FeishuService.sendReport(report, webhookUrl)              ← interactive card
```

Monitor config is persisted at `data/monitor-config.json`. Set `FEISHU_WEBHOOK_URL` in `.env` and call `PUT /api/monitor/config` with `{ "enabled": true }` to activate scheduling.

### Monitor API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/monitor/status` | Status + next run info |
| `GET/PUT` | `/api/monitor/config` | Read/write config (celebrities, interval, webhook) |
| `POST` | `/api/monitor/run` | Manual trigger — SSE progress stream |
| `GET` | `/api/monitor/reports` | Report list |
| `GET` | `/api/monitor/reports/:id` | Report detail |
| `POST` | `/api/monitor/reports/:id/resend` | Resend to Feishu |



- Backend: `POST /api/chat/stream` — SSE via `streamText`, writes `data: {...}\n\n`
- Frontend: `ChatPanel` uses `fetch` + `ReadableStream` to append text chunks to the last assistant message

### Session storage

Sessions are JSON files at `data/sessions/<id>.json`. `SessionService` handles all file I/O — no database.

### Key types

```typescript
interface AgentContext {
  system: string;
  messages: { role: 'user' | 'assistant' | 'tool'; content: string }[];
  tools: Record<string, Tool>;
  maxSteps: number;
}

interface SkillConfig {
  name: string; description: string; systemPrompt: string;
  toolNames: string[]; maxSteps: number; icon?: string;
}

interface SessionRecord {
  id: string; title: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: number; updatedAt: number;
}
```

## Adding new skills

1. Create `backend/src/skills/builtin/<name>.ts` exporting a `SkillConfig`
2. Register it in `SkillRegistry` — no other changes needed

## Adding new tools

1. Create `backend/src/tools/builtin/<name>.ts`
2. Register in `ToolRegistry`
3. Reference by name in relevant skill's `toolNames` array
