export interface SkillConfig {
  name: string;
  description: string;
  systemPrompt: string | (() => string);
  toolNames: string[];
  maxSteps: number;
  icon?: string;
}
