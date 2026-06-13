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

export const DEFAULT_CELEBRITIES: Celebrity[] = [
  {
    id: 'elon-musk',
    name: 'Elon Musk',
    nameZh: '马斯克',
    aliases: ['Musk'],
    primaryTicker: 'TSLA',
    relatedTickers: ['NVDA', 'GOOGL'],
    searchKeywords: ['Tesla', 'xAI', 'Grok', 'SpaceX', 'Starlink'],
    enabled: true,
  },
  {
    id: 'jensen-huang',
    name: 'Jensen Huang',
    nameZh: '黄仁勋',
    aliases: ['Jensen', 'Huang Renxun'],
    primaryTicker: 'NVDA',
    relatedTickers: ['TSM', 'MRVL', 'AVGO', 'AMD', '000660.KS', '005930.KS'],
    searchKeywords: ['NVIDIA', 'GTC', 'Blackwell', 'NVLink'],
    enabled: true,
  },
  // {
  //   id: 'lisa-su',
  //   name: 'Lisa Su',
  //   nameZh: '苏姿丰',
  //   aliases: ['Lisa'],
  //   primaryTicker: 'AMD',
  //   relatedTickers: ['INTC', 'NVDA', 'TSM'],
  //   searchKeywords: ['AMD', 'EPYC', 'Instinct', 'Radeon'],
  //   enabled: true,
  // },
  {
    id: 'sam-altman',
    name: 'Sam Altman',
    nameZh: '萨姆·奥特曼',
    aliases: ['Altman'],
    primaryTicker: 'MSFT',
    relatedTickers: ['NVDA', 'GOOGL', 'META', 'AMZN'],
    searchKeywords: ['OpenAI', 'ChatGPT', 'GPT', 'AGI'],
    enabled: true,
  },
  // {
  //   id: 'mark-zuckerberg',
  //   name: 'Mark Zuckerberg',
  //   nameZh: '扎克伯格',
  //   aliases: ['Zuckerberg', 'Zuck'],
  //   primaryTicker: 'META',
  //   relatedTickers: ['NVDA', 'GOOGL', 'MSFT'],
  //   searchKeywords: ['Meta', 'Llama', 'Ray-Ban', 'Instagram', 'WhatsApp'],
  //   enabled: true,
  // },
];
