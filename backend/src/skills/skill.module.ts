import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillRegistry } from './skill.registry';

@Module({
  controllers: [SkillController],
  providers: [SkillRegistry],
  exports: [SkillRegistry],
})
export class SkillModule {}
