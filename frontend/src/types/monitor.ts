export interface Celebrity {
  id: string;
  name: string;
  nameZh: string;
  aliases: string[];
  primaryTicker: string;
  relatedTickers: string[];
  searchKeywords: string[];
  enabled: boolean;
}

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

export interface MonitorReportSummary {
  id: string;
  generatedAt: string;
  intervalHours: number;
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

export interface MonitorStatus {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: string | null;
  feishuConfigured: boolean;
  celebrities: Pick<Celebrity, 'id' | 'name' | 'nameZh' | 'primaryTicker'>[];
}

export interface RunProgressEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
  reportId?: string;
  events?: number;
  signals?: number;
  feishuSent?: boolean;
}
