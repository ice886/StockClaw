# StockClaw Architecture v5 — 改进方案

> 基于 v4 完整实现后的反思，从产品、架构、数据质量、算法四个维度梳理下一阶段需要改进、新增和删除的内容。

---

## 一、现状问题总结

完成 Phase A–C 后，系统可以端到端跑通，但实际使用中暴露出以下核心问题：

| 层面 | 问题 |
|------|------|
| 数据质量 | Exa 返回大量重复/低质新闻，噪音比约 70% |
| AI 提取 | DeepSeek 对英文财经内容的结构化提取偶有幻觉，importance 评级不稳定 |
| 股票分析 | 信号置信度缺乏历史校准，数字可信度低 |
| 推送体验 | 每次全量推送，无法区分"新事件"与"已推过的事件" |
| 前端 | Dashboard 为只读视图，无法在界面上手动添加名人或调整搜索策略 |
| 架构 | `MonitorService` 串行处理所有名人，5人×3查询需要约 30–60s |

---

## 二、产品层改进

### 2.1 删除

- **移除 `MONITOR_MAX_EVENTS_PER_RUN` 环境变量**：当前实现中未实际使用，配置项造成误导
- **移除飞书卡片中的 medium/low 信号展示**：信息密度过高，用户反馈阅读负担重；medium/low 仅在 dashboard 保留

### 2.2 修改

- **推送策略：全量 → 增量**
  - 每次推送前对比上次报告，只推送"新出现"的事件（按 `sourceUrl` 或 `title` hash 去重）
  - 同一事件在多个来源出现时合并为一条，列出来源列表

- **监控间隔动态化**
  - 当前固定 cron `0 */4 * * *`，改为读取 `config.intervalHours` 动态调度
  - 支持交易时段（09:30–16:00 ET）高频（1h）、非交易时段低频（6h）的自动切换

- **飞书卡片改版**
  - 按名人分组而非按 importance 分组，更符合用户跟踪习惯
  - 新增"与上次相比"标注：首次出现标 🆕，置信度上升标 ↑，下降标 ↓

### 2.3 新增

- **用户反馈回路**：在飞书卡片中加入"准确 / 不准确"交互按钮（飞书卡片回调），记录到 `data/feedback/` 用于后续 prompt 优化

- **自定义名人**：前端 ConfigDrawer 支持完整的增删改，包括手动输入 ticker、aliases、searchKeywords，不限于内置列表

- **事件去重视图**：Dashboard 新增"已过滤"tab，展示被去重/降级的事件，方便调试过滤策略

---

## 三、架构层改进

### 3.1 删除

- **删除 `celebrity.interface.ts` 单独文件**：`Celebrity` 类型已在 `celebrities.config.ts` 定义并被 `monitor.interfaces.ts` 引用，两处定义造成混乱，统一到 `monitor.interfaces.ts`

- **删除 `ExtractedEvent` 中间类型的宽松 `string` 字段**：用 Zod schema 替代裸 `interface`，在解析边界直接收窄类型，消除 `as 'high'` 这类类型断言补丁

### 3.2 修改

**并行化 MonitorService**

当前实现串行 `for` 循环，改为 `Promise.all` 并行处理各名人：

```typescript
// 当前（串行，~60s）
for (const celebrity of enabledCelebrities) { ... }

// 改为（并行，~15s）
const results = await Promise.all(
  enabledCelebrities.map(c => this.processCelebrity(c, onProgress))
);
```

注意：需要限制并发数（建议 3），避免同时打爆 Exa API rate limit。

**引入 Zod 解析替代手动类型断言**

```typescript
// event-extractor.service.ts
import { z } from 'zod';

const EventSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sourceUrl: z.string().url().optional().default(''),
  sourceType: z.enum(['news', 'social', 'official']).default('unknown' as any)
    .catch('unknown'),
  publishedAt: z.string().optional().default(''),
  importance: z.enum(['high', 'medium', 'low']).catch('low'),
});
```

这样 `sourceType` / `importance` 的类型收窄由 Zod 在 parse 时完成，不需要 `includes()` + `as` 组合。

**MonitorConfig 持久化改为双写**

当前 `saveConfig()` 直接覆盖文件，高并发下（手动触发 + cron 同时）有竞态。改为：
1. 读取 → merge → 写入的原子操作
2. 加文件锁（`proper-lockfile` 或简单的 `.lock` 文件检查）

### 3.3 新增

**`EventDeduplicator` 服务**

```
backend/src/monitor/
  └── event-deduplicator.service.ts
```

职责：接收本次 `CelebrityEvent[]` 和上次报告的事件列表，返回 `{ newEvents, mergedEvents, filteredCount }`。

去重策略（按优先级）：
1. URL 完全匹配 → 直接去重
2. Title 相似度 > 0.85（简单 Jaccard on words）→ 合并，保留最高 importance
3. 同名人 + 同 ticker + 同日期窗口内 → 合并

**`ConfidenceCalibrator`（轻量版）**

在 `StockAnalyzerService` 输出信号后，基于历史同类事件的反馈记录（feedback JSON）对置信度做简单修正：

```
adjusted_confidence = raw_confidence × calibration_factor(eventType, celebrity)
```

初期 `calibration_factor` 默认 1.0，随用户反馈积累逐步修正。不引入 ML，纯规则表。

**`fetch-url` 工具（Phase B 遗留）**

```
backend/src/tools/builtin/fetch-url.ts
```

用于在 Exa 返回摘要不足时，抓取原文页面内容（带超时 5s + 内容截断 3000 字），供 EventExtractorService 补充上下文。

---

## 四、算法 / Prompt 层改进

### 4.1 EventExtractorService — Prompt 改进

**当前问题：** importance 评级不稳定，同一条新闻在不同运行中偶尔 high↔medium 漂移。

**改进方案：Few-shot 示例注入**

在 system prompt 中加入 3–5 条标注好的示例，强制模型对齐评级标准：

```
示例（high）：
  输入：Jensen Huang confirmed NVDA will supply H200 to Samsung for HBM4 co-development
  输出：importance=high，原因：官方合作公告 + 直接涉及供应链

示例（low）：
  输入：Jensen Huang gave keynote at CES 2025, discussed AI trends
  输出：importance=low，原因：会议演讲，无新信息披露
```

**当前问题：** 对非英文内容（日文、韩文财经媒体）提取质量差。

**改进方案：** 先用 DeepSeek 做一次翻译/规范化，再送入提取 prompt，两步 pipeline。

### 4.2 StockAnalyzerService — 置信度框架

**当前：** 模型自由输出 0–100 数字，无约束，经常出现 85–90 区间的虚高置信度。

**改进：显式评分矩阵**

在 prompt 中定义置信度区间的含义：

```
置信度映射规则（必须遵守）：
- 90–100：官方新闻稿或监管文件，直接涉及财务数据
- 70–89 ：可信媒体报道 + 历史上同类事件有明确股价反应
- 50–69 ：非官方来源或间接影响
- 30–49 ：社交媒体传言，无二次验证
- < 30  ：信息极度不确定，建议不推送
```

**新增：** 推送阈值从固定 `confidence >= 70` 改为可配置（`config.signalThreshold`，默认 65）。

### 4.3 CrawlerService — 搜索策略优化

**当前问题：** 3 条固定查询模板，搜到大量重复结果。

**改进：**

1. **查询去相关性**：第一条查名人+事件，第二条查名人+ticker+investor，第三条查名人+具体 keyword（不重复第一条的范围）
2. **时间窗口精细化**：对 `importance=high` 的历史事件所在时间段，自动缩小搜索窗口（hoursBack / 2）减少噪音
3. **来源权重**：优先返回 bloomberg.com / reuters.com / sec.gov，社交媒体结果 importance 上限设为 medium

---

## 五、前端层改进

### 5.1 删除

- **移除 `LatestReport` 中的空变量**（当前 MonitorDashboard 里有一个未使用的 `highEvents` 计算，已是技术债）

### 5.2 修改

- **MonitorDashboard 布局**：当前信号和事件在同一纵向列表，改为左右分栏（信号看板 | 事件流），与 v4 设计稿对齐
- **EventCard**：新增"是否为新事件"标记（对比上次报告），新事件显示 🆕 徽章
- **ReportHistory**：新增翻页（每页 10 条），当前全量加载在报告积累后性能会下降

### 5.3 新增

- **实时刷新**：Dashboard 每 5 分钟自动调用 `GET /api/monitor/status` 刷新状态，无需手动刷新页面
- **信号走势迷你图**：StockSignalCard 底部显示该 ticker 最近 5 次出现时的置信度折线（从历史报告聚合），直观看到信号趋势
- **空状态引导**：首次进入 Monitor 页时，显示配置向导（2步：填 Webhook → 选名人），降低冷启动门槛

---

## 六、删除清单汇总

| 内容 | 原因 |
|------|------|
| `MONITOR_MAX_EVENTS_PER_RUN` 环境变量 | 未实际使用，造成误导 |
| `celebrity.interface.ts` 独立文件 | 与 `celebrities.config.ts` 重复定义 |
| `MonitorDashboard` 里的 `highEvents` 未用变量 | 技术债，TypeScript 会警告 |
| 飞书卡片 medium/low 信号 | 信息过载，用户体验差 |
| `as 'high'` / `as 'news'` 类型断言补丁 | 用 Zod schema 替代，从根本上解决 |

---

## 七、新增依赖

| 包 | 用途 |
|----|------|
| `zod` | 已有（NestJS 生态），用于 AI 输出 schema 校验 |
| `p-limit` | 控制 `Promise.all` 并发数，轻量无副作用 |
| `proper-lockfile` | 配置文件并发写保护（可选，先用简单 flag 代替） |

---

## 八、实施优先级

```
P0（影响正确性）
  ├── Zod 替换类型断言（消除 TS 补丁）
  └── 并行化 MonitorService（性能）

P1（影响数据质量）
  ├── EventDeduplicator 服务
  ├── Few-shot prompt 改进（importance 稳定性）
  └── 置信度评分矩阵

P2（影响产品体验）
  ├── 增量推送（只推新事件）
  ├── 飞书卡片按名人分组
  └── Dashboard 左右分栏布局

P3（长期价值）
  ├── ConfidenceCalibrator（需要积累反馈数据）
  ├── 信号走势迷你图
  └── 交易时段动态间隔
```
