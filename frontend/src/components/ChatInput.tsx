import { useState, useEffect } from 'react';
import './ChatInput.css';

interface Props {
  onSend: (text: string) => void;
  onCancel: () => void;
  disabled: boolean;
}

export function ChatInput({ onSend, onCancel, disabled }: Props) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onCancel]);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="chat-input">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !disabled) handleSubmit();
          if (e.key === 'Escape' && disabled) onCancel();
        }}
        placeholder={disabled ? '生成中...' : '输入消息...'}
      />
      {disabled ? (
        <button className="cancel-btn" onClick={onCancel}>
          取消
        </button>
      ) : (
        <button onClick={handleSubmit} disabled={disabled}>
          发送
        </button>
      )}
    </div>
  );
}
