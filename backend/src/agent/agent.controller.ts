import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AgentService } from './agent.service';

interface ChatRequestDto {
  messages: { role: 'user' | 'assistant'; content: string }[];
}

interface ChatResponseDto {
  role: 'assistant';
  content: string;
}

@Controller('api')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('chat')
  async chat(
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
  ): Promise<ChatResponseDto> {
    const signal = new AbortController();
    req.on('close', () => signal.abort());
    const content = await this.agent.run(dto.messages, signal.signal);
    return { role: 'assistant', content };
  }
}