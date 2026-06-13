import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MonitorService } from './monitor.service';
import { FeishuService } from '../feishu/feishu.service';

@Injectable()
export class MonitorScheduler {
  private readonly logger = new Logger(MonitorScheduler.name);

  constructor(
    private monitor: MonitorService,
    private feishu: FeishuService,
  ) {}

  // Run at minute 0 of every 4th hour by default
  // The actual interval is controlled by config; cron is the trigger mechanism
  @Cron('0 */4 * * *')
  async runScheduled(): Promise<void> {
    const config = this.monitor.getConfig();
    if (!config.enabled) {
      this.logger.debug('Monitor disabled, skipping scheduled run');
      return;
    }
    await this.runAndNotify();
  }

  async runManual(): Promise<void> {
    await this.runAndNotify();
  }

  private async runAndNotify(): Promise<void> {
    try {
      const report = await this.monitor.runFullCycle();

      const config = this.monitor.getConfig();
      if (config.feishuWebhookUrl) {
        await this.feishu.sendReport(report, config.feishuWebhookUrl);
        this.monitor.markFeishuSent(report.id);
        this.logger.log(`Feishu report sent for ${report.id}`);
      } else {
        this.logger.warn('FEISHU_WEBHOOK_URL not configured, skipping push');
      }
    } catch (err) {
      this.logger.error(`Monitor cycle error: ${err}`);
    }
  }
}
