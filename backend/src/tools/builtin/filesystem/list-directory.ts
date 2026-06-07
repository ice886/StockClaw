import { readdir } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';
import { tool } from 'ai';

export const listDirectoryTool = tool({
  description:
    'Get a detailed listing of all files and directories in a specified path. ' +
    'Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to the directory to list'),
  }),
  execute: async ({ path }) => {
    const resolved = resolve(path);
    const entries = await readdir(resolved, { withFileTypes: true });
    const formatted = entries
      .map(
        (entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`,
      )
      .join('\n');
    return formatted || '(empty directory)';
  },
});
