import type { CelebrityEvent } from '../../types/monitor';
import './EventCard.css';

interface Props {
  event: CelebrityEvent;
}

const importanceLabel: Record<CelebrityEvent['importance'], string> = {
  high: '高影响',
  medium: '中影响',
  low: '低影响',
};

const importanceIcon: Record<CelebrityEvent['importance'], string> = {
  high: '🔥',
  medium: '⚡',
  low: '·',
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}分钟前`;
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

export function EventCard({ event }: Props) {
  return (
    <div className={`event-card event-card--${event.importance}`}>
      <div className="event-card__meta">
        <span className="event-card__celebrity">{event.celebrityName}</span>
        <span className="event-card__time">{timeAgo(event.publishedAt)}</span>
      </div>
      <div className="event-card__title">{event.title}</div>
      {event.summary && (
        <div className="event-card__summary">{event.summary}</div>
      )}
      <div className="event-card__footer">
        <span className={`event-card__importance event-card__importance--${event.importance}`}>
          {importanceIcon[event.importance]} {importanceLabel[event.importance]}
        </span>
        {event.sourceUrl && (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="event-card__source"
          >
            来源 ↗
          </a>
        )}
      </div>
    </div>
  );
}
