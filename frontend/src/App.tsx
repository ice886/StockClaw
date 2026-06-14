import { useState, useCallback } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { MonitorDashboard } from './components/monitor/MonitorDashboard';
import './App.css';

export default function App() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeView, setActiveView] = useState<'chat' | 'monitor'>('chat');

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
        activeView={activeView}
        onViewChange={setActiveView}
      />
      {activeView === 'monitor' ? (
        <MonitorDashboard />
      ) : (
        <ChatPanel
          key={activeId ?? 'empty'}
          sessionId={activeId}
          onSessionUpdate={handleSessionUpdate}
        />
      )}
    </div>
  );
}
