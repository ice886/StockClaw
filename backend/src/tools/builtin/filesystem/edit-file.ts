import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';
import { tool } from 'ai';

export const editFileTool = tool({
  description:
    'Make line-based edits to a text file. Each edit replaces exact line sequences ' +
    'with new content.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to the file to edit'),
    oldText: z.string().describe('Text to search for — must match exactly'),
    newText: z.string().describe('Text to replace with'),
  }),
  execute: async ({ path, oldText, newText }) => {
    const resolved = resolve(path);
    const content = await readFile(resolved, 'utf-8');

    if (!content.includes(oldText)) {
      return `Error: oldText not found in ${resolved}. No changes made.`;
    }

    const updated = content.replace(oldText, newText);
    await writeFile(resolved, updated, 'utf-8');
    return `Successfully edited ${resolved}`;
  },
});
