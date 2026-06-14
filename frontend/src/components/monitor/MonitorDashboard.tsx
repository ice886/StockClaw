import { useState, useEffect, useRef } from 'react';
import { useMonitor } from '../../hooks/useMonitor';
import { fetchConfig, fetchReport, fetchStatus } from '../../api/monitor';
import type { MonitorConfig, MonitorReport } from '../../types/monitor';
import { EventCard } from './EventCard';
import { StockSignalCard } from './StockSignalCard';
import { ConfigDrawer } from './ConfigDrawer';
import { ReportHistory } from './ReportHistory';
import './MonitorDashboard.css';

const AUTO_REFRESH_MS = 5 * 60 * 1000;

function timeUntilNext(lastRunAt: string | null, intervalHours: number): string {
  if (!lastRunAt) return '—';
  const nextMs = new Date(lastRunAt).getTime() + intervalHours * 3600000;
  const diff = nextMs - Date.now();
  if (diff <= 0) return '即将运行';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m 后` : `${m}m 后`;
}

export function MonitorDashboard() {
  const { status, reports, running, progressLog, error, refresh, run } = useMonitor();
  const [config, setConfig] = useState<MonitorConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'history'>('events');
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
  }, []);

  // Auto-refresh status every 5 minutes
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      fetchStatus().then((s) => {
        // trigger a lightweight status update without full refresh
        void s;
        refresh();
      }).catch(() => {});
    }, AUTO_REFRESH_MS);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [refresh]);

  const latestReportRef = reports[0];

  return (
    <div className="monitor-dashboard">
      {/* Header */}
      <div className="monitor-header">
        <div className="monitor-header__left">
          <span className="monitor-header__title">📡 StockClaw Monitor</span>
          {status && (
            <span className={`monitor-status-dot ${status.enabled ? 'monitor-status-dot--on' : ''}`} />
          )}
          {status?.enabled && (
            <span className="monitor-header__next">
              下次: {timeUntilNext(status.lastRunAt, status.intervalHours)}
            </span>
          )}
        </div>
        <div className="monitor-header__actions">
          <button className="monitor-btn monitor-btn--run" onClick={run} disabled={running}>
            {running ? '运行中...' : '▶ 立即运行'}
          </button>
          <button
            className="monitor-btn"
            onClick={() => { fetchConfig().then(setConfig); setShowConfig(true); }}
          >
            ⚙ 设置
          </button>
        </div>
      </div>

      {/* Progress log */}
      {(running || progressLog.length > 0) && (
        <div className="monitor-progress">
          {progressLog.map((msg, i) => (
            <div key={i} className="monitor-progress__line">
              {i === progressLog.length - 1 && running ? '⟳ ' : '✓ '}{msg}
            </div>
          ))}
          {error && <div className="monitor-progress__error">✗ {error}</div>}
        </div>
      )}

      {/* Stats bar */}
      {status && (
        <div className="monitor-stats">
          <div className="monitor-stat">
            <span className="monitor-stat__num">{status.celebrities.filter(Boolean).length}</span>
            <span className="monitor-stat__label">监控名人</span>
          </div>
          <div className="monitor-stat">
            <span className="monitor-stat__num">{reports.length}</span>
            <span className="monitor-stat__label">历史报告</span>
          </div>
          <div className="monitor-stat">
            <span className="monitor-stat__num">{status.intervalHours}h</span>
            <span className="monitor-stat__label">监控间隔</span>
          </div>
          <div className="monitor-stat">
            <span className={`monitor-stat__num ${status.feishuConfigured ? 'monitor-stat__num--green' : ''}`}>
              {status.feishuConfigured ? '已配置' : '未配置'}
            </span>
            <span className="monitor-stat__label">飞书推送</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="monitor-tabs">
        <button
          className={`monitor-tab ${activeTab === 'events' ? 'monitor-tab--active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          最新报告
        </button>
        <button
          className={`monitor-tab ${activeTab === 'history' ? 'monitor-tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          历史记录 ({reports.length})
        </button>
      </div>

      {/* Content */}
      <div className="monitor-content">
        {activeTab === 'events' ? (
          <LatestReport reportId={latestReportRef?.id ?? null} />
        ) : (
          <ReportHistory reports={reports} onRefresh={refresh} />
        )}
      </div>

      {/* Config drawer */}
      {showConfig && config && (
        <ConfigDrawer
          config={config}
          onClose={() => setShowConfig(false)}
          onSaved={(saved) => { setConfig(saved); refresh(); }}
        />
      )}
    </div>
  );
}

function LatestReport({ reportId }: { reportId: string | null }) {
  const [report, setReport] = useState<MonitorReport | null>(null);

  useEffect(() => {
    if (!reportId) return;
    fetchReport(reportId).then(setReport).catch(() => {});
  }, [reportId]);

  if (!reportId) {
    return (
      <div className="monitor-empty">
        <p>尚无报告。点击「立即运行」开始第一次扫描。</p>
      </div>
    );
  }

  if (!report) return <div className="monitor-empty">加载中...</div>;

  const highSignals = report.signals.filter((s) => s.confidence >= 60);
  const highEvents = report.events.filter((e) => e.importance === 'high');
  const otherEvents = report.events.filter((e) => e.importance !== 'high');

  if (report.events.length === 0 && report.signals.length === 0) {
    return <div className="monitor-empty">本次扫描未发现值得关注的事件。</div>;
  }

  return (
    <div className="latest-report latest-report--split">
      {/* Left: signal board */}
      <div className="latest-report__signals">
        <div className="monitor-section-title">📊 股票信号</div>
        {highSignals.length > 0 ? (
          highSignals.map((s, i) => <StockSignalCard key={i} signal={s} />)
        ) : (
          <div className="monitor-empty monitor-empty--sm">暂无高置信信号</div>
        )}
      </div>

      {/* Right: event stream */}
      <div className="latest-report__events">
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
    </div>
  );
}
