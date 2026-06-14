import { useState, useEffect, useRef } from 'react';
import type { SessionRecord } from '../types/session';
import { fetchSessions, createSession, deleteSession } from '../api/session';
import { SessionItem } from './SessionItem';
import './Sidebar.css';

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewSession: (id: string) => void;
  refreshKey: number;
  activeView: 'chat' | 'monitor';
  onViewChange: (view: 'chat' | 'monitor') => void;
}

export function Sidebar({ activeId, onSelect, onNewSession, refreshKey, activeView, onViewChange }: Props) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const isCreating = useRef(false);

  useEffect(() => {
    fetchSessions().then(setSessions);
  }, [refreshKey]);

  const handleCreate = async () => {
    if (isCreating.current) return;
    isCreating.current = true;
    try {
      const { id } = await createSession('新对话');
      setSessions((prev) => [
        {
          id,
          title: '新对话',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        ...prev,
      ]);
      onNewSession(id);
      onViewChange('chat');
    } finally {
      isCreating.current = false;
    }
  };

  const handleDelete = async (id: string) => {
    if (activeId === id) {
      onSelect('');
    }
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="sidebar">
      <div className="sidebar-nav">
        <button
          className={`sidebar-nav__btn ${activeView === 'chat' ? 'sidebar-nav__btn--active' : ''}`}
          onClick={() => onViewChange('chat')}
        >
          💬 Chat
        </button>
        <button
          className={`sidebar-nav__btn ${activeView === 'monitor' ? 'sidebar-nav__btn--active' : ''}`}
          onClick={() => onViewChange('monitor')}
        >
          📡 Monitor
        </button>
      </div>
      {activeView === 'chat' && (
        <>
          <button className="new-session-btn" onClick={handleCreate}>
            + 新建对话
          </button>
          <div className="recents-header">Recents</div>
          <div className="session-list">
            {sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeId}
                onSelect={() => { onSelect(s.id); }}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}