import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AgentService } from './agent.service';
import { SkillRegistry } from '../skills/skill.registry';

interface ChatRequestDto {
  messages: { role: 'user' | 'assistant'; content: string }[];
  skillName?: string;
}

interface ChatResponseDto {
  role: 'assistant';
  content: string;
}

@Controller('api')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly skills: SkillRegistry,
  ) {}

  @Post('chat')
  async chat(
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
  ): Promise<ChatResponseDto> {
    const signal = new AbortController();
    req.on('close', () => signal.abort());

    const skill = this.skills.get(dto.skillName ?? 'general-chat')!;

    const content = await this.agent.run({
      system: skill.systemPrompt,
      messages: dto.messages,
      tools: skill.toolNames,
      maxSteps: skill.maxSteps,
      abortSignal: signal.signal,
    });

    return { role: 'assistant', content };
  }
}
