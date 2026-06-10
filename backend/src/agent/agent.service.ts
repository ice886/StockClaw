import { Injectable } from '@nestjs/common';
import { generateText, streamText, stepCountIs } from 'ai';
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

export interface AgentStreamEvent {
  type:
    | 'text-delta'
    | 'tool-call'
    | 'tool-result'
    | 'tool-error'
    | 'error'
    | 'done';
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  error?: string;
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

  private resolveTools(toolNames: string[]) {
    const toolMap = this.getToolMap();
    const resolved: Record<string, (typeof toolMap)[keyof typeof toolMap]> = {};
    for (const name of toolNames) {
      if (name in toolMap) {
        resolved[name] = toolMap[name as keyof typeof toolMap];
      }
    }
    return resolved;
  }

  async run(opts: AgentRunOptions): Promise<string> {
    const result = await generateText({
      model: deepseek('deepseek-chat'),
      system: opts.system,
      messages: opts.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools: this.resolveTools(opts.tools),
      stopWhen: stepCountIs(opts.maxSteps),
      abortSignal: opts.abortSignal,
    });

    return result.text;
  }

  async *runStream(opts: AgentRunOptions): AsyncGenerator<AgentStreamEvent> {
    try {
      const result = streamText({
        model: deepseek('deepseek-chat'),
        system: opts.system,
        messages: opts.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        tools: this.resolveTools(opts.tools),
        stopWhen: stepCountIs(opts.maxSteps),
        abortSignal: opts.abortSignal,
      });

      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          case 'text-delta': {
            // fullStream 有两个 text-delta 变体（delta vs text），运行时区分
            const c = chunk as unknown as { delta?: string; text?: string };
            yield { type: 'text-delta', content: c.delta ?? c.text ?? '' };
            break;
          }
          case 'tool-input-start': {
            // DeepSeek 在开始准备工具参数时发出（比 tool-call 更早）
            const c = chunk as unknown as { toolName: string };
            yield { type: 'tool-call', toolName: c.toolName };
            break;
          }
          case 'tool-call': {
            const c = chunk as unknown as { toolName: string; input: unknown };
            yield {
              type: 'tool-call',
              toolName: c.toolName,
              toolInput: c.input,
            };
            break;
          }
          case 'tool-result': {
            const c = chunk as unknown as { toolName: string; output: unknown };
            yield {
              type: 'tool-result',
              toolName: c.toolName,
              toolOutput:
                typeof c.output === 'string'
                  ? c.output
                  : JSON.stringify(c.output),
            };
            break;
          }
          case 'tool-error': {
            const c = chunk as unknown as { toolName: string; error: unknown };
            yield {
              type: 'tool-error',
              toolName: c.toolName,
              error: String(c.error),
            };
            break;
          }
        }
      }
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: String(err) };
    }
  }
}
