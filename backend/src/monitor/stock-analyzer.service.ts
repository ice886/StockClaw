import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { deepseek } from '@ai-sdk/deepseek';
import { z } from 'zod';
import { Celebrity } from '../config/celebrities.config';
import { CelebrityEvent, StockSignal } from './interfaces/monitor.interfaces';

const StockSignalSchema = z.object({
  ticker: z.string().default(''),
  direction: z.enum(['bullish', 'bearish', 'neutral']).catch('neutral'),
  magnitude: z.enum(['strong', 'moderate', 'weak']).catch('weak'),
  confidence: z.number().min(0).max(100).catch(50),
  reasoning: z.string().default(''),
  timeHorizon: z.enum(['intraday', '1-3days', '1week']).catch('1-3days'),
  relatedEventId: z.string().default(''),
});

const AnalysisResponseSchema = z.object({
  signals: z.array(StockSignalSchema).default([]),
});

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
4. 置信度评估：信息来源可靠性

置信度评分矩阵（必须严格遵守，不得越界）：
- 90–100：官方新闻稿或监管文件（SEC/官网），直接涉及财务数据或重大合同
- 70–89 ：可信主流媒体（Bloomberg/Reuters）+ 历史上同类事件有明确股价反应记录
- 50–69 ：非官方来源或间接影响，逻辑推导合理但无历史支撑
- 30–49 ：社交媒体传言或单一小媒体，无二次验证
- < 30  ：信息极度不确定，高度推测性

注意：市场上虚高置信度（85–90）是常见错误，必须根据来源严格对照上表打分。

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
      const parsed = AnalysisResponseSchema.safeParse(json);
      return parsed.success ? parsed.data.signals : [];
    } catch (err) {
      this.logger.error(`Stock analysis failed for ${celebrity.name}: ${err}`);
      return [];
    }
  }

  private parseJson(text: string): unknown {
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
