import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AgentService } from './agent.service';
import { SkillRegistry } from '../skills/skill.registry';
import { RagService } from '../rag/rag.service';

interface ChatRequestDto {
  messages: { role: 'user' | 'assistant'; content: string }[];
  skillName?: string;
  sessionId?: string;
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
    private readonly rag: RagService,
  ) {}

  @Post('chat')
  async chat(
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
  ): Promise<ChatResponseDto> {
    const signal = new AbortController();
    req.on('close', () => signal.abort());

    const skill = this.skills.get(dto.skillName ?? 'general-chat')!;
    const system = await this.resolveSystem(
      dto.skillName ?? 'general-chat',
      dto.sessionId,
      dto.messages,
    );

    const content = await this.agent.run({
      system,
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
    const system = await this.resolveSystem(
      dto.skillName ?? 'general-chat',
      dto.sessionId,
      dto.messages,
    );

    try {
      for await (const event of this.agent.runStream({
        system,
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

  /** 组装 system prompt：skill 基础 prompt + RAG 检索上下文 */
  private async resolveSystem(
    skillName: string,
    sessionId: string | undefined,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    const base = this.skills.resolvePrompt(skillName);

    if (!sessionId) return base;

    const userMessage =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    if (!userMessage) return base;

    const chunks = await this.rag.retrieve(sessionId, userMessage);
    if (chunks.length === 0) return base;

    const ragContext =
      `\n\n---\n以下是用户上传的相关文档片段（按相关度排序）：\n\n` +
      chunks
        .map(
          (c, i) =>
            `【片段 ${i + 1}（${c.filename}，相关度 ${(c.score * 100).toFixed(0)}%）】\n${c.text}`,
        )
        .join('\n\n');

    return base + ragContext;
  }
}
