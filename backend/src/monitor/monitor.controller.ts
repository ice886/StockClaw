import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Res,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { MonitorService } from './monitor.service';
import { MonitorScheduler } from './monitor.scheduler';
import { FeishuService } from '../feishu/feishu.service';
import { MonitorConfig } from './interfaces/monitor.interfaces';

@Controller('api/monitor')
export class MonitorController {
  constructor(
    private monitor: MonitorService,
    private scheduler: MonitorScheduler,
    private feishu: FeishuService,
  ) {}

  @Get('status')
  getStatus() {
    const config = this.monitor.getConfig();
    return {
      enabled: config.enabled,
      intervalHours: config.intervalHours,
      lastRunAt: config.lastRunAt ?? null,
      feishuConfigured: !!config.feishuWebhookUrl,
      celebrities: config.celebrities
        .filter((c) => c.enabled)
        .map((c) => ({
          id: c.id,
          name: c.name,
          nameZh: c.nameZh,
          primaryTicker: c.primaryTicker,
        })),
    };
  }

  @Get('config')
  getConfig() {
    const config = this.monitor.getConfig();
    // Don't expose the full webhook URL
    return {
      ...config,
      feishuWebhookUrl: config.feishuWebhookUrl
        ? config.feishuWebhookUrl.replace(/hook\/(.{4}).*$/, 'hook/$1****')
        : '',
    };
  }

  @Put('config')
  updateConfig(@Body() body: Partial<MonitorConfig>) {
    return this.monitor.saveConfig(body);
  }

  @Post('run')
  @HttpCode(200)
  async runManual(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (type: string, data: object) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
      const report = await this.monitor.runFullCycle((msg) => {
        send('progress', { message: msg });
      });

      const config = this.monitor.getConfig();
      let feishuSent = false;
      if (config.feishuWebhookUrl) {
        await this.feishu.sendReport(report, config.feishuWebhookUrl);
        this.monitor.markFeishuSent(report.id);
        feishuSent = true;
      }

      send('done', {
        reportId: report.id,
        events: report.events.length,
        signals: report.signals.length,
        feishuSent,
      });
    } catch (err) {
      send('error', { message: String(err) });
    }

    res.end();
  }

  @Get('reports')
  listReports() {
    return this.monitor.listReports();
  }

  @Get('reports/:id')
  getReport(@Param('id') id: string) {
    return this.monitor.getReport(id);
  }

  @Post('reports/:id/resend')
  @HttpCode(200)
  async resendReport(@Param('id') id: string) {
    const report = this.monitor.getReport(id);
    if (!report) return { success: false, message: 'Report not found' };

    const config = this.monitor.getConfig();
    if (!config.feishuWebhookUrl) {
      return { success: false, message: 'Feishu webhook not configured' };
    }

    await this.feishu.sendReport(report, config.feishuWebhookUrl);
    this.monitor.markFeishuSent(report.id);
    return { success: true };
  }
}
