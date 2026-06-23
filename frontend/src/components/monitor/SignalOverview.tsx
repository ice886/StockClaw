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
