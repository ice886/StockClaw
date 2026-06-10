import { useEffect, useRef } from 'react';
import type { Message } from '../types/chat';
import { MessageBubble } from './MessageBubble';
import './MessageList.css';

interface Props {
  messages: Message[];
  loading: boolean;
  toolName: string | null;
  onEdit: (index: number, newContent: string) => void;
}

export function MessageList({ messages, loading, toolName, onEdit }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages, loading, toolName]);

  return (
    <div className="message-list">
      {messages.map((m, i) => (
        <MessageBubble key={i} message={m} index={i} onEdit={onEdit} />
      ))}
      {(loading || toolName) && (
        <div className="message assistant">
          <div className="bubble status-indicator">
            {toolName ? (
              <span className="tool-badge">🔧 {toolName}</span>
            ) : (
              <span className="breathing-dots">
                <span className="breathing-dot" style={{ animationDelay: '0s' }} />
                <span className="breathing-dot" style={{ animationDelay: '0.2s' }} />
                <span className="breathing-dot" style={{ animationDelay: '0.4s' }} />
              </span>
            )}
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}