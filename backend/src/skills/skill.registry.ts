import { Injectable } from '@nestjs/common';
import { SkillConfig } from './skill.interface';
import { generalChatSkill } from './builtin/general-chat';
import { fileOpsSkill } from './builtin/file-ops';
import { webResearchSkill } from './builtin/web-research';
import { celebrityMonitorSkill } from './builtin/celebrity-monitor';
import { stockAnalysisSkill } from './builtin/stock-analysis';

@Injectable()
export class SkillRegistry {
  private skills = new Map<string, SkillConfig>();

  constructor() {
    this.register(generalChatSkill);
    this.register(fileOpsSkill);
    this.register(webResearchSkill);
    this.register(celebrityMonitorSkill);
    this.register(stockAnalysisSkill);
  }

  register(skill: SkillConfig): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillConfig | undefined {
    return this.skills.get(name);
  }

  /** 解析 systemPrompt：支持静态字符串或动态函数 */
  resolvePrompt(name: string): string {
    const skill = this.skills.get(name);
    if (!skill) return '';
    const { systemPrompt } = skill;
    return typeof systemPrompt === 'function' ? systemPrompt() : systemPrompt;
  }

  list(): SkillConfig[] {
    return [...this.skills.values()];
  }
}
