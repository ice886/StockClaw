import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CELEBRITIES } from '../config/celebrities.config';
import { CrawlerService } from './crawler.service';
import { EventExtractorService } from './event-extractor.service';
import { StockAnalyzerService } from './stock-analyzer.service';
import {
  CelebrityEvent,
  MonitorConfig,
  MonitorReport,
  StockSignal,
} from './interfaces/monitor.interfaces';

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);
  private readonly configPath: string;
  private readonly reportsDir: string;

  constructor(
    private configService: ConfigService,
    private crawler: CrawlerService,
    private extractor: EventExtractorService,
    private analyzer: StockAnalyzerService,
  ) {
    this.configPath = path.resolve(
      process.cwd(),
      'data',
      'monitor-config.json',
    );
    this.reportsDir = path.resolve(process.cwd(), 'data', 'reports');
    this.ensureDirs();
  }

  // ─── Config ───────────────────────────────────────────────────────────

  getConfig(): MonitorConfig {
    if (!fs.existsSync(this.configPath)) {
      return this.defaultConfig();
    }
    try {
      return JSON.parse(
        fs.readFileSync(this.configPath, 'utf-8'),
      ) as MonitorConfig;
    } catch {
      return this.defaultConfig();
    }
  }

  saveConfig(partial: Partial<MonitorConfig>): MonitorConfig {
    const current = this.getConfig();
    const updated = { ...current, ...partial };
    fs.writeFileSync(
      this.configPath,
      JSON.stringify(updated, null, 2),
      'utf-8',
    );
    return updated;
  }

  // ─── Run ──────────────────────────────────────────────────────────────

  async runFullCycle(
    onProgress?: (msg: string) => void,
  ): Promise<MonitorReport> {
    const config = this.getConfig();
    const enabledCelebrities = config.celebrities.filter((c) => c.enabled);
    const intervalHours = config.intervalHours;

    this.logger.log(
      `Starting monitor cycle: ${enabledCelebrities.length} celebrities, ${intervalHours}h window`,
    );
    onProgress?.(`开始扫描 ${enabledCelebrities.length} 位名人...`);

    const allEvents: CelebrityEvent[] = [];
    const allSignals: StockSignal[] = [];

    for (const celebrity of enabledCelebrities) {
      onProgress?.(`正在抓取 ${celebrity.nameZh} 的动态...`);
      this.logger.log(`Crawling: ${celebrity.name}`);

      const rawResults = await this.crawler.fetchRawEvents(celebrity);
      this.logger.log(`  Found ${rawResults.length} raw results`);

      onProgress?.(
        `正在提取 ${celebrity.nameZh} 的事件（${rawResults.length} 条原始数据）...`,
      );
      const events = await this.extractor.extract(celebrity, rawResults);
      this.logger.log(`  Extracted ${events.length} events`);
      allEvents.push(...events);

      const highMed = events.filter(
        (e) => e.importance === 'high' || e.importance === 'medium',
      );
      if (highMed.length > 0) {
        onProgress?.(`正在分析 ${celebrity.nameZh} 相关股票影响...`);
        const signals = await this.analyzer.analyze(celebrity, events);
        this.logger.log(`  Generated ${signals.length} signals`);
        allSignals.push(...signals);
      }
    }

    const report: MonitorReport = {
      id: Date.now().toString(36),
      generatedAt: new Date().toISOString(),
      intervalHours,
      events: allEvents,
      signals: allSignals,
      feishuSent: false,
    };

    this.saveReport(report);
    this.saveConfig({ lastRunAt: report.generatedAt });

    onProgress?.(
      `扫描完成：${allEvents.length} 条事件，${allSignals.length} 个股票信号`,
    );
    this.logger.log(
      `Cycle complete: ${allEvents.length} events, ${allSignals.length} signals`,
    );

    return report;
  }

  // ─── Reports ──────────────────────────────────────────────────────────

  listReports(): Pick<
    MonitorReport,
    'id' | 'generatedAt' | 'feishuSent' | 'intervalHours'
  >[] {
    const files = fs
      .readdirSync(this.reportsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 50);

    return files.map((f) => {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(this.reportsDir, f), 'utf-8'),
        ) as MonitorReport;
        return {
          id: data.id,
          generatedAt: data.generatedAt,
          feishuSent: data.feishuSent,
          intervalHours: data.intervalHours,
        };
      } catch {
        return {
          id: f.replace('.json', ''),
          generatedAt: '',
          feishuSent: false,
          intervalHours: 0,
        };
      }
    });
  }

  getReport(id: string): MonitorReport | null {
    const filePath = path.join(this.reportsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MonitorReport;
    } catch {
      return null;
    }
  }

  markFeishuSent(id: string): void {
    const report = this.getReport(id);
    if (!report) return;
    report.feishuSent = true;
    this.saveReport(report);
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private saveReport(report: MonitorReport): void {
    const filePath = path.join(this.reportsDir, `${report.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  }

  private defaultConfig(): MonitorConfig {
    return {
      enabled: false,
      intervalHours: Number(
        this.configService.get('MONITOR_INTERVAL_HOURS') ?? 4,
      ),
      feishuWebhookUrl: this.configService.get('FEISHU_WEBHOOK_URL') ?? '',
      celebrities: DEFAULT_CELEBRITIES,
    };
  }

  private ensureDirs(): void {
    const dataDir = path.resolve(process.cwd(), 'data');
    for (const dir of [dataDir, this.reportsDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }
}
