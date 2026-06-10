import { useState, useEffect, useRef } from 'react';
import './ChatInput.css';

interface Props {
  onSend: (text: string) => void;
  onCancel: () => void;
  disabled: boolean;
  userMessages: string[];
}

export function ChatInput({ onSend, onCancel, disabled, userMessages }: Props) {
  const [text, setText] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef('');

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
    setHistoryIndex(-1);
    draftRef.current = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !disabled && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Escape' && disabled) {
      onCancel();
      return;
    }
    if (userMessages.length === 0) return;

    const last = userMessages.length - 1;

    if (e.key === 'ArrowUp' && historyIndex < last) {
      e.preventDefault();
      if (historyIndex === -1) draftRef.current = text;
      const next = historyIndex + 1;
      setHistoryIndex(next);
      setText(userMessages[last - next]);
    } else if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      const next = historyIndex - 1;
      if (next < 0) {
        setHistoryIndex(-1);
        setText(draftRef.current);
      } else {
        setHistoryIndex(next);
        setText(userMessages[last - next]);
      }
    }
  };

  return (
    <div className="chat-input">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setHistoryIndex(-1);
        }}
        onKeyDown={handleKeyDown}
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
