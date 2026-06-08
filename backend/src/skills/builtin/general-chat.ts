import { SkillConfig } from '../skill.interface';

export const generalChatSkill: SkillConfig = {
  name: 'general-chat',
  description: '通用对话助手 — 日常问答、翻译、写作',
  systemPrompt: `你是一个友好的 AI 助手。
- 用简体中文回答
- 回答简洁清晰
- 如果用户的问题需要实时信息，建议对方切换到「网络调研」技能`,
  toolNames: [],
  maxSteps: 1,
  icon: '💬',
};
