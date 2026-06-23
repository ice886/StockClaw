import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SessionRecord } from './session.interface';
import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';

type SessionWithMessages = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: { role: string; content: string }[];
};

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Prisma 行 → SessionRecord（Date→epoch ms，保持前端契约不变） */
  private toRecord(s: SessionWithMessages): SessionRecord {
    return {
      id: s.id,
      title: s.title,
      messages: s.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      createdAt: s.createdAt.getTime(),
      updatedAt: s.updatedAt.getTime(),
    };
  }

  private genId(): string {
    return Math.random().toString(36).substring(2);
  }

  async createSession(title: string): Promise<string> {
    const id = this.genId();
    await this.prisma.session.create({ data: { id, title } });
    return id;
  }

  async getSessions(): Promise<SessionRecord[]> {
    const sessions = await this.prisma.session.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return sessions.map((s) => this.toRecord(s));
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return session ? this.toRecord(session) : undefined;
  }

  /** 全量覆盖语义：事务内清空旧消息后重建，并更新标题 */
  async updateSession(
    id: string,
    title: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<boolean> {
    const exists = await this.prisma.session.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) return false;

    const now = Date.now();
    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { sessionId: id } }),
      this.prisma.message.createMany({
        data: messages.map((m, i) => ({
          id: this.genId(),
          sessionId: id,
          role: m.role,
          content: m.content,
          // 递增时间戳保证读取时按 createdAt 升序还原原始顺序
          createdAt: new Date(now + i),
        })),
      }),
      this.prisma.session.update({
        where: { id },
        data: { title },
      }),
    ]);
    return true;
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      // 级联删除消息与 RagDocument 元数据（schema onDelete: Cascade）
      await this.prisma.session.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    const result = await generateText({
      model: deepseek('deepseek-chat'),
      prompt: `用不超过10个字概括以下内容，只返回标题，不要说明:\n\n${firstMessage}`,
    });
    return result.text.trim();
  }
}
