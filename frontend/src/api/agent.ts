import type { ChatRequest, ChatResponse } from '../types/chat';

export async function sendMessage(
  messages: ChatRequest['messages'],
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}