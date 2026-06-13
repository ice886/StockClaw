# StockClaw Architecture v3

## 核心原则：渐进披露

```
┌──────────────────────────────────────────────────────────────┐
│                     渐进披露模型                               │
│                                                              │
│  Session ──→ 历史消息         ┐                               │
│  Skill   ──→ system + tools  ├── 组装层 ──→ AgentContext ──→ Agent.run()
│  User    ──→ 当前消息         ┘                               │
│                                                              │
│  Agent 不关心 context 从哪来，只执行被喂给的 context              │
│  Session/Skill/Agent 三者零耦合，通过组装层衔接                   │
└──────────────────────────────────────────────────────────────┘
```

### 耦合对比

| | 错误（强耦合） | 正确（渐进披露） |
|---|---|---|
| Agent 知道 Session？ | `AgentService` 里注入 `SessionService` | ❌ Agent 只收 `AgentContext` |
| Agent 知道 Skill？ | `AgentService` 里查 `SkillRegistry` | ❌ 组装层查好喂给 Agent |
| 谁负责组装？ | 各层自行拼凑 | ✅ **ChatService** 是唯一组装点 |

---

## 模块职责

```
backend/src/
│
├── agent/                    ← 🔴 Agent 内核（零依赖外部模块）
│   ├── agent.service.ts      ←   run(context: AgentContext): string
│   └── agent.controller.ts   ←   暴露 /api/chat
│
├── session/                  ← 🟢 Session 存储（纯 CRUD）
│   ├── session.service.ts    ←   文件 CRUD
│   ├── session.controller.ts ←   REST API
│   └── session.interface.ts  ←   SessionRecord 类型
│
├── skills/                   ← 🟡 Skill 配置（纯数据源）
│   ├── skill.registry.ts     ←   注册/查找 SkillConfig
│   ├── skill.interface.ts    ←   SkillConfig 类型
│   └── builtin/              ←   内置技能定义
│
├── tools/                    ← 🔵 工具（Agent 的能力）
│   ├── tool.registry.ts      ←   工具注册表
│   ├── base.ts               ←   工具基类
│   └── builtin/              ←   内置工具
│
└── chat/                     ← 🟣 组装层（渐进披露发生在这里）
    └── chat.service.ts       ←   根据 sessionId + skillName 组装 AgentContext
```

### 数据流（一次请求）

```
POST /api/chat { messages, sessionId?, skillName? }
  │
  ▼
AgentController.chat()
  │
  ▼
ChatService.assemble(sessionId, skillName, newMessages)
  │
  ├── SessionService.getSession(sessionId) ──→ 历史消息
  ├── SkillRegistry.get(skillName)        ──→ system prompt + tools
  │
  ├── 组装 AgentContext:
  │   {
  │     system:     skill.systemPrompt,
  │     messages:   [...history.slice(-N), ...newMessages],   ← 渐进裁剪
  │     tools:      resolveTools(skill.toolNames),
  │     maxSteps:   skill.maxSteps,
  │   }
  │
  ▼
AgentService.run(context)
  │
  ├── generateText({ system, messages, tools, maxSteps })
  │
  ▼
返回 assistant 消息
  │
  ▼
ChatService 回写 SessionService.appendMessages(sessionId, [userMsg, assistantMsg])
```

**关键点：AgentService 只接收 `AgentContext`，不知道 session/skill 的存在。**

---

## 类型定义

```typescript
// ─── Agent 核心类型（agent/types.ts）───

export interface AgentContext {
  system: string;
  messages: { role: 'user' | 'assistant' | 'tool'; content: string }[];
  tools: Record<string, Tool>;
  maxSteps: number;
}

// ─── Session 类型（session/session.interface.ts）───
// ✅ 已实现

export interface SessionRecord {
  id: string;
  title: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: number;
  updatedAt: number;
}

// ─── Skill 类型（skills/skill.interface.ts）───

export interface SkillConfig {
  name: string;
  description: string;
  systemPrompt: string;
  toolNames: string[];
  maxSteps: number;
  icon?: string;
}
```

---

## Phase 执行计划

### ✅ Phase 1 — 后端 Session API（已完成）

```
backend/src/session/
├── session.module.ts      ✅
├── session.controller.ts  ✅  5 个端点
├── session.service.ts     ✅  JSON 文件存储
└── session.interface.ts   ✅
```

已实现的接口：

| 方法 | 路径 | 状态 |
|------|------|------|
| `POST` | `/api/sessions` | ✅ 新建 |
| `GET` | `/api/sessions` | ✅ 列表 |
| `GET` | `/api/sessions/:id` | ✅ 详情 |
| `PATCH` | `/api/sessions/:id` | ✅ 更新 |
| `DELETE` | `/api/sessions/:id` | ✅ 删除 |

---

### 🔜 Phase 2 — 前端 Session 侧边栏 + 布局改造

#### 目标

```
┌──────────┬──────────────────────────────┐
│ Sidebar  │  ChatPanel                    │
│ 260px    │  flex: 1                      │
│          │                               │
│ [+ 新建] │  ┌─────────────────────────┐ │
│ ──────── │  │  MessageList            │ │
│ Session1 │  │                         │ │
│ Session2 │  │  user: ...              │ │
│ Session3 │  │       assistant: ...    │ │
│          │  │  user: ...              │ │
│          │  └─────────────────────────┘ │
│          │  ┌─────────────────────────┐ │
│          │  │  ChatInput              │ │
│          │  └─────────────────────────┘ │
└──────────┴──────────────────────────────┘
```

#### 新建文件

```
frontend/src/
├── types/
│   └── session.ts           ← SessionRecord 前端类型
├── api/
│   └── session.ts           ← fetch sessions CRUD
├── hooks/
│   └── useSessions.ts       ← session 状态管理 hook
└── components/
    ├── Sidebar.tsx
    ├── Sidebar.css
    ├── SessionItem.tsx
    └── SessionItem.css
```

#### 修改文件

```
frontend/src/
├── App.tsx                  ← flex row 布局，挂 Sidebar + ChatPanel
├── App.css                  ← 布局样式
├── ChatPanel.tsx            ← 接收 activeSessionId prop
└── index.css                ← root 宽度调整
```

#### 关键实现

**App.tsx 布局：**
```tsx
export default function App() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="app-layout">
      <Sidebar activeId={activeId} onSelect={setActiveId} />
      <ChatPanel sessionId={activeId} />
    </div>
  );
}
```

**useSessions hook：**
```tsx
// 封装 session CRUD + 列表状态
export function useSessions() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  const fetchSessions = async () => { /* GET /api/sessions */ };
  const createSession = async (title: string) => { /* POST */ };
  const deleteSession = async (id: string) => { /* DELETE */ };

  return { sessions, fetchSessions, createSession, deleteSession };
}
```

**Session 选择流程：**
```
点击 SessionItem
  → setActiveId(id)
  → ChatPanel 收到新 sessionId
  → GET /api/sessions/:id 获取历史消息
  → setMessages(history)
```

---

### 🔜 Phase 3 — 消息操作（Copy + Edit）

#### 目标

- User 消息 hover 显示 copy / edit 按钮
- Copy → 复制内容到剪贴板
- Edit → 进入编辑模式，保存后从该点分叉

#### 改动范围

```
MessageList.tsx（改）
  └── 每个 user 消息用 MessageBubble 渲染
      └── MessageBubble.tsx（新建）
          ├── role=user:  纯文本 + hover 按钮 [📋 ✏️]
          └── role=assistant: 纯文本 + hover 按钮 [📋]（Phase 4 改进）

ChatPanel.tsx（改）
  └── 新增 handleEdit(oldIndex, newContent)
```

#### Edit 分叉逻辑

```
原消息序列:
  [0] user: "问题A"
  [1] assistant: "回答A"
  [2] user: "问题B"       ← 用户编辑这条
  [3] assistant: "回答B"

编辑后:
  [0] user: "问题A"
  [1] assistant: "回答A"
  [2] user: "修改后的问题B"   ← 替换
  [3] ❌ 丢弃  （新回复会替代）

发送 POST /api/chat { messages: [0, 1, 2新] }
  → 返回 assistant: "新回答B"
  → messages = [0, 1, 2新, 3新]
```

```typescript
// ChatPanel.tsx
const handleEdit = async (index: number, newContent: string) => {
  // 1. 保留 index 之前的所有消息
  // 2. 替换 index 位置的消息
  const trimmed = messages.slice(0, index);
  const editedMsg: Message = { ...messages[index], content: newContent };
  const newMessages = [...trimmed, editedMsg];

  setMessages(newMessages);
  setLoading(true);

  const res = await sendMessage(newMessages);
  setMessages([...newMessages, { role: 'assistant', content: res.content }]);
  setLoading(false);
};
```

---

### 🔜 Phase 4 — Assistant 消息排版

#### 目标

Assistant 消息支持 markdown 渲染：标题、列表、加粗、链接、**代码块语法高亮**。

#### 依赖

```bash
cd frontend
npm install react-markdown react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

#### 新建/修改文件

```
frontend/src/components/
├── MessageBubble.tsx        ← Phase 3 创建，Phase 4 改 assistant 分支
├── MessageBubble.css
├── AssistantBubble.tsx      ← 新建：ReactMarkdown + SyntaxHighlighter
└── AssistantBubble.css      ← 代码块/表格/链接样式
```

**AssistantBubble 实现要点：**
- `code` 块：区分 inline 和 block，block 用 `SyntaxHighlighter`
- `a` 标签：`target="_blank" rel="noopener"`
- `table`：包一层 `div.table-wrapper` 做横向滚动
- 列表、标题等保留 markdown 原生渲染

#### 前后对比

```
改前:
  div.bubble → 纯文本 "### 结果\n\n1. A\n2. B\n```js\ncode```"

改后:
  div.bubble
    └── ReactMarkdown
          ├── <h3>结果</h3>
          ├── <ol><li>A</li><li>B</li></ol>
          └── <SyntaxHighlighter>code</SyntaxHighlighter>
```

---

### 🔜 Phase 5 — Skill 系统

#### 设计原则（重申）

> Skill **不耦合** Agent。Skill 只是"配置数据源"，在组装层被读取，拼进 AgentContext。

```
Skill（数据）             组装层                   Agent（执行）
─────────────      ───────────────      ─────────────────
name               ChatService          AgentService
systemPrompt  ──→  assemble()  ──→      run(context)
toolNames           context = {         不关心 context
maxSteps             system,            里的 prompt
icon                 messages,          从哪来
                     tools,
                     maxSteps
                   }
```

#### 后端模块

```
backend/src/skills/
├── skill.interface.ts     ← SkillConfig 类型
├── skill.registry.ts      ← 注册/查找/列表
├── skill.module.ts
├── skill.controller.ts    ← GET /api/skills（前端列技能用）
└── builtin/
    ├── general-chat.ts    ← 通用助手
    ├── file-ops.ts        ← 文件操作
    └── web-research.ts    ← 网络调研
```

#### SkillConfig

```typescript
export interface SkillConfig {
  name: string;
  description: string;
  systemPrompt: string;
  toolNames: string[];   // 工具名称数组，组装时 resolve 成 Tool 对象
  maxSteps: number;
  icon?: string;
}
```

#### 三个内置技能

```typescript
// general-chat.ts
export const generalChatSkill: SkillConfig = {
  name: 'general-chat',
  description: '通用对话助手',
  systemPrompt: '你是一个友好的 AI 助手，用中文回答。',
  toolNames: [],
  maxSteps: 1,
  icon: '💬',
};

// file-ops.ts
export const fileOpsSkill: SkillConfig = {
  name: 'file-ops',
  description: '文件系统操作',
  systemPrompt: '你是文件管理专家...',
  toolNames: ['read_file', 'write_file', 'edit_file', 'list_directory', 'create_directory', 'search_file'],
  maxSteps: 10,
  icon: '📁',
};

// web-research.ts
export const webResearchSkill: SkillConfig = {
  name: 'web-research',
  description: '深度网络调研',
  systemPrompt: '你是调研专家...',
  toolNames: ['webSearch'],
  maxSteps: 8,
  icon: '🔍',
};
```

#### Registry

```typescript
@Injectable()
export class SkillRegistry {
  private skills = new Map<string, SkillConfig>();

  register(skill: SkillConfig) { this.skills.set(skill.name, skill); }
  get(name: string): SkillConfig | undefined { return this.skills.get(name); }
  list(): SkillConfig[] { return [...this.skills.values()]; }
}
```

#### 组装层如何使用

```typescript
// ChatService 或直接在 agent 调用处
async chat(sessionId: string, messages: Message[], skillName: string) {
  // 1. 从 Session 拿历史
  const session = await this.sessionService.getSession(sessionId);
  const history = session?.messages ?? [];

  // 2. 从 Skill 拿配置
  const skill = this.skillRegistry.get(skillName) ?? this.skillRegistry.get('general-chat');

  // 3. Resolve 工具名 → 工具对象
  const tools = this.toolRegistry.resolve(skill.toolNames);

  // 4. 组装 context（渐进披露）
  const context: AgentContext = {
    system: skill.systemPrompt,
    messages: [...history.slice(-20), ...messages],  // 渐进裁剪
    tools,
    maxSteps: skill.maxSteps,
  };

  // 5. Agent 执行
  return this.agentService.run(context);
}
```

#### 前端 SkillSelector

```
Sidebar 底部或 ChatPanel 顶部加一个下拉/标签选择器:

[💬 通用] [📁 文件] [🔍 调研]

选中后 chat 请求带上 skillName
```

---

### 🔜 Phase 6 — 流式输出

#### 目标

Agent 执行过程逐步推送到前端，用户看到实时生成。

#### 后端改造

```typescript
// agent.service.ts 改用 streamText
import { streamText } from 'ai';

async *runStream(context: AgentContext): AsyncGenerator<AgentStreamEvent> {
  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: context.system,
    messages: context.messages,
    tools: context.tools,
    stopWhen: stepCountIs(context.maxSteps),
  });

  for await (const chunk of result.textStream) {
    yield { type: 'text', content: chunk };
  }
  // tool call 事件也可以 yield
}
```

```typescript
// agent.controller.ts 改 SSE
@Post('chat/stream')
async chatStream(@Body() dto: ChatRequestDto, @Res() res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const event of this.agentService.runStream(context)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  res.end();
}
```

#### 前端适配

```
ChatPanel.tsx：
  - 不用 fetch json，用 fetch + ReadableStream
  - 逐步 append text 到最后一条 assistant 消息
  - loading 态由 streaming 替代
```

---

## 文件全景图

```
StockClaw/
├── ARCHITECTURE.md              ← 本文档
├── design.md
│
├── backend/src/
│   ├── main.ts                  ← CORS 配置
│   ├── app.module.ts            ← 根模块
│   │
│   ├── agent/                   ← Agent 内核
│   │   ├── agent.module.ts
│   │   ├── agent.controller.ts  ← POST /api/chat
│   │   ├── agent.service.ts     ← run(context: AgentContext)
│   │   └── types.ts             ← AgentContext, AgentStep, AgentRunResult
│   │
│   ├── session/                 ← ✅ Phase 1 完成
│   │   ├── session.module.ts
│   │   ├── session.controller.ts
│   │   ├── session.service.ts
│   │   └── session.interface.ts
│   │
│   ├── skills/                  ← Phase 5
│   │   ├── skill.module.ts
│   │   ├── skill.controller.ts
│   │   ├── skill.registry.ts
│   │   ├── skill.interface.ts
│   │   └── builtin/
│   │       ├── general-chat.ts
│   │       ├── file-ops.ts
│   │       └── web-research.ts
│   │
│   └── tools/
│       ├── base.ts
│       ├── tool.registry.ts     ← Phase 5 需要
│       └── builtin/
│           └── filesystem/
│               ├── read-file.ts
│               ├── write-file.ts
│               ├── edit-file.ts
│               ├── list-directory.ts
│               ├── create-directory.ts
│               └── search-file.ts
│
├── frontend/src/
│   ├── main.tsx
│   ├── App.tsx                  ← flex row 布局 (Phase 2)
│   ├── App.css                  ← 布局样式 (Phase 2)
│   ├── index.css
│   │
│   ├── types/
│   │   ├── chat.ts              ← Message, ChatRequest, ChatResponse
│   │   └── session.ts           ← SessionRecord (Phase 2)
│   │
│   ├── api/
│   │   ├── agent.ts             ← sendMessage()
│   │   └── session.ts           ← session CRUD (Phase 2)
│   │
│   ├── hooks/
│   │   ├── useSessions.ts       ← (Phase 2)
│   │   └── useChat.ts           ← (Phase 3)
│   │
│   └── components/
│       ├── ChatPanel.tsx        ← 聊天主面板 (Phase 2/3 改造)
│       ├── ChatPanel.css
│       ├── ChatInput.tsx
│       ├── ChatInput.css
│       ├── MessageList.tsx      ← 消息列表 (Phase 3 改)
│       ├── MessageList.css
│       ├── MessageBubble.tsx    ← Phase 3 新建，Phase 4 改 assistant 分支
│       ├── MessageBubble.css
│       ├── AssistantBubble.tsx  ← Phase 4 新建
│       ├── AssistantBubble.css
│       ├── Sidebar.tsx          ← Phase 2 新建
│       ├── Sidebar.css
│       ├── SessionItem.tsx      ← Phase 2 新建
│       ├── SessionItem.css
│       ├── SkillSelector.tsx    ← Phase 5 新建
│       └── SkillSelector.css
│
└── data/sessions/               ← JSON 文件存储 (Phase 1)
    ├── abc123.json
    └── def456.json
```

---

## 接口汇总

| 方法 | 路径 | 需求 | Phase |
|------|------|------|-------|
| `POST` | `/api/chat` | 发送消息 | ✅ 已有 |
| `GET` | `/api/sessions` | Session 列表 | ✅ Phase 1 |
| `GET` | `/api/sessions/:id` | Session 详情 | ✅ Phase 1 |
| `POST` | `/api/sessions` | 新建 Session | ✅ Phase 1 |
| `PATCH` | `/api/sessions/:id` | 更新 Session | ✅ Phase 1 |
| `DELETE` | `/api/sessions/:id` | 删除 Session | ✅ Phase 1 |
| `GET` | `/api/skills` | 技能列表 | Phase 5 |
| `POST` | `/api/chat/stream` | 流式对话 | Phase 6 |
