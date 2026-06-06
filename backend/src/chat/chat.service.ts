import { Injectable } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(private readonly agentService: AgentService) {}

  async chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
    const content = await this.agentService.run(dto.messages);
    return { role: 'assistant', content };
  }
}
