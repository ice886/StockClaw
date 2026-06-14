import { useState } from 'react';
import type { MonitorConfig, Celebrity } from '../../types/monitor';
import { updateConfig } from '../../api/monitor';
import './ConfigDrawer.css';

interface Props {
  config: MonitorConfig;
  onClose: () => void;
  onSaved: (config: MonitorConfig) => void;
}

const INTERVAL_OPTIONS = [1, 2, 4, 8, 24];

export function ConfigDrawer({ config, onClose, onSaved }: Props) {
  const [intervalHours, setIntervalHours] = useState(config.intervalHours);
  const [enabled, setEnabled] = useState(config.enabled);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [celebrities, setCelebrities] = useState<Celebrity[]>(config.celebrities);
  const [saving, setSaving] = useState(false);

  const handleToggleCelebrity = (id: string) => {
    setCelebrities((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch: Partial<MonitorConfig> = { intervalHours, enabled, celebrities };
      if (webhookUrl.trim()) patch.feishuWebhookUrl = webhookUrl.trim();
      const saved = await updateConfig(patch);
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="config-drawer__overlay" onClick={onClose}>
      <div className="config-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="config-drawer__header">
          <span>监控设置</span>
          <button className="config-drawer__close" onClick={onClose}>✕</button>
        </div>

        <div className="config-drawer__body">
          <section className="config-section">
            <div className="config-section__title">定时任务</div>
            <label className="config-toggle">
              <span>启用自动监控</span>
              <button
                className={`toggle-btn ${enabled ? 'toggle-btn--on' : ''}`}
                onClick={() => setEnabled(!enabled)}
              >
                {enabled ? '开' : '关'}
              </button>
            </label>
            <div className="config-field">
              <span className="config-field__label">监控间隔</span>
              <div className="interval-options">
                {INTERVAL_OPTIONS.map((h) => (
                  <button
                    key={h}
                    className={`interval-btn ${intervalHours === h ? 'interval-btn--active' : ''}`}
                    onClick={() => setIntervalHours(h)}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="config-section">
            <div className="config-section__title">飞书 Webhook</div>
            <div className="config-field">
              <span className="config-field__label config-field__label--muted">
                {config.feishuWebhookUrl
                  ? `当前: ${config.feishuWebhookUrl}`
                  : '未配置'}
              </span>
              <input
                className="config-input"
                type="text"
                placeholder="输入新的 Webhook URL..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
          </section>

          <section className="config-section">
            <div className="config-section__title">监控名人</div>
            <div className="celebrity-list">
              {celebrities.map((c) => (
                <label key={c.id} className="celebrity-item">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={() => handleToggleCelebrity(c.id)}
                  />
                  <span className="celebrity-item__name">{c.nameZh}</span>
                  <span className="celebrity-item__ticker">{c.primaryTicker}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="config-drawer__footer">
          <button className="config-btn config-btn--cancel" onClick={onClose}>取消</button>
          <button
            className="config-btn config-btn--save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
