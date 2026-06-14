import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  MonitorReport,
  StockSignal,
  CelebrityEvent,
} from '../monitor/interfaces/monitor.interfaces';

@Injectable()
export class FeishuService {
  private readonly logger = new Logger(FeishuService.name);

  async sendReport(report: MonitorReport, webhookUrl: string): Promise<void> {
    const card = this.buildCard(report);
    try {
      await axios.post(webhookUrl, { msg_type: 'interactive', card });
    } catch (err) {
      this.logger.error(`Feishu send failed: ${err}`);
      throw err;
    }
  }

  private buildCard(report: MonitorReport): object {
    const date = new Date(report.generatedAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const highEvents = report.events.filter((e) => e.importance === 'high');
    // Only push high-confidence signals (medium/low removed from card per v5)
    const highSignals = report.signals.filter((s) => s.confidence >= 65);

    const elements: object[] = [];

    // Stats bar
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📊 本次扫描：**${report.events.length}** 条新事件 | **${highEvents.length}** 高影响 | **${highSignals.length}** 个高置信信号`,
      },
    });
    elements.push({ tag: 'hr' });

    if (highEvents.length === 0 && highSignals.length === 0) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: '本次无高影响新事件。' },
      });
    } else {
      // Group high events by celebrity
      const byCelebrity = new Map<string, CelebrityEvent[]>();
      for (const event of highEvents) {
        const list = byCelebrity.get(event.celebrityName) ?? [];
        list.push(event);
        byCelebrity.set(event.celebrityName, list);
      }

      for (const [celebName, events] of byCelebrity) {
        elements.push({
          tag: 'div',
          text: { tag: 'lark_md', content: `**🔥 ${celebName}**` },
        });
        for (const event of events.slice(0, 4)) {
          const relatedSignals = highSignals.filter(
            (s) => s.relatedEventId === event.id,
          );
          elements.push(this.buildEventBlock(event, relatedSignals));
        }
        elements.push({ tag: 'hr' });
      }

      // High-confidence signal summary (only high signals, no medium/low)
      if (highSignals.length > 0) {
        const signalLines = highSignals
          .slice(0, 8)
          .map((s) => {
            const dir =
              s.direction === 'bullish'
                ? '📈'
                : s.direction === 'bearish'
                  ? '📉'
                  : '➡️';
            const stars =
              '★'.repeat(Math.round(s.confidence / 20)) +
              '☆'.repeat(5 - Math.round(s.confidence / 20));
            return `${dir} **${s.ticker}** ${s.magnitude} · 置信${s.confidence}% ${stars} · ${s.timeHorizon}`;
          })
          .join('\n');
        elements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**📊 股票信号汇总**\n${signalLines}`,
          },
        });
        elements.push({ tag: 'hr' });
      }
    }

    // Footer
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `⏱ 监控周期 ${report.intervalHours}h · 仅供参考，非投资建议 · StockClaw`,
        },
      ],
    });

    return {
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: `📡 StockClaw 市场情报 · ${date}`,
        },
        template: highEvents.length > 0 ? 'red' : 'blue',
      },
      elements,
    };
  }

  private buildEventBlock(
    event: CelebrityEvent,
    signals: StockSignal[],
  ): object {
    const signalText =
      signals.length > 0
        ? '\n' +
          signals
            .map((s) => {
              const dir =
                s.direction === 'bullish'
                  ? '📈'
                  : s.direction === 'bearish'
                    ? '📉'
                    : '➡️';
              return `${dir} **${s.ticker}** ${s.magnitude} 影响 · 置信${s.confidence}% · ${s.reasoning}`;
            })
            .join('\n')
        : '';

    const timeStr = event.publishedAt
      ? new Date(event.publishedAt).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    return {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `${event.title}${timeStr ? ` · ${timeStr}` : ''}\n${event.summary}${signalText}\n[查看来源](${event.sourceUrl})`,
      },
    };
  }
}
