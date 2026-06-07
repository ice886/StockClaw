import { Body, Controller, Post } from '@nestjs/common';
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
  async chat(@Body() dto: ChatRequestDto): Promise<ChatResponseDto> {
    const content = await this.agent.run(dto.messages);
    return { role: 'assistant', content };
  }
}
