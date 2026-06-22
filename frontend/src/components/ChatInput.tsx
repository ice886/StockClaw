import { useState, useEffect, useRef } from 'react';
import { FileChip } from './FileChip';
import type { RagDocument } from '../types/rag';
import './ChatInput.css';

interface Props {
  onSend: (text: string) => void;
  onCancel: () => void;
  disabled: boolean;
  userMessages: string[];
  docs?: RagDocument[];
  uploadingNames?: string[];
  onUpload?: (files: FileList) => void;
  onRemoveDoc?: (docId: string) => void;
}

const ACCEPT = '.pdf,.docx,.txt';

export function ChatInput({
  onSend,
  onCancel,
  disabled,
  userMessages,
  docs = [],
  uploadingNames = [],
  onUpload,
  onRemoveDoc,
}: Props) {
  const [text, setText] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef('');
  const fileRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onUpload) onUpload(files);
    e.target.value = ''; // 允许重复选择同一文件
  };

  const showChips = docs.length > 0 || uploadingNames.length > 0;

  return (
    <div className="chat-input-wrap">
      {showChips && (
        <div className="chat-input-chips">
          {docs.map((doc) => (
            <FileChip
              key={doc.id}
              filename={doc.filename}
              onRemove={onRemoveDoc ? () => onRemoveDoc(doc.id) : undefined}
            />
          ))}
          {uploadingNames.map((name, i) => (
            <FileChip key={`uploading-${i}`} filename={name} uploading />
          ))}
        </div>
      )}
      <div className="chat-input">
        {onUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              className="upload-btn"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              aria-label="上传文档"
              title="上传文档（PDF / Word / TXT）"
            >
              +
            </button>
          </>
        )}
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
    </div>
  );
}
