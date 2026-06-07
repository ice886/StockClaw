import { Injectable } from '@nestjs/common';
import { generateText, stepCountIs } from 'ai';
import { deepseek } from '@ai-sdk/deepseek';
import { readFileTool } from '../tools/builtin/filesystem/read-file';
import { writeFileTool } from '../tools/builtin/filesystem/write-file';
import { createDirectoryTool } from '../tools/builtin/filesystem/create-directory';
import { editFileTool } from '../tools/builtin/filesystem/edit-file';
import { listDirectoryTool } from '../tools/builtin/filesystem/list-directory';
import { searchFileTool } from '../tools/builtin/filesystem/search-file';
import { webSearchTool } from '../tools/builtin/web-search';

const SYSTEM_PROMPT = 'You are a helpful assistant.';

@Injectable()
export class AgentService {
  async run(messages: { role: string; content: string }[]): Promise<string> {
    const result = await generateText({
      model: deepseek('deepseek-chat'),
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools: {
        read_file: readFileTool,
        write_file: writeFileTool,
        create_directory: createDirectoryTool,
        edit_file: editFileTool,
        list_directory: listDirectoryTool,
        search_file: searchFileTool,
        web_search: webSearchTool,
      },
      stopWhen: stepCountIs(10),
    });

    return result.text;
  }
}
