export interface SkillConfig {
  name: string;
  description: string;
  systemPrompt: string;
  toolNames: string[];
  maxSteps: number;
  icon?: string;
}
