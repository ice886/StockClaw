import type { StockSignal } from '../../types/monitor';

export const directionIcon: Record<StockSignal['direction'], string> = {
  bullish: '📈',
  bearish: '📉',
  neutral: '➡️',
};

export const directionLabel: Record<StockSignal['direction'], string> = {
  bullish: '看涨',
  bearish: '看跌',
  neutral: '中性',
};

export const magnitudeLabel: Record<StockSignal['magnitude'], string> = {
  strong: '强',
  moderate: '中等',
  weak: '弱',
};

export const horizonLabel: Record<StockSignal['timeHorizon'], string> = {
  intraday: '盘内',
  '1-3days': '1-3天',
  '1week': '1周',
};
