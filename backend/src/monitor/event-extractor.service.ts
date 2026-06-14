import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { deepseek } from '@ai-sdk/deepseek';
import { z } from 'zod';
import { Celebrity } from '../config/celebrities.config';
import {
  CelebrityEvent,
  RawSearchResult,
} from './interfaces/monitor.interfaces';

const ExtractedEventSchema = z.object({
  title: z.string().default(''),
  summary: z.string().default(''),
  sourceUrl: z.string().default(''),
  sourceType: z
    .enum(['news', 'social', 'official', 'unknown'])
    .catch('unknown'),
  publishedAt: z.string().default(''),
  importance: z.enum(['high', 'medium', 'low']).catch('low'),
});

const ExtractedEventsSchema = z.array(ExtractedEventSchema);

@Injectable()
export class EventExtractorService {
  private readonly logger = new Logger(EventExtractorService.name);

  async extract(
    celebrity: Celebrity,
    rawResults: RawSearchResult[],
  ): Promise<CelebrityEvent[]> {
    if (rawResults.length === 0) return [];

    const today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const rawText = rawResults
      .map(
        (r, i) =>
          `[${i + 1}] 标题: ${r.title}\n来源: ${r.url}\n时间: ${r.publishedDate ?? '未知'}\n内容: ${r.text.slice(0, 500)}`,
      )
      .join('\n\n---\n\n');

    const system = `你是一个专业的科技行业分析师，今天是 ${today}。
从原始新闻/社交媒体内容中提取与 ${celebrity.nameZh}（${celebrity.name}）相关的重要事件。

重要性判断标准：
- high：官方合作公告、供应链协议、重大投资、财务数据、监管事件、产品发布
- medium：非官方访问曝光、产品暗示、行业发言、合作谈判
- low：普通演讲采访（无新信息）、社交互动、转发评论

Few-shot 评级示例（必须参照对齐）：

示例1（high）：
  输入：Jensen Huang confirmed NVDA will supply H200 to Samsung for HBM4 co-development
  输出：importance=high，原因：官方合作公告 + 直接涉及供应链协议

示例2（medium）：
  输入：Lisa Su hinted at next-gen EPYC roadmap during an investor briefing
  输出：importance=medium，原因：非官方产品暗示，未正式发布

示例3（low）：
  输入：Jensen Huang gave keynote at CES 2025, discussed AI trends
  输出：importance=low，原因：会议演讲，无新信息披露

示例4（high）：
  输入：SEC filing shows Elon Musk sold $3.5B in Tesla shares
  输出：importance=high，原因：监管文件 + 直接涉及财务数据

示例5（low）：
  输入：Mark Zuckerberg shared a photo on Instagram showing his new surfboard
  输出：importance=low，原因：社交互动，无商业价值信息

过滤规则：
- 排除纯广告软文和无实质内容的报道
- 排除超过48小时的旧新闻（除非是重要官方公告）
- 若多条来源报道同一事件，只保留最权威的一条

输出 JSON 数组，格式：
[
  {
    "title": "事件标题（简洁，20字内）",
    "summary": "事件摘要（100字内，包含关键信息）",
    "sourceUrl": "来源URL",
    "sourceType": "news|social|official|unknown",
    "publishedAt": "ISO时间字符串或空字符串",
    "importance": "high|medium|low"
  }
]

若无有效事件，返回空数组 []。只返回 JSON，不要其他说明。`;

    try {
      const result = await generateText({
        model: deepseek('deepseek-chat'),
        system,
        messages: [{ role: 'user', content: rawText }],
      });

      const json: unknown = this.parseJson(result.text);
      if (!Array.isArray(json)) return [];

      const parsed = ExtractedEventsSchema.safeParse(json);
      const items = parsed.success ? parsed.data : [];

      const now = new Date().toISOString();
      return items.map((item, idx) => ({
        id: `${celebrity.id}-${Date.now()}-${idx}`,
        celebrityId: celebrity.id,
        celebrityName: celebrity.nameZh,
        title: item.title,
        summary: item.summary,
        sourceUrl: item.sourceUrl,
        sourceType: item.sourceType,
        publishedAt: item.publishedAt,
        fetchedAt: now,
        importance: item.importance,
      }));
    } catch (err) {
      this.logger.error(
        `Event extraction failed for ${celebrity.name}: ${err}`,
      );
      return [];
    }
  }

  private parseJson(text: string): unknown {
    const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
      return [];
    }
  }
}
