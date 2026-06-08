import { Injectable } from '@nestjs/common';
import { generateText, stepCountIs } from 'ai';
import { deepseek } from '@ai-sdk/deepseek';
import { readFileTool } from '../tools/builtin/filesystem/read-file';
import { writeFileTool } from '../tools/builtin/filesystem/write-file';
import { createDirectoryTool } from '../tools/builtin/filesystem/create-directory';
import { editFileTool } from '../tools/builtin/filesystem/edit-file';
import { listDirectoryTool } from '../tools/builtin/filesystem/list-directory';
import { searchFileTool } from '../tools/builtin/filesystem/search-file';
import { webSearch } from '@exalabs/ai-sdk';

export interface AgentRunOptions {
  system: string;
  messages: { role: string; content: string }[];
  tools: string[];
  maxSteps: number;
  abortSignal?: AbortSignal;
}

@Injectable()
export class AgentService {
  /** 延迟创建：确保 .env 已经由 ConfigModule 加载 */
  private getToolMap() {
    return {
      read_file: readFileTool,
      write_file: writeFileTool,
      create_directory: createDirectoryTool,
      edit_file: editFileTool,
      list_directory: listDirectoryTool,
      search_file: searchFileTool,
      webSearch: webSearch({ numResults: 5 }),
    };
  }

  async run(opts: AgentRunOptions): Promise<string> {
    const toolMap = this.getToolMap();
    const resolvedTools: Record<
      string,
      (typeof toolMap)[keyof typeof toolMap]
    > = {};
    for (const name of opts.tools) {
      if (name in toolMap) {
        resolvedTools[name] = toolMap[name as keyof typeof toolMap];
      }
    }

    const result = await generateText({
      model: deepseek('deepseek-chat'),
      system: opts.system,
      messages: opts.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools: resolvedTools,
      stopWhen: stepCountIs(opts.maxSteps),
      abortSignal: opts.abortSignal,
    });

    return result.text;
  }
}
