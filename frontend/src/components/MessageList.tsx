import { useEffect, useRef } from 'react';
import type { Message } from '../types/chat';
import './MessageList.css';

interface Props {
  messages: Message[];
  loading: boolean;
}

export function MessageList({ messages, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages, loading]);

  return (
    <div className="message-list">
      {messages.map((m, i) => (
        <div key={i} className={`message ${m.role}`}>
          <div className="bubble">{m.content}</div>
        </div>
      ))}
      {loading && (
        <div className="message assistant">
          <div className="bubble">思考中...</div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
