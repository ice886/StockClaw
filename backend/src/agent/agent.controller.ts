import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
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
      system: this.skills.resolvePrompt(dto.skillName ?? 'general-chat'),
      messages: dto.messages,
      tools: skill.toolNames,
      maxSteps: skill.maxSteps,
      abortSignal: signal.signal,
    });

    return { role: 'assistant', content };
  }

  @Post('chat/stream')
  async chatStream(
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const signal = new AbortController();
    req.on('close', () => signal.abort());

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const skill = this.skills.get(dto.skillName ?? 'general-chat')!;

    try {
      for await (const event of this.agent.runStream({
        system: this.skills.resolvePrompt(dto.skillName ?? 'general-chat'),
        messages: dto.messages,
        tools: skill.toolNames,
        maxSteps: skill.maxSteps,
        abortSignal: signal.signal,
      })) {
        if (res.destroyed) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      if (!res.destroyed) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`,
        );
      }
    }

    res.end();
  }
}
