import { Injectable } from '@nestjs/common';
import { generateText } from 'ai';
import { deepseek } from '@ai-sdk/deepseek';

@Injectable()
export class AgentService {
  async run(messages: { role: string; content: string }[]): Promise<string> {
    const result = await generateText({
      model: deepseek('deepseek-chat'),
      prompt: messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n'),
    });
    return result.text;
  }
}
