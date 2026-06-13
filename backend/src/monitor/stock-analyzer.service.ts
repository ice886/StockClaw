import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { deepseek } from '@ai-sdk/deepseek';
import { Celebrity } from '../config/celebrities.config';
import { CelebrityEvent, StockSignal } from './interfaces/monitor.interfaces';

@Injectable()
export class StockAnalyzerService {
  private readonly logger = new Logger(StockAnalyzerService.name);

  async analyze(
    celebrity: Celebrity,
    events: CelebrityEvent[],
  ): Promise<StockSignal[]> {
    const highMediumEvents = events.filter(
      (e) => e.importance === 'high' || e.importance === 'medium',
    );
    if (highMediumEvents.length === 0) return [];

    const today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const eventsText = highMediumEvents
      .map(
        (e) =>
          `事件ID: ${e.id}\n重要性: ${e.importance}\n标题: ${e.title}\n摘要: ${e.summary}\n来源: ${e.sourceUrl}`,
      )
      .join('\n\n---\n\n');

    const relatedTickers = [
      celebrity.primaryTicker,
      ...celebrity.relatedTickers,
    ].join(', ');

    const system = `你是一个量化分析师，今天是 ${today}。
基于科技名人 ${celebrity.nameZh}（${celebrity.name}）的近期事件，分析对相关股票的短期影响。

相关股票：${relatedTickers}

分析框架：
1. 直接影响：事件直接涉及的公司和股票
2. 间接影响：供应链、竞争对手、合作伙伴
3. 历史规律：类似事件的历史市场反应
4. 置信度评估：信息来源可靠性（官方>主流媒体>社交>传言）

置信度评分（0-100）：
- 80-100：官方公告 + 历史规律强支撑
- 60-79：主流媒体报道 + 合理逻辑推导
- 40-59：非官方信源 + 间接推断
- 0-39：传言/社交媒体 + 弱逻辑

输出 JSON 格式：
{
  "signals": [
    {
      "ticker": "NVDA",
      "direction": "bullish|bearish|neutral",
      "magnitude": "strong|moderate|weak",
      "confidence": 75,
      "reasoning": "推理说明（50字内）",
      "timeHorizon": "intraday|1-3days|1week",
      "relatedEventId": "事件ID"
    }
  ]
}

注意：
- 只针对真正有影响的股票输出信号，无影响的不输出
- 不构成投资建议
- 只返回 JSON，不要其他说明`;

    try {
      const result = await generateText({
        model: deepseek('deepseek-chat'),
        system,
        messages: [{ role: 'user', content: eventsText }],
      });

      const json = this.parseJson(result.text);
      const signals: any[] = json?.signals ?? [];
      return signals.map((s: any) => ({
        ticker: s.ticker ?? '',
        direction: s.direction ?? 'neutral',
        magnitude: s.magnitude ?? 'weak',
        confidence: Number(s.confidence ?? 50),
        reasoning: s.reasoning ?? '',
        timeHorizon: s.timeHorizon ?? '1-3days',
        relatedEventId: s.relatedEventId ?? '',
      }));
    } catch (err) {
      this.logger.error(`Stock analysis failed for ${celebrity.name}: ${err}`);
      return [];
    }
  }

  private parseJson(text: string): any {
    const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      return { signals: [] };
    }
  }
}
