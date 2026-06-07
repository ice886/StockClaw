import { Injectable } from '@nestjs/common';
import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { SessionRecord } from './session.interface';
import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';

const DATA_DIR = resolve('data/sessions');

@Injectable()
export class SessionService {
  /** 确保 data/sessions 目录存在 */
  private async ensureDir(): Promise<void> {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }
  }

  private filePath(id: string): string {
    return join(DATA_DIR, `${id}.json`);
  }

  async createSession(title: string): Promise<string> {
    await this.ensureDir();
    const id = Math.random().toString(36).substring(2);
    const record: SessionRecord = {
      id,
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await writeFile(
      this.filePath(id),
      JSON.stringify(record, null, 2),
      'utf-8',
    );
    return id;
  }

  async getSessions(): Promise<SessionRecord[]> {
    await this.ensureDir();
    const files = await readdir(DATA_DIR);
    const records: SessionRecord[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await readFile(join(DATA_DIR, file), 'utf-8');
      records.push(JSON.parse(content) as SessionRecord);
    }
    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    try {
      const content = await readFile(this.filePath(id), 'utf-8');
      return JSON.parse(content) as SessionRecord;
    } catch {
      return undefined;
    }
  }

  async updateSession(
    id: string,
    title: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<boolean> {
    const record = await this.getSession(id);
    if (!record) return false;

    record.title = title;
    record.messages = messages;
    record.updatedAt = Date.now();
    await writeFile(
      this.filePath(id),
      JSON.stringify(record, null, 2),
      'utf-8',
    );
    return true;
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await unlink(this.filePath(id));
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
