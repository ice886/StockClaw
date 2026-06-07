import type { SessionRecord } from '../types/session';
import './SessionItem.css';

interface Props {
  session: SessionRecord;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function SessionItem({ session, active, onSelect, onDelete }: Props) {
  return (
    <div
      className={`session-item${active ? ' active' : ''}`}
      onClick={onSelect}
    >
      <span className="session-title">{session.title}</span>
      <button
        className="session-delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="删除"
      >
        ×
      </button>
    </div>
  );
}
