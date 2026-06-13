import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { MonitorScheduler } from './monitor.scheduler';
import { CrawlerService } from './crawler.service';
import { EventExtractorService } from './event-extractor.service';
import { StockAnalyzerService } from './stock-analyzer.service';
import { FeishuModule } from '../feishu/feishu.module';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule, FeishuModule],
  controllers: [MonitorController],
  providers: [
    MonitorService,
    MonitorScheduler,
    CrawlerService,
    EventExtractorService,
    StockAnalyzerService,
  ],
  exports: [MonitorService],
})
export class MonitorModule {}
