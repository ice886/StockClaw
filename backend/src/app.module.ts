import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AgentModule } from './agent/agent.module';
import { SessionModule } from './session/session.module';
import { SkillModule } from './skills/skill.module';
import { MonitorModule } from './monitor/monitor.module';
import { RagModule } from './rag/rag.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AgentModule,
    SessionModule,
    MonitorModule,
    RagModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
