import type { Message } from './chat';

export interface SessionRecord {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
