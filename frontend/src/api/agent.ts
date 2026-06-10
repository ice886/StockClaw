import type { ChatRequest, ChatResponse } from '../types/chat';

export async function sendMessage(
  messages: ChatRequest['messages'],
  signal?: AbortSignal,
  skillName?: string,
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, skillName }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface StreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'tool-error' | 'error' | 'done';
  content?: string;
  toolName?: string;
  error?: string;
}

export async function* sendMessageStream(
  messages: ChatRequest['messages'],
  signal?: AbortSignal,
  skillName?: string,
): AsyncGenerator<StreamEvent> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, skillName }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data) yield JSON.parse(data);
      }
    }
  }
}