# Sidebar 股票信号速览 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把股票信号从主面板移到常驻 sidebar——sidebar 显示最新报告全部信号（按置信度降序，点击展开详情），主面板改为单栏事件流。

**Architecture:** 新建 `useLatestSignals` hook 独立拉取最新报告信号；新建 `SignalOverview` 展示组件（含可展开的 `SignalRow`）；`App.tsx` 用新增 `monitorRefreshKey` 在扫描完成后通知 Sidebar 刷新；`MonitorDashboard` 移除信号栏。方向/程度/时间窗标签常量抽到共享 `signalLabels.ts`。

**Tech Stack:** React 18 + TypeScript + Vite。前端无单测框架，验证以 `npm run build`（TS+Vite）+ 手动 dev 为主。

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `frontend/src/components/monitor/signalLabels.ts` | **新增**：方向/程度/时间窗标签 + 方向图标，共享常量 |
| `frontend/src/components/monitor/StockSignalCard.tsx` | **修改**：改用共享常量（去重） |
| `frontend/src/hooks/useLatestSignals.ts` | **新增**：拉取最新报告信号（降序） |
| `frontend/src/components/monitor/SignalOverview.tsx` | **新增**：信号速览列表 + 可展开行 |
| `frontend/src/components/monitor/SignalOverview.css` | **新增**：速览样式 |
| `frontend/src/components/Sidebar.tsx` | **修改**：monitor 视图渲染 SignalOverview |
| `frontend/src/components/monitor/MonitorDashboard.tsx` | **修改**：移除信号栏改单栏；扫描完成回调 |
| `frontend/src/App.tsx` | **修改**：monitorRefreshKey 接线 |

> 说明：`signalLabels.ts` 先建（Task 1），后续组件复用，避免重复定义。

---

## Task 1: 抽取共享标签常量 `signalLabels.ts`

**Files:**
- Create: `frontend/src/components/monitor/signalLabels.ts`
- Modify: `frontend/src/components/monitor/StockSignalCard.tsx`

- [ ] **Step 1: 创建共享常量文件**

创建 `frontend/src/components/monitor/signalLabels.ts`：

```typescript
import type { StockSignal } from '../../types/monitor';

export const directionIcon: Record<StockSignal['direction'], string> = {
  bullish: '📈',
  bearish: '📉',
  neutral: '➡️',
};

export const directionLabel: Record<StockSignal['direction'], string> = {
  bullish: '看涨',
  bearish: '看跌',
  neutral: '中性',
};

export const magnitudeLabel: Record<StockSignal['magnitude'], string> = {
  strong: '强',
  moderate: '中等',
  weak: '弱',
};

export const horizonLabel: Record<StockSignal['timeHorizon'], string> = {
  intraday: '盘内',
  '1-3days': '1-3天',
  '1week': '1周',
};
```

- [ ] **Step 2: StockSignalCard 改用共享常量**

编辑 `frontend/src/components/monitor/StockSignalCard.tsx`：删除文件内的四个本地常量定义（`directionIcon`、`directionLabel`、`magnitudeLabel`、`horizonLabel`），改为从 `signalLabels` import。最终文件顶部为：

```typescript
import type { StockSignal } from '../../types/monitor';
import { directionIcon, directionLabel, magnitudeLabel, horizonLabel } from './signalLabels';
import './StockSignalCard.css';

interface Props {
  signal: StockSignal;
}

export function StockSignalCard({ signal }: Props) {
```

其余 JSX 主体（`return (...)`）保持不变。

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc -b`
Expected: 无错误（常量被复用，类型一致）。

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/monitor/signalLabels.ts src/components/monitor/StockSignalCard.tsx
git commit -m "refactor(monitor): extract shared signal label constants"
```

---

## Task 2: `useLatestSignals` hook

**Files:**
- Create: `frontend/src/hooks/useLatestSignals.ts`

- [ ] **Step 1: 创建 hook**

创建 `frontend/src/hooks/useLatestSignals.ts`：

```typescript
import { useState, useEffect } from 'react';
import { fetchReports, fetchReport } from '../api/monitor';
import type { StockSignal } from '../types/monitor';

/** 拉取最新报告的股票信号（按置信度降序）。refreshKey 变化时重新获取。 */
export function useLatestSignals(refreshKey: number): {
  signals: StockSignal[];
  loading: boolean;
} {
  const [signals, setSignals] = useState<StockSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const reports = await fetchReports();
        const latestId = reports[0]?.id;
        if (!latestId) {
          if (!cancelled) setSignals([]);
          return;
        }
        const report = await fetchReport(latestId);
        if (cancelled) return;
        const sorted = [...report.signals].sort(
          (a, b) => b.confidence - a.confidence,
        );
        setSignals(sorted);
      } catch {
        if (!cancelled) setSignals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { signals, loading };
}
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc -b`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/hooks/useLatestSignals.ts
git commit -m "feat(monitor): add useLatestSignals hook"
```

---

## Task 3: `SignalOverview` 展示组件

**Files:**
- Create: `frontend/src/components/monitor/SignalOverview.tsx`
- Create: `frontend/src/components/monitor/SignalOverview.css`

- [ ] **Step 1: 创建组件**

创建 `frontend/src/components/monitor/SignalOverview.tsx`：

```typescript
import { useState } from 'react';
import type { StockSignal } from '../../types/monitor';
import {
  directionLabel,
  magnitudeLabel,
  horizonLabel,
} from './signalLabels';
import './SignalOverview.css';

interface Props {
  signals: StockSignal[];
  loading: boolean;
}

const arrow: Record<StockSignal['direction'], string> = {
  bullish: '↑',
  bearish: '↓',
  neutral: '–',
};

export function SignalOverview({ signals, loading }: Props) {
  return (
    <div className="signal-overview">
      <div className="signal-overview__title">📊 股票信号</div>
      {loading ? (
        <div className="signal-overview__empty">加载中...</div>
      ) : signals.length === 0 ? (
        <div className="signal-overview__empty">暂无信号</div>
      ) : (
        <div className="signal-overview__list">
          {signals.map((s, i) => (
            <SignalRow key={`${s.ticker}-${s.relatedEventId}-${i}`} signal={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalRow({ signal }: { signal: StockSignal }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`signal-row signal-row--${signal.direction}`}>
      <button
        className="signal-row__head"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="signal-row__ticker">{signal.ticker}</span>
        <span className={`signal-row__arrow signal-row__arrow--${signal.direction}`}>
          {arrow[signal.direction]}
        </span>
        <span className="signal-row__conf">{signal.confidence}%</span>
      </button>
      {expanded && (
        <div className="signal-row__detail">
          <div className="signal-row__tags">
            <span>{directionLabel[signal.direction]}</span>
            <span>{magnitudeLabel[signal.magnitude]}</span>
            <span>{horizonLabel[signal.timeHorizon]}</span>
          </div>
          {signal.reasoning && (
            <div className="signal-row__reasoning">{signal.reasoning}</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建样式**

创建 `frontend/src/components/monitor/SignalOverview.css`：

```css
.signal-overview {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 8px;
  gap: 6px;
}

.signal-overview__title {
  font-size: 13px;
  font-weight: 600;
  color: #888;
  padding: 4px 4px 8px;
}

.signal-overview__empty {
  font-size: 13px;
  color: #999;
  padding: 12px 8px;
  text-align: center;
}

.signal-overview__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.signal-row {
  border-radius: 6px;
  border-left: 3px solid transparent;
  background: rgba(255, 255, 255, 0.03);
}
.signal-row--bullish { border-left-color: #2ecc71; }
.signal-row--bearish { border-left-color: #e74c3c; }
.signal-row--neutral { border-left-color: #95a5a6; }

.signal-row__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  text-align: left;
}

.signal-row__ticker {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
}

.signal-row__arrow--bullish { color: #2ecc71; }
.signal-row__arrow--bearish { color: #e74c3c; }
.signal-row__arrow--neutral { color: #95a5a6; }

.signal-row__conf {
  font-size: 13px;
  color: #aaa;
  font-variant-numeric: tabular-nums;
}

.signal-row__detail {
  padding: 0 10px 10px;
  font-size: 12px;
}

.signal-row__tags {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.signal-row__tags span {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #bbb;
}

.signal-row__reasoning {
  color: #ccc;
  line-height: 1.5;
}
```

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc -b`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/monitor/SignalOverview.tsx src/components/monitor/SignalOverview.css
git commit -m "feat(monitor): add SignalOverview component with expandable rows"
```

---

## Task 4: Sidebar 接入 SignalOverview

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: 修改 Sidebar**

编辑 `frontend/src/components/Sidebar.tsx`：

1a. 顶部 import 增加：

```typescript
import { useLatestSignals } from '../hooks/useLatestSignals';
import { SignalOverview } from './monitor/SignalOverview';
```

1b. `Props` 接口新增字段：

```typescript
  monitorRefreshKey: number;
```

1c. 函数签名解构新增 `monitorRefreshKey`：

```typescript
export function Sidebar({ activeId, onSelect, onNewSession, refreshKey, activeView, onViewChange, monitorRefreshKey }: Props) {
```

1d. 在 `const isCreating = useRef(false);` 之后调用 hook：

```typescript
  const { signals, loading: signalsLoading } = useLatestSignals(monitorRefreshKey);
```

1e. 在 `return` 的 `{activeView === 'chat' && (...)}` 块之后、`</div>` 之前，新增 monitor 分支：

```typescript
      {activeView === 'monitor' && (
        <SignalOverview signals={signals} loading={signalsLoading} />
      )}
```

- [ ] **Step 2: 验证编译（会因 App.tsx 未传 prop 而报错——预期）**

Run: `cd frontend && npx tsc -b`
Expected: 报错 —— `App.tsx` 处 `<Sidebar>` 缺少 `monitorRefreshKey` prop。这是预期的，Task 5 修复。

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/Sidebar.tsx
git commit -m "feat(monitor): render SignalOverview in sidebar monitor view"
```

---

## Task 5: App.tsx 接线 monitorRefreshKey

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 修改 App.tsx**

编辑 `frontend/src/App.tsx`，整体替换为：

```typescript
import { useState, useCallback } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { MonitorDashboard } from './components/monitor/MonitorDashboard';
import './App.css';

export default function App() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [monitorRefreshKey, setMonitorRefreshKey] = useState(0);
  const [activeView, setActiveView] = useState<'chat' | 'monitor'>('chat');

  const handleSessionUpdate = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const bumpMonitorRefresh = useCallback(() => {
    setMonitorRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar
        activeId={activeId}
        onSelect={setActiveId}
        onNewSession={setActiveId}
        refreshKey={refreshKey}
        activeView={activeView}
        onViewChange={setActiveView}
        monitorRefreshKey={monitorRefreshKey}
      />
      {activeView === 'monitor' ? (
        <MonitorDashboard onScanComplete={bumpMonitorRefresh} />
      ) : (
        <ChatPanel
          key={activeId ?? 'empty'}
          sessionId={activeId}
          onSessionUpdate={handleSessionUpdate}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译（会因 MonitorDashboard 未声明 onScanComplete 而报错——预期）**

Run: `cd frontend && npx tsc -b`
Expected: 报错 —— `MonitorDashboard` 不接受 `onScanComplete` prop。这是预期的，Task 6 修复。

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/App.tsx
git commit -m "feat(monitor): wire monitorRefreshKey between dashboard and sidebar"
```

---

## Task 6: MonitorDashboard 移除信号栏 + 扫描完成回调

**Files:**
- Modify: `frontend/src/components/monitor/MonitorDashboard.tsx`

- [ ] **Step 1: 组件接受 onScanComplete 并在报告变化时触发**

编辑 `frontend/src/components/monitor/MonitorDashboard.tsx`：

1a. 改 `MonitorDashboard` 签名接受 props：

```typescript
export function MonitorDashboard({ onScanComplete }: { onScanComplete?: () => void }) {
```

1b. 在组件内 `const latestReportRef = reports[0];` 之后，新增 effect（监听最新报告 id 变化，扫描完成后会变）：

```typescript
  useEffect(() => {
    if (latestReportRef?.id) onScanComplete?.();
  }, [latestReportRef?.id, onScanComplete]);
```

> `useEffect` 已在文件顶部 import，无需新增。

- [ ] **Step 2: 移除信号栏，主面板改单栏**

在同文件的 `LatestReport` 组件中：

2a. 删除这一行（不再筛高置信信号）：

```typescript
  const highSignals = report.signals.filter((s) => s.confidence >= 60);
```

2b. 把 `return (...)` 整块替换为单栏布局（移除左侧 `latest-report__signals` 信号区，保留事件区）：

```typescript
  return (
    <div className="latest-report">
      {highEvents.length > 0 && (
        <section className="latest-report__section">
          <div className="monitor-section-title">🔥 高影响事件</div>
          {highEvents.map((e) => (
            <EventCard key={e.id} event={e} isNew />
          ))}
        </section>
      )}
      {otherEvents.length > 0 && (
        <section className="latest-report__section">
          <div className="monitor-section-title">其他事件 ({otherEvents.length})</div>
          {otherEvents.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </section>
      )}
    </div>
  );
```

2c. 删除顶部不再使用的 import：`StockSignalCard`。最终 import 区不含 `import { StockSignalCard } from './StockSignalCard';`。

> `EventCard`、`ConfigDrawer`、`ReportHistory` 仍在用，保留。

- [ ] **Step 3: 验证编译通过**

Run: `cd frontend && npx tsc -b`
Expected: 无错误（Task 4/5 的预期报错此时全部消除）。

- [ ] **Step 4: 全量构建**

Run: `cd frontend && npm run build`
Expected: TypeScript + Vite 打包成功，无错误。

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/monitor/MonitorDashboard.tsx
git commit -m "feat(monitor): single-column event stream, signals moved to sidebar"
```

---

## Task 7: 手动端到端验证 + 文档

**Files:** 无新增（验证 + changelog）

- [ ] **Step 1: 启动 dev，肉眼验证**

Run: `cd frontend && npm run dev`（后端需同时运行：另起 `cd backend && npm run start:dev`）

验证三点：
1. 切到 Monitor 视图，sidebar 显示信号列表（ticker + 方向箭头 + 置信度%），按置信度降序
2. 点击某行 → 就地展开 reasoning / 方向 / 程度 / 时间窗标签；再点收起
3. 主面板为单栏事件流（高影响事件 + 其他事件），无信号栏

> 若无历史报告，sidebar 显示「暂无信号」，主面板显示「尚无报告」——属正常空态。

- [ ] **Step 2: 点「立即运行」验证刷新**

在 Monitor 视图点「▶ 立即运行」，等扫描完成。预期：sidebar 信号列表自动刷新为新报告的信号（无需手动刷新页面）。

> 这步依赖真实后端 + Exa/DeepSeek API。若 API 不可用，可跳过此步，仅记录未验证。

- [ ] **Step 3: 更新 CHANGELOG**

在 `Docs/CHANGELOG.md` 顶部（`# 开发日志` 之后）追加：

```markdown
## 2026-06-23 — Monitor sidebar 股票信号速览

### 股票信号从主面板移至 sidebar

- 新增 `useLatestSignals` hook：拉取最新报告信号，按置信度降序
- 新增 `SignalOverview` 组件：sidebar 信号速览，每行 ticker + 方向箭头 + 置信度，点击就地展开 reasoning/程度/时间窗
- `App.tsx` 新增 `monitorRefreshKey`：扫描完成后通知 sidebar 刷新信号
- `MonitorDashboard` 移除左侧信号栏，主面板改为单栏事件流（全宽）
- 方向/程度/时间窗标签抽到共享 `signalLabels.ts`，`StockSignalCard` 与 `SignalOverview` 共用
```

- [ ] **Step 4: Commit**

```bash
cd frontend && cd .. && git add Docs/CHANGELOG.md
git commit -m "docs(monitor): changelog for sidebar stock signals"
```

---

## Self-Review 结果

- **Spec 覆盖**：数据获取（Task 2 useLatestSignals）、展示+可展开（Task 3 SignalOverview/SignalRow）、Sidebar 接入（Task 4）、刷新协同 monitorRefreshKey（Task 5 App + Task 6 onScanComplete effect）、主面板移除信号栏改单栏（Task 6）、共享标签去重（Task 1）、错误/空态（Task 2 catch→[]、Task 3 empty 分支）——spec 各节均有任务。
- **类型一致**：`useLatestSignals(refreshKey: number): { signals: StockSignal[]; loading: boolean }`（Task 2）↔ Sidebar 解构 `{ signals, loading: signalsLoading }`（Task 4）↔ `SignalOverview` Props `{ signals, loading }`（Task 3）一致；`onScanComplete?: () => void`（Task 6）↔ App 传 `bumpMonitorRefresh`（Task 5）一致；`monitorRefreshKey: number`（Task 4 Props）↔ App state（Task 5）一致。
- **无 placeholder**：所有步骤含完整代码；编译报错处明确标注「预期，Task N 修复」并在对应任务消除。
- **构建验证**：前端无单测，故以 `npx tsc -b` 逐任务把关 + Task 6 `npm run build` 全量 + Task 7 手动 dev 验证行为。
