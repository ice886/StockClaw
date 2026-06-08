import { Injectable } from '@nestjs/common';
import { SkillConfig } from './skill.interface';
import { generalChatSkill } from './builtin/general-chat';
import { fileOpsSkill } from './builtin/file-ops';
import { webResearchSkill } from './builtin/web-research';

@Injectable()
export class SkillRegistry {
  private skills = new Map<string, SkillConfig>();

  constructor() {
    this.register(generalChatSkill);
    this.register(fileOpsSkill);
    this.register(webResearchSkill);
  }

  register(skill: SkillConfig): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillConfig | undefined {
    return this.skills.get(name);
  }

  list(): SkillConfig[] {
    return [...this.skills.values()];
  }
}
