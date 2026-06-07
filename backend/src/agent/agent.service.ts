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

const SYSTEM_PROMPT = `You are a research assistant with access to a web_search tool.

When to use web_search:
- Any question about recent events, news, or current data
- Questions about specific people, companies, or stock prices
- When the user asks about "latest", "current", "today", "this week"
- Fact-checking or verifying claims

When NOT to search:
- Pure translation, summarization, or code generation
- General knowledge questions (e.g., "What is gravity?")

Rules:
- Always search when unsure — better to have fresh data
- Cite sources when you use search results
- Combine multiple search results to form a complete answer`;

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
        webSearch: webSearch({
          type: 'deep',
          category: 'news',
          numResults: 10,
          userLocation: 'CN',
          startPublishedDate: '2026-05-31',
          contents: {
            highlights: {
              numSentences: 5,
              highlightsPerUrl: 3,
              query: '用简体中文（Simplified Chinese, zh-CN）提取关键信息',
            },
            summary: {
              query:
                '用简体中文（Simplified Chinese, NOT Traditional Chinese）总结要点。使用中国大陆的用语习惯。',
            },
            text: { maxCharacters: 2000 },
          },
          includeDomains: [
            'cls.cn',
            'eastmoney.com',
            '36kr.com',
            'jin10.com',
            'finance.sina.com.cn',
            'wallstreetcn.com',
          ],
          excludeDomains: ['tw', 'hk01.com'],
        }),
      },
      stopWhen: stepCountIs(10),
    });

    return result.text;
  }
}
