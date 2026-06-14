import { useState } from 'react';
import type { MonitorReportSummary, MonitorReport } from '../../types/monitor';
import { fetchReport, resendReport } from '../../api/monitor';
import { StockSignalCard } from './StockSignalCard';
import { EventCard } from './EventCard';
import './ReportHistory.css';

interface Props {
  reports: MonitorReportSummary[];
  onRefresh: () => void;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReportHistory({ reports, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<MonitorReport | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  const handleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    try {
      const r = await fetchReport(id);
      setDetail(r);
    } catch {
      setDetail(null);
    }
  };

  const handleResend = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setResending(id);
    try {
      await resendReport(id);
      onRefresh();
    } finally {
      setResending(null);
    }
  };

  if (reports.length === 0) {
    return <div className="report-history__empty">暂无历史报告</div>;
  }

  return (
    <div className="report-history">
      {reports.map((r) => (
        <div key={r.id} className="report-row">
          <div
            className="report-row__summary"
            onClick={() => handleExpand(r.id)}
          >
            <span className="report-row__date">{formatDate(r.generatedAt)}</span>
            <span className="report-row__interval">{r.intervalHours}h 扫描</span>
            {r.feishuSent && (
              <span className="report-row__sent">✓ 已推送</span>
            )}
            <div className="report-row__actions">
              <button
                className="report-action-btn"
                onClick={(e) => handleResend(e, r.id)}
                disabled={resending === r.id}
              >
                {resending === r.id ? '发送中...' : '重发飞书'}
              </button>
              <span className="report-row__toggle">
                {expanded === r.id ? '▲' : '▼'}
              </span>
            </div>
          </div>

          {expanded === r.id && detail && (
            <div className="report-row__detail">
              {detail.signals.length > 0 && (
                <div className="report-detail-section">
                  <div className="report-detail-section__title">
                    股票信号 ({detail.signals.length})
                  </div>
                  <div className="report-detail-section__list">
                    {detail.signals.map((s, i) => (
                      <StockSignalCard key={i} signal={s} />
                    ))}
                  </div>
                </div>
              )}
              {detail.events.length > 0 && (
                <div className="report-detail-section">
                  <div className="report-detail-section__title">
                    事件 ({detail.events.length})
                  </div>
                  <div className="report-detail-section__list">
                    {detail.events.map((e) => (
                      <EventCard key={e.id} event={e} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
