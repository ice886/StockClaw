export interface RagDocument {
  id: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  uploadedAt: number;
  chunkCount: number;
}
