import type { StockSignal } from '../../types/monitor';
import { directionIcon, directionLabel, magnitudeLabel, horizonLabel } from './signalLabels';
import './StockSignalCard.css';

interface Props {
  signal: StockSignal;
}

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
