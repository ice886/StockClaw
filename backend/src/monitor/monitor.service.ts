import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';
import { DEFAULT_CELEBRITIES } from '../config/celebrities.config';
import { PrismaService } from '../database/prisma.service';
import { CrawlerService } from './crawler.service';
import { EventExtractorService } from './event-extractor.service';
import { StockAnalyzerService } from './stock-analyzer.service';
import { EventDeduplicatorService } from './event-deduplicator.service';
import {
  CelebrityEvent,
  MonitorConfig,
  MonitorReport,
  StockSignal,
} from './interfaces/monitor.interfaces';

// 单行配置约定：MonitorConfig 只有一条记录，固定 id=1。
const CONFIG_ID = 1;

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private crawler: CrawlerService,
    private extractor: EventExtractorService,
    private analyzer: StockAnalyzerService,
    private deduplicator: EventDeduplicatorService,
  ) {}

  // ─── Config ───────────────────────────────────────────────────────────

  async getConfig(): Promise<MonitorConfig> {
    const row = await this.prisma.monitorConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    if (!row) return this.defaultConfig();
    try {
      return JSON.parse(row.data) as MonitorConfig;
    } catch {
      return this.defaultConfig();
    }
  }

  async saveConfig(partial: Partial<MonitorConfig>): Promise<MonitorConfig> {
    const current = await this.getConfig();
    const updated = { ...current, ...partial };
    const data = JSON.stringify(updated);
    await this.prisma.monitorConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, data },
      update: { data },
    });
    return updated;
  }

  // ─── Run ──────────────────────────────────────────────────────────────

  async runFullCycle(
    onProgress?: (msg: string) => void,
  ): Promise<MonitorReport> {
    const config = await this.getConfig();
    const enabledCelebrities = config.celebrities.filter((c) => c.enabled);
    const intervalHours = config.intervalHours;
    const signalThreshold = config.signalThreshold ?? 65;

    this.logger.log(
      `Starting monitor cycle: ${enabledCelebrities.length} celebrities, ${intervalHours}h window`,
    );
    onProgress?.(`开始扫描 ${enabledCelebrities.length} 位名人...`);

    // Fetch previous report events for incremental dedup
    const previousEvents = await this.getLatestReportEvents();

    const limit = pLimit(3);

    const results = await Promise.all(
      enabledCelebrities.map((celebrity) =>
        limit(async () => {
          onProgress?.(`正在抓取 ${celebrity.nameZh} 的动态...`);
          this.logger.log(`Crawling: ${celebrity.name}`);

          const rawResults = await this.crawler.fetchRawEvents(celebrity);
          this.logger.log(`  Found ${rawResults.length} raw results`);

          onProgress?.(
            `正在提取 ${celebrity.nameZh} 的事件（${rawResults.length} 条原始数据）...`,
          );
          const events = await this.extractor.extract(celebrity, rawResults);
          this.logger.log(`  Extracted ${events.length} events`);

          const highMed = events.filter(
            (e) => e.importance === 'high' || e.importance === 'medium',
          );
          let signals: StockSignal[] = [];
          if (highMed.length > 0) {
            onProgress?.(`正在分析 ${celebrity.nameZh} 相关股票影响...`);
            signals = await this.analyzer.analyze(celebrity, events);
            this.logger.log(`  Generated ${signals.length} signals`);
          }

          return { events, signals };
        }),
      ),
    );

    const allRawEvents: CelebrityEvent[] = results.flatMap((r) => r.events);
    const allSignals: StockSignal[] = results.flatMap((r) => r.signals);

    // Deduplicate against previous report (incremental push)
    const { newEvents, mergedCount, filteredCount } =
      this.deduplicator.deduplicate(allRawEvents, previousEvents);

    this.logger.log(
      `Dedup: ${allRawEvents.length} raw → ${newEvents.length} new (merged: ${mergedCount}, filtered: ${filteredCount})`,
    );
    onProgress?.(
      `去重完成：${newEvents.length} 条新事件（过滤重复 ${filteredCount} 条，合并 ${mergedCount} 条）`,
    );

    // Filter signals by threshold and only for new events
    const newEventIds = new Set(newEvents.map((e) => e.id));
    const filteredSignals = allSignals.filter(
      (s) =>
        s.confidence >= signalThreshold && newEventIds.has(s.relatedEventId),
    );

    const report: MonitorReport = {
      id: Date.now().toString(36),
      generatedAt: new Date().toISOString(),
      intervalHours,
      events: newEvents,
      signals: filteredSignals,
      feishuSent: false,
    };

    await this.saveReport(report);
    await this.saveConfig({ lastRunAt: report.generatedAt });

    onProgress?.(
      `扫描完成：${newEvents.length} 条新事件，${filteredSignals.length} 个股票信号`,
    );
    this.logger.log(
      `Cycle complete: ${newEvents.length} events, ${filteredSignals.length} signals`,
    );

    return report;
  }

  // ─── Reports ──────────────────────────────────────────────────────────

  async listReports(): Promise<
    Pick<MonitorReport, 'id' | 'generatedAt' | 'feishuSent' | 'intervalHours'>[]
  > {
    const rows = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rows.map((row) => {
      try {
        const data = JSON.parse(row.data) as MonitorReport;
        return {
          id: data.id,
          generatedAt: data.generatedAt,
          feishuSent: data.feishuSent,
          intervalHours: data.intervalHours,
        };
      } catch {
        return {
          id: row.id,
          generatedAt: '',
          feishuSent: false,
          intervalHours: 0,
        };
      }
    });
  }

  async getReport(id: string): Promise<MonitorReport | null> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    if (!row) return null;
    try {
      return JSON.parse(row.data) as MonitorReport;
    } catch {
      return null;
    }
  }

  async markFeishuSent(id: string): Promise<void> {
    const report = await this.getReport(id);
    if (!report) return;
    report.feishuSent = true;
    await this.saveReport(report);
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async getLatestReportEvents(): Promise<CelebrityEvent[]> {
    const row = await this.prisma.report.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return [];
    try {
      const data = JSON.parse(row.data) as MonitorReport;
      return data.events ?? [];
    } catch {
      return [];
    }
  }

  private async saveReport(report: MonitorReport): Promise<void> {
    const data = JSON.stringify(report);
    // 去重后报告可能跨多位名人，celebrity 列存其去重姓名列表，仅作检索辅助。
    const celebrity =
      [...new Set(report.events.map((e) => e.celebrityName))].join(', ') || '-';
    await this.prisma.report.upsert({
      where: { id: report.id },
      create: { id: report.id, celebrity, data },
      update: { celebrity, data },
    });
  }

  private defaultConfig(): MonitorConfig {
    return {
      enabled: false,
      intervalHours: Number(
        this.configService.get('MONITOR_INTERVAL_HOURS') ?? 4,
      ),
      feishuWebhookUrl: this.configService.get('FEISHU_WEBHOOK_URL') ?? '',
      celebrities: DEFAULT_CELEBRITIES,
      signalThreshold: 65,
    };
  }
}
