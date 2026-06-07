import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';
import { tool } from 'ai';

export const createDirectoryTool = tool({
  description:
    'Create a new directory or ensure a directory exists. Can create multiple ' +
    'nested directories in one operation. If the directory already exists, ' +
    'this operation will succeed silently.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to the directory to create'),
  }),
  execute: async ({ path }) => {
    const resolved = resolve(path);
    await mkdir(resolved, { recursive: true });
    return `Successfully created directory ${resolved}`;
  },
});
