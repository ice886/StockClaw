import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { webSearch } from '@exalabs/ai-sdk';
import { Celebrity } from '../config/celebrities.config';
import { RawSearchResult } from './interfaces/monitor.interfaces';

interface ExaResult {
  title?: string;
  url?: string;
  publishedDate?: string;
  text?: string;
  snippet?: string;
}

interface ExaResponse {
  results?: ExaResult[];
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(private configService: ConfigService) {}

  async fetchRawEvents(celebrity: Celebrity): Promise<RawSearchResult[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const queries = this.buildQueries(celebrity);

    const results: RawSearchResult[] = [];
    const tool = webSearch({ numResults: 5, startPublishedDate: since });

    for (const query of queries) {
      try {
        const raw = await (
          tool as unknown as {
            execute: (
              args: { query: string },
              opts: object,
            ) => Promise<ExaResponse>;
          }
        ).execute({ query }, {});
        const items = Array.isArray(raw?.results) ? raw.results : [];
        for (const item of items) {
          results.push({
            title: item.title ?? '',
            url: item.url ?? '',
            publishedDate: item.publishedDate,
            text: item.text ?? item.snippet ?? '',
          });
        }
      } catch (err) {
        this.logger.warn(`Search failed for "${query}": ${err}`);
      }
    }

    return this.dedup(results);
  }

  private buildQueries(celebrity: Celebrity): string[] {
    const name = celebrity.name;
    const kw = celebrity.searchKeywords.join(' OR ');
    return [
      `"${name}" announcement OR partnership OR deal OR visit OR investment`,
      `"${name}" ${celebrity.primaryTicker} stock`,
      `${kw} "${name}"`,
    ];
  }

  private dedup(results: RawSearchResult[]): RawSearchResult[] {
    const seen = new Set<string>();
    return results.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
  }
}
