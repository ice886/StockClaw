import { useState, useRef, useEffect } from 'react';
import type { Message } from '../types/chat';
import { AssistantBubble } from './AssistantBubble';
import './MessageBubble.css';

interface Props {
  message: Message;
  index: number;
  onEdit: (index: number, newContent: string) => void;
}

export function MessageBubble({ message, index, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleEditSubmit = () => {
    const newContent = textareaRef.current?.value ?? message.content;
    if (newContent.trim() === '') return;
    onEdit(index, newContent);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSubmit();
    }
    if (e.key === 'Escape') {
      setEditing(false);
    }
  };

  const isUser = message.role === 'user';

  return (
    <div className={`message ${message.role}`}>
      {editing ? (
        <div className="bubble edit-bubble">
          <textarea
            ref={textareaRef}
            className="edit-textarea"
            defaultValue={message.content}
            onKeyDown={handleKeyDown}
          />
          <div className="edit-actions">
            <button className="edit-btn save" onClick={handleEditSubmit}>
              保存并重发
            </button>
            <button className="edit-btn cancel" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="message-body">
          <div className="bubble">
            {isUser ? (
              <div className="bubble-content">{message.content}</div>
            ) : (
              <AssistantBubble content={message.content} />
            )}
          </div>
          <div className="bubble-actions">
            <button className="action-btn" onClick={handleCopy}>
              <span className="icon">{copied ? '✓' : '📋'}</span>
              <span className="label">Copy message</span>
            </button>
            {isUser && (
              <button className="action-btn" onClick={() => setEditing(true)}>
                <span className="icon">✏️</span>
                <span className="label">Edit message</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
