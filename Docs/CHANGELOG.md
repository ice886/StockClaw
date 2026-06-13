# 开发日志

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
