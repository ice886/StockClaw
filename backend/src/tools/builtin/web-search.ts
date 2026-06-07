import { get } from 'https';
import { z } from 'zod';
import { tool } from 'ai';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(query);
    const url = `https://lite.duckduckgo.com/lite/?q=${encoded}`;

    get(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => {
        const results: SearchResult[] = [];
        const rowRegex =
          /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>\s*<span[^>]*>([^<]*)<\/span>/g;
        let match: RegExpExecArray | null;
        while ((match = rowRegex.exec(body)) !== null) {
          const rawUrl = match[1];
          const title = match[2].replace(/<[^>]*>/g, '').trim();
          const snippet = match[3].replace(/<[^>]*>/g, '').trim();
          if (title && rawUrl && !rawUrl.startsWith('//')) {
            results.push({ title, url: rawUrl, snippet });
          }
          if (results.length >= 10) break;
        }
        resolve(results);
      });
    }).on('error', reject);
  });
}

export const webSearchTool = tool({
  description:
    'Search the web using DuckDuckGo and return the top results. ' +
    'Use this to find current information, documentation, or answers ' +
    'to questions that require up-to-date knowledge.',
  inputSchema: z.object({
    query: z.string().describe('The search query string'),
  }),
  execute: async ({ query }) => {
    const results = await searchDuckDuckGo(query);
    if (results.length === 0) {
      return `No results found for "${query}".`;
    }
    return results
      .map(
        (r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
      )
      .join('\n\n');
  },
});
