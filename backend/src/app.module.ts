import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { SessionModule } from './session/session.module';
import { SkillModule } from './skills/skill.module';
import { MonitorModule } from './monitor/monitor.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AgentModule, SessionModule, MonitorModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
