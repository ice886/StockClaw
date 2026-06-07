import { readdir } from 'fs/promises';
import { resolve, join, relative } from 'path';
import { z } from 'zod';
import { tool } from 'ai';

async function globSearch(
  dir: string,
  pattern: RegExp,
  results: string[] = [],
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await globSearch(full, pattern, results);
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

export const searchFileTool = tool({
  description:
    'Recursively search for files matching a glob-style pattern. ' +
    'Use patterns like "*.ts" to match by extension, or "test*" for prefix matching.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to the directory to search in'),
    pattern: z
      .string()
      .describe('Glob-style pattern, e.g. "*.ts" or "test*.ts"'),
  }),
  execute: async ({ path, pattern }) => {
    const resolved = resolve(path);
    const escaped = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    const results = await globSearch(resolved, regex);
    if (results.length === 0) {
      return `No files matching "${pattern}" found.`;
    }
    return results.map((f) => relative(resolved, f)).join('\n');
  },
});
