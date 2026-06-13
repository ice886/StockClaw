# StockClaw — 名人事件监控 & 股票预测系统 完整方案

> 目标：自动监控黄仁勋等科技名人的公开动态，结合 AI 分析对相关股票的潜在影响，定时通过飞书推送报告。

---

## 一、产品设计

### 核心功能

```
┌─────────────────────────────────────────────────────────────┐
│                    StockClaw Monitor                         │
│                                                             │
│  监控层          分析层              推送层                   │
│  ─────────       ─────────           ─────────               │
│  名人追踪   →    事件提取   →    AI 股票影响分析  →  飞书通知  │
│  新闻聚合        重要性打分         置信度评级                 │
│  社交媒体        关联股票识别        每N小时定时推送            │
└─────────────────────────────────────────────────────────────┘
```

### 监控对象（可在前端配置）

**初始内置名人列表：**
- 黄仁勋（Jensen Huang）— 英伟达 NVDA
- 苏姿丰（Lisa Su）— AMD
- 萨姆·奥特曼（Sam Altman）— OpenAI/相关AI股
- 马斯克（Elon Musk）— Tesla TSLA, xAI
- 蒂姆·库克（Tim Cook）— Apple AAPL
- 扎克伯格（Mark Zuckerberg）— Meta META

**关联股票映射（可扩展）：**
- 名人 → 所在公司股票（主要）
- 名人 → 提及的合作方/竞争对手股票（次要）
- 示例：黄仁勋访问三星/海力士 → NVDA ↑, 005930.KS ↑, 000660.KS ↑

### 报告格式（飞书消息）

```
📡 StockClaw 市场情报 · 2024-01-15 09:00

━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 高影响事件（过去4小时）

[黄仁勋 · NVDA]
📍 事件：Jensen Huang 确认访问韩国，与三星/海力士高层会面
📰 来源：Bloomberg · 2小时前
📈 影响分析：
  · NVDA +1.2% 预期（供应链确认，HBM3E 合作信号）
  · 000660.KS（SK海力士）+0.8% 预期
  · 置信度：★★★★☆ (82%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 中影响事件

[黄仁勋 · MRVL]
📍 事件：Huang 在 GTC 演讲中提及 Marvell 定制芯片合作
📰 来源：X/Twitter · 5小时前
📈 影响分析：
  · MRVL +2-3% 预期（定制ASIC需求确认）
  · 置信度：★★★☆☆ (65%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️ 低影响/观察中：3 条（查看详情）

⏱ 下次推送：4小时后 · 设置 /monitor config
```

---

## 二、技术架构

### 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                         StockClaw v2                             │
│                                                                  │
│  Frontend (React)              Backend (NestJS)                  │
│  ─────────────────             ───────────────────               │
│  MonitorDashboard   ←REST→    MonitorModule                      │
│  CelebrityConfig              │  ├── CrawlerService (定时抓取)   │
│  AlertHistory                 │  ├── EventExtractorService (AI)  │
│  NotifySettings               │  └── StockAnalyzerService (AI)   │
│                               │                                  │
│                               SchedulerModule (cron)             │
│                               │  └── MonitorScheduler            │
│                               │       (每N小时触发全流程)          │
│                               │                                  │
│                               FeishuModule                       │
│                               │  └── FeishuService (推送)        │
│                               │                                  │
│                               AgentModule (现有，优化)            │
│                               │  ├── agent.service.ts            │
│                               │  └── context engineering ↑       │
│                               │                                  │
│                               SkillModule (扩展)                  │
│                                  ├── general-chat (现有)          │
│                                  ├── file-ops (现有)              │
│                                  ├── web-research (现有)          │
│                                  ├── celebrity-monitor (新增) ←   │
│                                  └── stock-analysis (新增) ←      │
└──────────────────────────────────────────────────────────────────┘

外部依赖：
  Exa Search API (现有) → 新闻/事件搜索
  DeepSeek API (现有)   → AI 分析
  飞书 Webhook API (新增) → 消息推送
```

### 数据流

```
[Cron Trigger: 每N小时]
        │
        ▼
MonitorScheduler.run()
        │
        ├─→ 对每个监控名人并行执行：
        │     CrawlerService.fetchRecentEvents(celebrity)
        │       └── Exa Search: "{name} site:bloomberg.com OR reuters.com past_24h"
        │       └── Exa Search: "{name} site:x.com OR twitter.com past_4h"
        │       └── 返回 RawEvent[]
        │
        ├─→ EventExtractorService.extract(rawEvents)
        │     └── AgentService.run(context) with celebrity-monitor skill
        │       └── 过滤重复/低价值事件，提取结构化 CelebrityEvent
        │
        ├─→ StockAnalyzerService.analyze(events)
        │     └── AgentService.run(context) with stock-analysis skill
        │       └── 生成 StockSignal[] (ticker, direction, confidence, reasoning)
        │
        ├─→ MonitorService.saveReport(report)
        │     └── 存入 data/reports/<timestamp>.json
        │
        └─→ FeishuService.send(report)
              └── POST webhook → 飞书群/个人
```

---

## 三、后端实现方案

### 3.1 新增模块结构

```
backend/src/
│
├── monitor/                          ← 核心监控模块
│   ├── monitor.module.ts
│   ├── monitor.controller.ts         ← REST API (手动触发、配置查询)
│   ├── monitor.service.ts            ← 协调各子服务
│   ├── monitor.scheduler.ts          ← @Cron 定时任务
│   ├── crawler.service.ts            ← Exa 搜索封装
│   ├── event-extractor.service.ts    ← AI 事件提取
│   ├── stock-analyzer.service.ts     ← AI 股票影响分析
│   └── interfaces/
│       ├── celebrity.interface.ts    ← Celebrity, CelebrityEvent
│       ├── stock-signal.interface.ts ← StockSignal, StockReport
│       └── monitor-config.interface.ts
│
├── feishu/                           ← 飞书推送模块
│   ├── feishu.module.ts
│   ├── feishu.service.ts
│   └── templates/
│       └── report.template.ts        ← 消息格式化
│
├── skills/builtin/                   ← 扩展两个新 Skill
│   ├── celebrity-monitor.ts          ← 事件提取 skill
│   └── stock-analysis.ts            ← 股票分析 skill
│
└── config/
    └── celebrities.config.ts         ← 初始名人+股票映射配置
```

### 3.2 核心接口定义

```typescript
// monitor/interfaces/celebrity.interface.ts

export interface Celebrity {
  id: string;
  name: string;          // "Jensen Huang"
  nameZh: string;        // "黄仁勋"
  aliases: string[];     // ["Jensen", "Huang"]
  primaryTicker: string; // "NVDA"
  relatedTickers: string[];  // ["TSM", "MRVL", "AVGO"]
  searchKeywords: string[];  // 额外搜索关键词
  enabled: boolean;
}

export interface CelebrityEvent {
  id: string;
  celebrity: string;         // celebrity.id
  title: string;
  summary: string;           // AI 提炼的摘要（100字内）
  sourceUrl: string;
  sourceType: 'news' | 'social' | 'official';
  publishedAt: Date;
  fetchedAt: Date;
  importance: 'high' | 'medium' | 'low';
  raw: string;               // 原始内容
}

// monitor/interfaces/stock-signal.interface.ts

export interface StockSignal {
  ticker: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  magnitude: 'strong' | 'moderate' | 'weak';
  confidence: number;        // 0-100
  reasoning: string;         // AI 推理说明
  timeHorizon: 'intraday' | '1-3days' | '1week';
  relatedEvent: string;      // CelebrityEvent.id
}

export interface MonitorReport {
  id: string;
  generatedAt: Date;
  intervalHours: number;
  events: CelebrityEvent[];
  signals: StockSignal[];
  summary: string;           // 整体摘要（发飞书用）
  feishuSent: boolean;
}
```

### 3.3 MonitorScheduler

```typescript
// monitor/monitor.scheduler.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MonitorService } from './monitor.service';
import { MonitorConfigService } from './monitor-config.service';

@Injectable()
export class MonitorScheduler {
  constructor(
    private monitor: MonitorService,
    private config: MonitorConfigService,
  ) {}

  // 默认每4小时执行，可通过配置动态调整
  @Cron('0 */4 * * *')
  async runScheduled() {
    if (!this.config.isEnabled()) return;
    await this.monitor.runFullCycle();
  }

  // 手动触发（用于测试/前端按钮）
  async runManual() {
    return this.monitor.runFullCycle();
  }
}
```

### 3.4 CrawlerService（基于现有 Exa）

```typescript
// monitor/crawler.service.ts
@Injectable()
export class CrawlerService {
  async fetchEvents(celebrity: Celebrity): Promise<RawEvent[]> {
    const queries = this.buildQueries(celebrity);
    const results = await Promise.all(
      queries.map(q => this.exaSearch(q))
    );
    return this.dedup(results.flat());
  }

  private buildQueries(c: Celebrity): SearchQuery[] {
    const name = c.name;
    const hoursBack = this.config.intervalHours;
    return [
      // 新闻搜索
      { query: `"${name}" announcement OR visit OR partnership`,
        numResults: 5, startPublishedDate: hoursAgo(hoursBack) },
      // 股票相关
      { query: `"${name}" ${c.primaryTicker} stock investor`,
        numResults: 3, startPublishedDate: hoursAgo(hoursBack) },
    ];
  }
}
```

### 3.5 Agent Context Engineering 优化（现有 AgentService）

当前问题：
- system prompt 是静态字符串，无动态上下文注入
- 历史消息裁剪策略简单（slice(-20)）
- 没有 token 预算管理

优化方案：

```typescript
// agent/context-builder.ts — 新增

export class ContextBuilder {
  /**
   * 动态 system prompt 构建：注入当前时间、任务上下文
   */
  buildSystem(skill: SkillConfig, extra?: Record<string, string>): string {
    let prompt = typeof skill.systemPrompt === 'function'
      ? skill.systemPrompt()
      : skill.systemPrompt;

    // 注入动态变量
    prompt = prompt.replace('{{DATE}}', new Date().toISOString().split('T')[0]);
    prompt = prompt.replace('{{TIME}}', new Date().toLocaleTimeString('zh-CN'));
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        prompt = prompt.replace(`{{${k}}}`, v);
      }
    }
    return prompt;
  }

  /**
   * 智能历史裁剪：保留最近N条 + 重要消息
   * 优先级：最新消息 > 包含工具结果的消息 > 普通消息
   */
  trimHistory(messages: Message[], maxTokenBudget = 8000): Message[] {
    // 估算 token（粗略：字符数 / 4）
    const estimate = (m: Message) => JSON.stringify(m).length / 4;
    let budget = maxTokenBudget;
    const result: Message[] = [];

    // 从最新消息往前保留
    for (let i = messages.length - 1; i >= 0; i--) {
      const cost = estimate(messages[i]);
      if (budget - cost < 0) break;
      budget -= cost;
      result.unshift(messages[i]);
    }
    return result;
  }
}
```

### 3.6 新增 Skill 定义

```typescript
// skills/builtin/celebrity-monitor.ts
export const celebrityMonitorSkill: SkillConfig = {
  name: 'celebrity-monitor',
  description: '科技名人事件提取与重要性评级',
  systemPrompt: `你是一个专业的科技行业分析师，今天是 {{DATE}}。
你的任务是从原始新闻/社交媒体内容中：
1. 识别真正有投资价值的事件（排除宣传软文、重复报道）
2. 判断事件重要性：high（可能影响股价1%+）/ medium / low
3. 提取结构化数据：事件摘要、涉及公司、时间

重要性判断标准：
- high：官方合作公告、财务数据、重大人事变动、监管事件
- medium：非官方访问、产品暗示、行业表态
- low：演讲/采访（无新信息）、社交互动`,
  toolNames: [],
  maxSteps: 1,
  icon: '🔍',
};

// skills/builtin/stock-analysis.ts
export const stockAnalysisSkill: SkillConfig = {
  name: 'stock-analysis',
  description: '基于名人事件的股票影响分析',
  systemPrompt: `你是一个量化分析师，今天是 {{DATE}}。
基于科技名人事件，分析对相关股票的短期影响。

分析框架：
1. 直接影响：事件直接涉及的公司
2. 间接影响：供应链、竞争对手、合作伙伴
3. 置信度评估：信息来源可靠性 × 历史类似事件成功率

输出格式为 JSON：
{
  "signals": [
    { "ticker": "NVDA", "direction": "bullish", "magnitude": "moderate",
      "confidence": 75, "reasoning": "...", "timeHorizon": "1-3days" }
  ]
}

注意：不构成投资建议，仅供参考。`,
  toolNames: [],
  maxSteps: 1,
  icon: '📈',
};
```

### 3.7 FeishuService

```typescript
// feishu/feishu.service.ts
@Injectable()
export class FeishuService {
  private webhookUrl: string;

  constructor(private config: ConfigService) {
    this.webhookUrl = config.get('FEISHU_WEBHOOK_URL');
  }

  async sendReport(report: MonitorReport): Promise<void> {
    const card = this.buildCard(report);
    await axios.post(this.webhookUrl, { msg_type: 'interactive', card });
  }

  private buildCard(report: MonitorReport) {
    const highSignals = report.signals.filter(s => s.confidence >= 70);
    // 飞书卡片消息格式（富文本卡片）
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: `📡 StockClaw 市场情报 · ${formatDate(report.generatedAt)}` },
        template: 'blue',
      },
      elements: [
        ...highSignals.map(s => buildSignalBlock(s, report)),
        { tag: 'hr' },
        { tag: 'note', elements: [{ tag: 'plain_text', content: `⏱ 监控周期 ${report.intervalHours}h · 仅供参考，非投资建议` }] },
      ],
    };
  }
}
```

### 3.8 配置持久化

监控配置（名人列表、间隔、飞书 Webhook）存为 JSON 文件，路径 `data/monitor-config.json`，与现有 session 存储模式一致，无需引入数据库。

```typescript
interface MonitorConfig {
  enabled: boolean;
  intervalHours: number;       // 默认 4
  feishuWebhookUrl: string;
  celebrities: Celebrity[];
  lastRunAt?: Date;
  nextRunAt?: Date;
}
```

---

## 四、前端设计

### 4.1 新增页面结构

```
App.tsx (现有布局)
├── Sidebar (现有)
│   └── + 导航入口：💬 Chat | 📡 Monitor
└── MainArea
    ├── ChatPanel (现有)
    └── MonitorDashboard (新增)
        ├── MonitorHeader (状态 + 手动触发按钮)
        ├── StatsBar (今日事件数 / 高影响信号数 / 上次推送时间)
        ├── EventFeed (事件流，实时滚动)
        │   └── EventCard × N
        ├── SignalBoard (股票信号看板)
        │   └── StockSignalCard × N
        └── ConfigPanel (抽屉/侧边设置)
            ├── CelebrityList (增删名人)
            ├── IntervalPicker (1h/2h/4h/8h/24h)
            └── FeishuWebhookInput
```

### 4.2 MonitorDashboard 布局

```
┌─────────────────────────────────────────────────────────┐
│  📡 StockClaw Monitor          [▶ 立即运行]  [⚙ 设置]   │
│  状态: ● 运行中  间隔: 4h  下次: 2h 15m 后               │
├──────────────┬──────────────────────────────────────────┤
│  今日事件  12 │  信号看板                                 │
│  高影响    3  │  ┌─────────────────────────────────────┐ │
│  已推送    2  │  │ NVDA  📈 +中等  置信82%  1-3天       │ │
├──────────────┤  │ MRVL  📈 +弱    置信65%  盘内         │ │
│  事件流      │  │ 000660 📈 +弱   置信58%  1-3天        │ │
│  ──────────  │  └─────────────────────────────────────┘ │
│ [黄仁勋] 2h  │                                           │
│ 访问三星海力士│  历史报告                                  │
│ 🔥 高影响    │  ────────                                  │
│              │  2024-01-15 09:00  [查看] [重发飞书]       │
│ [黄仁勋] 5h  │  2024-01-14 17:00  [查看]                 │
│ GTC 提及MRVL │  2024-01-14 09:00  [查看]                 │
│ ⚡ 中影响    │                                           │
└──────────────┴──────────────────────────────────────────┘
```

### 4.3 前端新增文件

```
frontend/src/
├── components/monitor/
│   ├── MonitorDashboard.tsx
│   ├── MonitorDashboard.css
│   ├── EventCard.tsx            ← 单条事件展示
│   ├── StockSignalCard.tsx      ← 股票信号卡片（涨跌方向 + 置信度进度条）
│   ├── ConfigDrawer.tsx         ← 设置抽屉
│   ├── CelebrityList.tsx        ← 名人管理列表
│   └── ReportHistory.tsx        ← 历史报告列表
├── api/
│   └── monitor.ts               ← monitor REST 调用
├── hooks/
│   └── useMonitor.ts            ← 监控状态 hook（SSE 实时更新进度）
└── types/
    └── monitor.ts               ← 前端类型定义
```

---

## 五、API 设计

### 新增端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/monitor/status` | 当前状态、下次运行时间 |
| `POST` | `/api/monitor/run` | 手动触发一次完整扫描 |
| `GET` | `/api/monitor/reports` | 历史报告列表 |
| `GET` | `/api/monitor/reports/:id` | 报告详情 |
| `POST` | `/api/monitor/reports/:id/resend` | 重新发送飞书 |
| `GET` | `/api/monitor/config` | 读取当前配置 |
| `PUT` | `/api/monitor/config` | 更新配置（名人、间隔、Webhook） |
| `GET` | `/api/monitor/stream` | SSE：实时推送扫描进度 |

### SSE 进度事件（手动运行时）

```typescript
// 运行时实时推送进度到前端
{ type: 'progress', stage: 'crawling', celebrity: 'Jensen Huang', progress: 20 }
{ type: 'progress', stage: 'extracting', events: 7, progress: 50 }
{ type: 'progress', stage: 'analyzing', signals: 3, progress: 80 }
{ type: 'done', reportId: 'xxx', feishuSent: true }
```

---

## 六、实施路线图

### Phase A — 后端核心（优先）

**目标：** 可以跑通一次完整的"抓取 → AI分析 → 飞书推送"流程

1. 安装依赖：`@nestjs/schedule`（cron）、`axios`（飞书推送）
2. 创建 `celebrities.config.ts`（初始5个名人）
3. 实现 `CrawlerService`（复用现有 Exa webSearch tool，封装为 service 直接调用）
4. 实现 `EventExtractorService`（调用 AgentService，使用 celebrity-monitor skill）
5. 实现 `StockAnalyzerService`（调用 AgentService，使用 stock-analysis skill）
6. 实现 `FeishuService`（飞书卡片消息）
7. 实现 `MonitorService`（串联上述 service）
8. 实现 `MonitorScheduler`（cron + 手动触发接口）
9. 新增两个 Skill：`celebrity-monitor`、`stock-analysis`
10. `.env` 新增 `FEISHU_WEBHOOK_URL`、`MONITOR_INTERVAL_HOURS`

### Phase B — Agent Context 优化

**目标：** 提升现有 agent 分析质量

1. 新增 `ContextBuilder` 工具类（动态变量注入 + 智能历史裁剪）
2. 改造 `ChatService` 使用 `ContextBuilder`
3. 优化 `web-research` skill 的 system prompt（更结构化的输出格式要求）
4. 工具层：新增 `fetch-url` 工具（抓取具体新闻页面内容，辅助 Exa 搜索）

### Phase C — 前端监控面板

**目标：** 可视化配置与查看结果

1. 新增 `MonitorDashboard` 页面
2. 实现 `EventCard`、`StockSignalCard` 组件
3. 实现 `ConfigDrawer`（名人管理 + 飞书 Webhook 配置）
4. 实现 `useMonitor` hook + SSE 实时进度
5. Sidebar 导航扩展（Chat / Monitor 切换）

### Phase D — 数据质量提升

1. 去重策略：同一事件在不同来源出现时合并
2. 历史记录对比：同一股票24h内多次分析时，对比置信度变化
3. 误判追踪：用户可标注"信号准确/不准确"，用于 prompt 优化
4. 更多数据源：Yahoo Finance RSS、SEC 文件、公司官网 IR 页面

---

## 七、环境变量（`.env` 新增）

```bash
# 现有
DEEPSEEK_API_KEY=...
EXA_API_KEY=...

# 新增
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
MONITOR_INTERVAL_HOURS=4         # 监控间隔（小时）
MONITOR_ENABLED=true             # 是否启用定时任务
MONITOR_MAX_EVENTS_PER_RUN=20    # 每次最多处理事件数
```

---

## 八、关键技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 新闻来源 | Exa Search API | 现有集成，语义搜索质量高，支持时间过滤 |
| AI 分析 | DeepSeek（现有） | 成本低，中文理解好，结构化输出稳定 |
| 消息推送 | 飞书 Webhook | 无需 OAuth，配置简单，富文本卡片体验好 |
| 数据存储 | JSON 文件（现有模式） | 无需引入 DB，reports 数据量小，够用 |
| 定时任务 | `@nestjs/schedule` | NestJS 官方方案，与现有框架无缝集成 |
| 前端状态 | React hooks（现有模式） | 保持与现有代码一致，不引入新状态库 |

---

## 九、风险与注意事项

1. **Exa API 用量**：每次全量扫描约消耗 `名人数 × 2次` 搜索请求，4小时间隔下每天约 `5×2×6 = 60次`，注意 Exa 的 quota。
2. **AI 分析准确性**：股票预测本质上不可靠，系统定位为"信息聚合 + 辅助判断"，飞书消息需明确标注"非投资建议"。
3. **飞书 Webhook 频率限制**：飞书机器人每分钟最多发5条，确保不在短时间内批量发送。
4. **噪音过滤**：科技名人新闻量很大，需要严格的 importance 过滤，否则会造成信息疲劳。建议每次推送只推 `importance=high` 的事件，medium/low 折叠或仅在 dashboard 显示。
