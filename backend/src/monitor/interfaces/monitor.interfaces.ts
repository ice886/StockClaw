import { Celebrity } from '../../config/celebrities.config';

export interface CelebrityEvent {
  id: string;
  celebrityId: string;
  celebrityName: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceType: 'news' | 'social' | 'official' | 'unknown';
  publishedAt: string;
  fetchedAt: string;
  importance: 'high' | 'medium' | 'low';
}

export interface StockSignal {
  ticker: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  magnitude: 'strong' | 'moderate' | 'weak';
  confidence: number;
  reasoning: string;
  timeHorizon: 'intraday' | '1-3days' | '1week';
  relatedEventId: string;
}

export interface MonitorReport {
  id: string;
  generatedAt: string;
  intervalHours: number;
  events: CelebrityEvent[];
  signals: StockSignal[];
  feishuSent: boolean;
}

export interface MonitorConfig {
  enabled: boolean;
  intervalHours: number;
  feishuWebhookUrl: string;
  celebrities: Celebrity[];
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface RawSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  text: string;
}
