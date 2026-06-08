import { Controller, Get } from '@nestjs/common';
import { SkillRegistry } from './skill.registry';
import { SkillConfig } from './skill.interface';

@Controller('api')
export class SkillController {
  constructor(private readonly registry: SkillRegistry) {}

  @Get('skills')
  list(): SkillConfig[] {
    return this.registry.list();
  }
}
