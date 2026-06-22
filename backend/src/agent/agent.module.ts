import { Module } from '@nestjs/common';
import { SkillModule } from '../skills/skill.module';
import { RagModule } from '../rag/rag.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [SkillModule, RagModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
