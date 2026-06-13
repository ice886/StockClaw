# StockClaw Agent 系统 — 架构升级方案

## 当前状态

```
backend/  (NestJS 11 + AI SDK v6 + DeepSeek)
├── agent/            ← AgentService 已接入 generateText + 工具
├── tools/builtin/    ← 6 个工具（5 文件 + 1 web_search）
└── 通信              ← HTTP POST /api/chat，请求-响应

frontend/  (Vite 8 + React 19)
├── ChatPanel         ← 持有 messages 状态
├── MessageList       ← 简单气泡渲染
├── ChatInput         ← 文本输入
└── 通信              ← fetch /api/chat，纯文本，无流式
```

**缺失：** session 管理、消息操作（copy/edit）、assistant 排版、skill 系统。

---

## ⚠️ 栈说明

你提到了 Next.js，但当前 frontend 是 Vite + React。两者的取舍：

| | Vite + React（现状） | Next.js（迁移） |
|---|---|---|
| 迁移成本 | 零 | 重构整个 frontend |
| API 层 | 独立 NestJS 后端 ✅ | 需要 App Router 重写，或保留 NestJS |
| 对你需求的支持 | 完全够用 | 过度设计 |

**建议：保持 Vite + React + NestJS。** 你的需求不依赖 Next.js 的任何特性（SSR、ISR、Server Components）。Vercel AI SDK 的 `useChat` hook 也可以在纯 React 中使用。

---

## 五大需求架构

### 需求 1 & 2：前端 Session 侧边栏 + 消息操作

```
App.tsx（布局改造）
├── Sidebar ───────────────────┐
│   ├── SessionList            │
│   │   ├── SessionItem × N    │  ← 点击切换会话
│   │   │   ├── 标题           │
│   │   │   ├── 编辑/删除按钮   │
│   │   └── + 新建按钮         │
│   └── SkillSelector          │  ← 需求5：选择技能
├── ChatPanel ─────────────────┤
│   ├── SessionHeader          │  ← 显示当前 session 标题
│   ├── MessageList            │
│   │   └── MessageBubble × N  │
│   │       ├── [user]         │  ← hover 显示 copy/edit 按钮
│   │       └── [assistant]    │  ← markdown 渲染
│   └── ChatInput              │
```

#### 布局结构

```css
.app-layout {
  display: flex;
  height: 100vh;
}
.sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
}
.chat-panel {
  flex: 1;
  min-width: 0;
}
```

#### 消息操作 — Copy 和 Edit

```
hover user message bubble
    ↓
显示两个小图标：[📋] [✏️]
    ↓
📋 → navigator.clipboard.writeText(content) → toast "已复制"
✏️ → 进入编辑模式
    ↓
message bubble 变为 textarea
    ↓
用户修改 → Enter 提交
    ↓
1. 保留该消息之前的所有消息
2. 替换当前消息内容
3. 删除该消息之后的所有消息（新回复会替代它们）
4. 重新调用 /api/chat
```

**关键逻辑：** 编辑历史上某条消息 → 从那条消息分叉，丢弃之后的所有 assistant 回复。

**类型扩展：**

```typescript
// frontend/src/types/chat.ts
export interface Message {
  id: string;            // ← 新增唯一标识
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;     // ← 新增
  status?: 'sending' | 'done' | 'error';
}
```

```typescript
// frontend/src/types/session.ts
export interface Session {
  id: string;
  title: string;
  skillName: string;     // ← 关联 skill（需求5）
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
```

#### 组件树

```
src/
├── App.tsx                          ← 布局容器
├── App.css                          ← flex row 布局
├── types/
│   ├── chat.ts                      ← Message, ChatRequest, ChatResponse
│   └── session.ts                   ← Session
├── api/
│   ├── agent.ts                     ← sendMessage（已有，需改）
│   └── session.ts                   ← fetch sessions CRUD
├── hooks/
│   ├── useChat.ts                   ← 抽取 ChatPanel 逻辑
│   └── useSessions.ts               ← session CRUD hooks
├── components/
│   ├── Sidebar.tsx                  ← 侧边栏容器
│   ├── Sidebar.css
│   ├── SessionItem.tsx              ← 单条会话
│   ├── SessionItem.css
│   ├── SkillSelector.tsx            ← 技能选择下拉
│   ├── ChatPanel.tsx                ← 聊天主面板（已有，改）
│   ├── ChatPanel.css
│   ├── MessageList.tsx              ← 消息列表（已有，改）
│   ├── MessageList.css
│   ├── MessageBubble.tsx            ← NEW 单条消息气泡
│   ├── MessageBubble.css
│   ├── AssistantBubble.tsx          ← NEW assistant 专用渲染
│   ├── ChatInput.tsx                ← 输入框（已有）
│   └── ChatInput.css
```

---

### 需求 3：后端 Session API

#### 新增模块

```
backend/src/
├── session/
│   ├── session.module.ts
│   ├── session.controller.ts
│   ├── session.service.ts
│   └── session.interface.ts
└── agent/
    ├── agent.controller.ts     ← 修改：/api/chat 关联 sessionId
    └── agent.service.ts        ← 修改：接受 sessionId、skillName
```

#### Session 接口

```typescript
// session.interface.ts
export interface SessionRecord {
  id: string;
  title: string;
  skillName: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: number;
  updatedAt: number;
}
```

| 方法 | 路径 | 功能 |
|------|------|------|
| `GET` | `/api/sessions` | 获取所有 session 列表 |
| `GET` | `/api/sessions/:id` | 获取单个 session 详情 |
| `POST` | `/api/sessions` | 新建空 session |
| `DELETE` | `/api/sessions/:id` | 删除 session |
| `PATCH` | `/api/sessions/:id` | 更新 session（改标题等） |

#### 存储方案

```
第一阶段：JSON 文件存储
  data/sessions/
    {id}.json   ← 每个 session 一个文件

第二阶段：SQLite
  引入 better-sqlite3，基本不增加复杂度

从 JSON 文件开始，SessionService 接口不变，
后续换存储只改 Service 内部实现。
```

#### AgentController 改造

```typescript
// 现有接口保持不变，新增 sessionId 关联
@Post('api/chat')
async chat(@Body() dto: ChatRequestDto): Promise<ChatResponseDto> {
  // dto: { messages, sessionId?, skillName? }
  const content = await this.agentService.run(dto.messages, dto.skillName);
  
  // 如果有 sessionId，自动持久化消息
  if (dto.sessionId) {
    await this.sessionService.appendMessages(dto.sessionId, [
      dto.messages[dto.messages.length - 1],  // 用户消息
      { role: 'assistant', content },          // 助手回复
    ]);
  }
  
  return { role: 'assistant', content };
}
```

---

### 需求 4：Assistant 消息排版

#### 问题

当前 assistant 返回的是 markdown 文本，但前端直接用 `<div>` 渲染：

```
当前显示：
"### 分析结果\n\n1. 第一点\n2. 第二点\n```js\nconst x = 1;\n```"

期望显示：
### 分析结果
1. 第一点
2. 第二点
```
const x = 1;
```
```

#### 方案

```
MessageBubble.tsx
    ↓ role === 'user'
    ├── 纯文本显示
    ├── hover 显示 copy ✏️ edit 按钮
    
    ↓ role === 'assistant'
    ├── AssistantBubble.tsx（专用组件）
    │   ├── ReactMarkdown（markdown 渲染）
    │   │   ├── 自定义 code 渲染器 → SyntaxHighlighter
    │   │   ├── 自定义 table 渲染器 → 响应式表格
    │   │   └── 自定义 a 渲染器 → target="_blank"
    │   └── hover 显示 copy 按钮
```

#### 依赖

```bash
cd frontend
npm install react-markdown react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

#### 关键实现

```typescript
// AssistantBubble.tsx
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function AssistantBubble({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const inline = !match;
          return !inline ? (
            <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>{children}</code>
          );
        },
        a({ href, children }) {
          return <a href={href} target="_blank" rel="noopener">{children}</a>;
        },
        table({ children }) {
          return <div className="table-wrapper"><table>{children}</table></div>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

---

### 需求 5：Skill 系统

#### 概念定义

Skill = 一个**预置的 Agent 配置套餐**，包含：

| 属性 | 说明 | 示例 |
|------|------|------|
| `name` | 唯一标识 | `"web-research"` |
| `description` | 描述 | `"网络调研助手"` |
| `systemPrompt` | 技能专用系统提示词 | `"你是调研专家，擅长..."` |
| `tools` | 可用的工具列表 | `[webSearch]` |
| `maxSteps` | 最大执行步数 | `5` |
| `icon` | 前端图标 | `"🔍"` |

#### 示例技能

```typescript
// 内置技能 1：通用助手
{
  name: 'general-chat',
  description: '通用对话助手',
  systemPrompt: '你是一个友好的 AI 助手...',
  tools: ['webSearch'],
  maxSteps: 3,
  icon: '💬'
}

// 内置技能 2：文件管理
{
  name: 'file-ops',
  description: '文件系统操作',
  systemPrompt: '你是文件管理专家，可以读写编辑文件...',
  tools: ['read_file', 'write_file', 'edit_file', 'list_directory', 'create_directory', 'search_file'],
  maxSteps: 10,
  icon: '📁'
}

// 内置技能 3：网络调研
{
  name: 'web-research',
  description: '深度网络调研',
  systemPrompt: '你是调研专家，擅长搜索和综合分析...',
  tools: ['webSearch'],
  maxSteps: 8,
  icon: '🔍'
}
```

#### 后端模块结构

```
backend/src/
└── skills/
    ├── skill.module.ts
    ├── skill.service.ts
    ├── skill.registry.ts        ← 技能注册表
    ├── skill.interface.ts       ← SkillConfig 类型
    └── builtin/
        ├── general-chat.ts
        ├── file-ops.ts
        └── web-research.ts
```

#### 核心接口

```typescript
// skill.interface.ts
export interface SkillConfig {
  name: string;
  description: string;
  systemPrompt: string;
  toolNames: string[];     // 工具名称列表
  maxSteps: number;
  icon?: string;
}

// skill.registry.ts
@Injectable()
export class SkillRegistry {
  private skills = new Map<string, SkillConfig>();

  register(skill: SkillConfig) {
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillConfig | undefined {
    return this.skills.get(name);
  }

  list(): SkillConfig[] {
    return [...this.skills.values()];
  }
}
```

#### AgentService 改造

```typescript
// agent.service.ts
async run(
  messages: { role: string; content: string }[],
  skillName?: string,   // ← 新增
): Promise<string> {
  const skill = skillName
    ? this.skillRegistry.get(skillName)
    : this.skillRegistry.get('general-chat');  // 默认技能

  const result = await generateText({
    model: deepseek('deepseek-chat'),
    system: skill.systemPrompt,           // ← 动态 system prompt
    messages: messages.map(...),
    tools: this.resolveTools(skill.toolNames),  // ← 动态工具集
    stopWhen: stepCountIs(skill.maxSteps),      // ← 动态步数
  });

  return result.text;
}

private resolveTools(names: string[]): Record<string, Tool> {
  // 根据名称从 ToolRegistry 取出对应工具
  const tools: Record<string, Tool> = {};
  for (const name of names) {
    const tool = this.toolRegistry.get(name);
    if (tool) tools[name] = tool;
  }
  return tools;
}
```

#### 前端切换技能

```typescript
// 在 ChatPanel 或 Sidebar 中
const [skill, setSkill] = useState('general-chat');

// 发送时带上 skillName
await fetch('/api/chat', {
  body: JSON.stringify({ messages, skillName: skill }),
});
```

---

## 实施顺序

```
Phase 1  ████  后端 Session API
  ├── SessionService（JSON 文件存储）
  ├── SessionController（CRUD 5 个接口）
  └── 测试：curl 创建/获取/删除 session

Phase 2  ████  前端 Session 侧边栏 + 布局改造
  ├── App.tsx 改 flex row 布局
  ├── Sidebar + SessionList + SessionItem
  ├── api/session.ts（fetch 封装）
  └── 测试：侧边栏显示、切换、新建、删除

Phase 3  ████  消息操作（copy + edit）
  ├── MessageBubble 组件（拆分 user/assistant）
  ├── hover 显示 copy/edit 按钮
  ├── edit 模式 + 分叉逻辑
  └── 测试：复制消息、编辑消息后重新发送

Phase 4  ████  Assistant 排版优化
  ├── 安装 react-markdown + react-syntax-highlighter
  ├── AssistantBubble 组件
  ├── 代码块/表格/链接自定义渲染
  └── CSS 优化：表格响应式、代码块滚动

Phase 5  ████  Skill 系统
  ├── SkillRegistry + SkillService
  ├── 3 个内置技能定义
  ├── AgentService 改造接受 skillName
  ├── /api/skills 接口
  └── 前端 SkillSelector 组件

Phase 6  ██   流式输出（后续可选）
  ├── AgentService 改用 streamText
  ├── Controller 返回 SSE
  └── 前端读取 stream 逐步渲染
```

---

## 前后端接口汇总

| 方法 | 路径 | 需求 | 状态 |
|------|------|------|------|
| `POST` | `/api/chat` | 发送消息 | 已有 |
| `GET` | `/api/sessions` | Session 列表 | 新增 |
| `GET` | `/api/sessions/:id` | Session 详情 | 新增 |
| `POST` | `/api/sessions` | 新建 Session | 新增 |
| `PATCH` | `/api/sessions/:id` | 更新 Session | 新增 |
| `DELETE` | `/api/sessions/:id` | 删除 Session | 新增 |
| `GET` | `/api/skills` | 技能列表 | 新增 |

---

## 关键文件变更清单

### 新建文件

```
backend/src/session/session.module.ts
backend/src/session/session.controller.ts
backend/src/session/session.service.ts
backend/src/session/session.interface.ts
backend/src/skills/skill.module.ts
backend/src/skills/skill.service.ts
backend/src/skills/skill.registry.ts
backend/src/skills/skill.interface.ts
backend/src/skills/builtin/general-chat.ts
backend/src/skills/builtin/file-ops.ts
backend/src/skills/builtin/web-research.ts

frontend/src/types/session.ts
frontend/src/api/session.ts
frontend/src/hooks/useChat.ts
frontend/src/hooks/useSessions.ts
frontend/src/components/Sidebar.tsx
frontend/src/components/Sidebar.css
frontend/src/components/SessionItem.tsx
frontend/src/components/SessionItem.css
frontend/src/components/MessageBubble.tsx
frontend/src/components/MessageBubble.css
frontend/src/components/AssistantBubble.tsx
frontend/src/components/AssistantBubble.css
frontend/src/components/SkillSelector.tsx
frontend/src/components/SkillSelector.css
```

### 修改文件

```
backend/src/agent/agent.service.ts     ← 接入 SkillRegistry
backend/src/agent/agent.controller.ts  ← 接收 sessionId + skillName
backend/src/agent/agent.module.ts      ← 导入 SessionModule, SkillModule
backend/src/app.module.ts              ← 导入新模块

frontend/src/App.tsx                   ← flex row 布局
frontend/src/App.css                   ← 布局样式
frontend/src/ChatPanel.tsx             ← 接入 session + skill
frontend/src/ChatPanel.css
frontend/src/MessageList.tsx           ← 使用 MessageBubble
frontend/src/MessageList.css
frontend/src/types/chat.ts             ← 扩展 Message 类型
frontend/src/api/agent.ts              ← 发送 sessionId + skillName
```
