import { useState, useEffect, useCallback } from 'react';
import {
  fetchStatus,
  fetchReports,
  runMonitor,
} from '../api/monitor';
import type { MonitorStatus, MonitorReportSummary } from '../types/monitor';

export function useMonitor() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [reports, setReports] = useState<MonitorReportSummary[]>([]);
  const [running, setRunning] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([fetchStatus(), fetchReports()]);
      setStatus(s);
      setReports(r);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setProgressLog([]);
    setError(null);

    try {
      for await (const event of runMonitor()) {
        if (event.type === 'progress' && event.message) {
          setProgressLog((prev) => [...prev, event.message!]);
        } else if (event.type === 'error') {
          setError(event.message ?? '运行失败');
          break;
        } else if (event.type === 'done') {
          setProgressLog((prev) => [
            ...prev,
            `完成：${event.events} 条事件，${event.signals} 个信号${event.feishuSent ? '，已推送飞书' : ''}`,
          ]);
          await refresh();
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }, [running, refresh]);

  return { status, reports, running, progressLog, error, refresh, run };
}
