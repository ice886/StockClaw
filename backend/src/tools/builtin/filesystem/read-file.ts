import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';
import { tool } from 'ai';

export const readFileTool = tool({
  description:
    'Read the complete contents of a file from the file system as text. ' +
    'Use the "head" parameter to read only the first N lines, ' +
    'or "tail" to read only the last N lines.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to the file'),
    head: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Return only the first N lines'),
    tail: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Return only the last N lines'),
  }),
  execute: async ({ path, head, tail }) => {
    if (head && tail) {
      throw new Error(
        'Cannot specify both head and tail parameters simultaneously',
      );
    }

    const resolved = resolve(path);
    let content = await readFile(resolved, 'utf-8');

    const lines = content.split('\n');
    if (head && lines.length > head) {
      content = lines.slice(0, head).join('\n');
    } else if (tail && lines.length > tail) {
      content = lines.slice(-tail).join('\n');
    }

    return content;
  },
});
