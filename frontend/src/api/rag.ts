import type { RagDocument } from '../types/rag';

const BASE = '/api/rag';

export async function uploadDocument(
  file: File,
  sessionId: string,
): Promise<RagDocument> {
  const form = new FormData();
  form.append('file', file);
  form.append('sessionId', sessionId);

  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function listDocuments(
  sessionId: string,
): Promise<RagDocument[]> {
  const res = await fetch(`${BASE}/docs/${sessionId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteDocument(
  sessionId: string,
  docId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/docs/${sessionId}/${docId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
