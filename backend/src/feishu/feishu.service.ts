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
      await axios.post(webhookUrl, {
        msg_type: 'interactive',
        card,
      });
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
    const medEvents = report.events.filter((e) => e.importance === 'medium');
    const highSignals = report.signals.filter((s) => s.confidence >= 65);

    const elements: object[] = [];

    // Stats bar
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📊 本次扫描：**${report.events.length}** 条事件 | **${highEvents.length}** 高影响 | **${report.signals.length}** 个股票信号`,
      },
    });
    elements.push({ tag: 'hr' });

    // High impact events
    if (highEvents.length > 0) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: '**🔥 高影响事件**' },
      });
      for (const event of highEvents.slice(0, 5)) {
        const relatedSignals = report.signals.filter(
          (s) => s.relatedEventId === event.id,
        );
        elements.push(this.buildEventBlock(event, relatedSignals));
      }
      elements.push({ tag: 'hr' });
    }

    // Medium impact events
    if (medEvents.length > 0) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: '**⚡ 中影响事件**' },
      });
      for (const event of medEvents.slice(0, 3)) {
        const relatedSignals = report.signals.filter(
          (s) => s.relatedEventId === event.id,
        );
        elements.push(this.buildEventBlock(event, relatedSignals));
      }
      elements.push({ tag: 'hr' });
    }

    // Signal summary table
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
        content: `**[${event.celebrityName}]** ${event.title}${timeStr ? ` · ${timeStr}` : ''}\n${event.summary}${signalText}\n[查看来源](${event.sourceUrl})`,
      },
    };
  }
}
