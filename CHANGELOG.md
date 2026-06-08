# 开发日志

## 2026-06-08

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
- DuckDuckGo 免费搜索降级方案
