# Sidebar 股票信号速览设计

> 状态：设计已确认，待评审
> 日期：2026-06-23

## 背景

Monitor 视图下，`Sidebar` 的内容区是**空的**——`Sidebar.tsx` 只在 `activeView === 'chat'` 时渲染会话列表，`monitor` 分支除顶部 Chat/Monitor 切换按钮外无任何内容。

与此同时，股票信号目前埋在主面板 `MonitorDashboard` 的 `LatestReport` 组件左栏（`latest-report--split` 左右分栏，左栏 `📊 股票信号` 只显示 confidence ≥ 60 的高置信信号）。用户想随时看到股票信号全貌，常驻的 sidebar 是更合适的位置。

本设计将股票信号**完全移到 sidebar**，主面板不再保留信号栏，改为单栏事件流。信息架构变清晰：sidebar 给信号全貌速览（可点击展开详情），主面板专注事件流。

## 目标与非目标

**目标：**
- Monitor 视图下，sidebar 显示最新报告的**全部**股票信号（按置信度降序）
- 每条信号默认紧凑显示（ticker + 方向 + 置信度），点击就地展开详情（reasoning / magnitude / timeHorizon）
- 主面板移除信号栏，`LatestReport` 改为单栏事件流（全宽）
- 手动「立即运行」扫描后，sidebar 信号即时刷新

**非目标：**
- 不做信号→事件的跳转/联动筛选
- 不改后端任何接口
- 不改 chat 视图的 sidebar 行为

## 架构与数据流

**约束：** `Sidebar` 与 `MonitorDashboard` 是 `App.tsx` 下的兄弟组件，Sidebar 常驻、Dashboard 仅 monitor 视图渲染。信号数据需独立路径，不能依赖 Dashboard 内部状态。

**数据获取 — 新 hook `useLatestSignals(refreshKey)`：**
```
fetchReports() → 取最新报告 id → fetchReport(id) → 返回 signals（按 confidence 降序）
```
hook 返回 `{ signals, loading }`。`refreshKey` 变化时重新获取。两个 api（`fetchReports`、`fetchReport`）均已存在于 `src/api/monitor.ts`，无需新增。

**刷新协同 — 复用现有 refreshKey 模式：**
`App.tsx` 已有 `refreshKey`（会话用）。新增 `monitorRefreshKey` 状态：
- `App` 把 `bumpMonitorRefresh` 回调传给 `MonitorDashboard`，Dashboard 在一次扫描 `done` 后调用它
- `App` 把 `monitorRefreshKey` 传给 `Sidebar` → `useLatestSignals` → 触发重新获取

这与现有会话 `refreshKey` 的模式一致。

```
App
 ├── monitorRefreshKey (state)
 ├── Sidebar(monitorRefreshKey) → useLatestSignals → SignalOverview
 └── MonitorDashboard(onScanComplete=bumpMonitorRefresh)
```

## 组件设计

### 1. `useLatestSignals.ts`（新建 hook）

```typescript
export function useLatestSignals(refreshKey: number): {
  signals: StockSignal[];
  loading: boolean;
};
```
内部：`useEffect` 依赖 `refreshKey` → `fetchReports()` 取 `reports[0]?.id` → 若有则 `fetchReport(id)` → `setSignals(report.signals 按 confidence 降序)`。无报告或出错时 `signals = []`。

### 2. `SignalOverview.tsx` + `SignalOverview.css`（新建展示组件）

```typescript
interface Props { signals: StockSignal[]; loading: boolean; }
```
- 标题：`📊 股票信号`
- 列表：每条信号一个 `SignalRow`，按传入顺序（已降序）渲染
- 空态：`loading` 时显示「加载中...」；否则「暂无信号」

### 3. `SignalRow`（`SignalOverview.tsx` 内的子组件）

- 自持 `expanded` 状态（`useState(false)`），点击行头切换
- **速览层（常显）**：`ticker` + 方向箭头（bullish ↑ 绿 / bearish ↓ 红 / neutral – 灰）+ `confidence%`
- **详情层（展开时）**：`reasoning` 全文 + magnitude 标签 + timeHorizon 标签
- 复用 `StockSignalCard.tsx` 中已有的 `directionLabel` / `magnitudeLabel` / `horizonLabel` 映射常量——抽到一个共享小文件 `signalLabels.ts`，供 `SignalRow` 与 `StockSignalCard` 共用，避免重复定义

### 4. `Sidebar.tsx`（修改）

- Props 新增 `monitorRefreshKey: number`
- 调用 `useLatestSignals(monitorRefreshKey)`
- `activeView === 'monitor'` 分支渲染 `<SignalOverview signals={signals} loading={loading} />`（替换当前空白）
- chat 分支不变

### 5. `MonitorDashboard.tsx`（修改）

- Props 新增 `onScanComplete?: () => void`（默认无）
- `useMonitor` 的 `run` 完成后无法直接感知；改为在 Dashboard 层监听：现有 `run()` 内部 `done` 后会 `refresh()`。最简做法——给 `useMonitor` 的 `run` 增加可选完成回调，或在 Dashboard 用 `useEffect` 监听 `reports[0]?.id` 变化触发 `onScanComplete`。**采用后者**：`useEffect(() => onScanComplete?.(), [reports[0]?.id])`，零侵入 useMonitor。
- `LatestReport` 移除左栏信号区：删除 `latest-report--split` 左右分栏，删除 `📊 股票信号` 块及 `highSignals` 相关逻辑；保留高影响事件 + 其他事件，改为单栏全宽。
- `StockSignalCard` 组件文件保留（仍被详情层概念复用其样式思路），但 `LatestReport` 不再 import 它；若无其它引用则由实现者决定是否删除 import。

### 6. `App.tsx`（修改）

- 新增 `const [monitorRefreshKey, setMonitorRefreshKey] = useState(0)`
- `bumpMonitorRefresh = useCallback(() => setMonitorRefreshKey(k => k+1), [])`
- `<Sidebar monitorRefreshKey={monitorRefreshKey} ... />`
- `<MonitorDashboard onScanComplete={bumpMonitorRefresh} />`

## 共享标签常量 `signalLabels.ts`（新建）

把 `StockSignalCard.tsx` 里的 `directionLabel`、`magnitudeLabel`、`horizonLabel`（以及方向箭头/图标）抽到 `src/components/monitor/signalLabels.ts` 导出，`StockSignalCard` 与 `SignalRow` 共用。这是为支持本功能而做的小范围去重，不引入无关重构。

## 错误处理

- `useLatestSignals` 内 fetch 失败：catch 后 `signals = []`、`loading = false`，sidebar 显示空态，不抛错（与现有 `useMonitor.refresh` 静默失败一致）。
- 无报告时：`reports` 为空，`signals = []`，显示「暂无信号」。

## 测试

前端无现成测试框架（仅 backend 有 jest）。本功能验证以**手动端到端**为主：
1. `cd frontend && npm run build` 通过（TS 编译 + Vite 打包）
2. `npm run dev`，切到 Monitor 视图，sidebar 显示信号列表；点击某行展开 reasoning；主面板为单栏事件流、无信号栏
3. 点「立即运行」完成一次扫描后，sidebar 信号刷新

## 验证方式

- `cd frontend && npm run build` 无类型错误
- 本地 `npm run dev` 肉眼验证上述三点行为
