import { useEffect, useRef } from 'react';
import type { Message } from '../types/chat';
import { MessageBubble } from './MessageBubble';
import './MessageList.css';

interface Props {
  messages: Message[];
  loading: boolean;
  onEdit: (index: number, newContent: string) => void;
}

export function MessageList({ messages, loading, onEdit }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages, loading]);

  return (
    <div className="message-list">
      {messages.map((m, i) => (
        <MessageBubble key={i} message={m} index={i} onEdit={onEdit} />
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