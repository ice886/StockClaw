import { useState, useCallback } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import './App.css';

export default function App() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSessionUpdate = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar
        activeId={activeId}
        onSelect={setActiveId}
        onNewSession={setActiveId}
        refreshKey={refreshKey}
      />
      <ChatPanel
        key={activeId ?? 'empty'}
        sessionId={activeId}
        onSessionUpdate={handleSessionUpdate}
      />
    </div>
  );
}
