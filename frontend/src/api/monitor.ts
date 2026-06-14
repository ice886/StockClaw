import type {
  MonitorStatus,
  MonitorConfig,
  MonitorReport,
  MonitorReportSummary,
  RunProgressEvent,
} from '../types/monitor';

const BASE = '/api/monitor';

export async function fetchStatus(): Promise<MonitorStatus> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) throw new Error('Failed to fetch monitor status');
  return res.json();
}

export async function fetchConfig(): Promise<MonitorConfig> {
  const res = await fetch(`${BASE}/config`);
  if (!res.ok) throw new Error('Failed to fetch monitor config');
  return res.json();
}

export async function updateConfig(config: Partial<MonitorConfig>): Promise<MonitorConfig> {
  const res = await fetch(`${BASE}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to update monitor config');
  return res.json();
}

export async function fetchReports(): Promise<MonitorReportSummary[]> {
  const res = await fetch(`${BASE}/reports`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

export async function fetchReport(id: string): Promise<MonitorReport> {
  const res = await fetch(`${BASE}/reports/${id}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

export async function resendReport(id: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${BASE}/reports/${id}/resend`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to resend report');
  return res.json();
}

export async function* runMonitor(): AsyncGenerator<RunProgressEvent> {
  const res = await fetch(`${BASE}/run`, { method: 'POST' });
  if (!res.ok || !res.body) throw new Error('Failed to start monitor run');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6)) as RunProgressEvent;
        } catch {
          // ignore malformed lines
        }
      }
    }
  }
}
