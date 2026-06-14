import type { StockSignal } from '../../types/monitor';
import './StockSignalCard.css';

interface Props {
  signal: StockSignal;
}

const directionIcon: Record<StockSignal['direction'], string> = {
  bullish: '📈',
  bearish: '📉',
  neutral: '➡️',
};

const directionLabel: Record<StockSignal['direction'], string> = {
  bullish: '看涨',
  bearish: '看跌',
  neutral: '中性',
};

const magnitudeLabel: Record<StockSignal['magnitude'], string> = {
  strong: '强',
  moderate: '中等',
  weak: '弱',
};

const horizonLabel: Record<StockSignal['timeHorizon'], string> = {
  intraday: '盘内',
  '1-3days': '1-3天',
  '1week': '1周',
};

export function StockSignalCard({ signal }: Props) {
  return (
    <div className={`signal-card signal-card--${signal.direction}`}>
      <div className="signal-card__header">
        <span className="signal-card__ticker">{signal.ticker}</span>
        <span className={`signal-card__direction signal-card__direction--${signal.direction}`}>
          {directionIcon[signal.direction]} {directionLabel[signal.direction]} · {magnitudeLabel[signal.magnitude]}
        </span>
        <span className="signal-card__horizon">{horizonLabel[signal.timeHorizon]}</span>
      </div>
      <div className="signal-card__confidence">
        <div className="signal-card__confidence-bar">
          <div
            className="signal-card__confidence-fill"
            style={{ width: `${signal.confidence}%` }}
          />
        </div>
        <span className="signal-card__confidence-label">置信度 {signal.confidence}%</span>
      </div>
      {signal.reasoning && (
        <div className="signal-card__reasoning">{signal.reasoning}</div>
      )}
    </div>
  );
}
