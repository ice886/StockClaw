import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';
import { tool } from 'ai';

export const writeFileTool = tool({
  description:
    'Create a new file or completely overwrite an existing file with new content. ' +
    'Use with caution as it will overwrite existing files without warning.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('The text content to write to the file'),
  }),
  execute: async ({ path, content }) => {
    const resolved = resolve(path);
    await writeFile(resolved, content, 'utf-8');
    return `Successfully wrote ${content.length} bytes to ${resolved}`;
  },
});
