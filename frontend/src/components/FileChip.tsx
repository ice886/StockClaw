import './FileChip.css';

interface Props {
  filename: string;
  uploading?: boolean;
  onRemove?: () => void;
}

export function FileChip({ filename, uploading, onRemove }: Props) {
  return (
    <span className={`file-chip${uploading ? ' uploading' : ''}`}>
      <span className="file-chip-icon">📄</span>
      <span className="file-chip-name" title={filename}>
        {filename}
      </span>
      {uploading ? (
        <span className="file-chip-spinner" />
      ) : (
        onRemove && (
          <button
            className="file-chip-remove"
            onClick={onRemove}
            aria-label="删除文件"
          >
            ×
          </button>
        )
      )}
    </span>
  );
}
