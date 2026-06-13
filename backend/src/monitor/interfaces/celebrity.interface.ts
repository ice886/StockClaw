export interface Celebrity {
  id: string;
  name: string;          // "Jensen Huang"
  nameZh: string;        // "黄仁勋"
  aliases: string[];     // ["Jensen", "Huang"]
  primaryTicker: string; // "NVDA"
  relatedTickers: string[];  // ["TSM", "MRVL", "AVGO"]
  searchKeywords: string[];  // 额外搜索关键词
  enabled: boolean;
}

