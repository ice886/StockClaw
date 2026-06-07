export interface SessionRecord {
  id: string;
  title: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: number;
  updatedAt: number;
}
