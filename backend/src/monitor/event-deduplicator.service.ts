import { Injectable } from '@nestjs/common';
import { CelebrityEvent } from './interfaces/monitor.interfaces';

export interface DeduplicationResult {
  newEvents: CelebrityEvent[];
  mergedCount: number;
  filteredCount: number;
}

@Injectable()
export class EventDeduplicatorService {
  deduplicate(
    currentEvents: CelebrityEvent[],
    previousEvents: CelebrityEvent[],
  ): DeduplicationResult {
    const prevUrls = new Set(
      previousEvents.map((e) => e.sourceUrl).filter(Boolean),
    );
    const prevTitleHashes = new Set(
      previousEvents.map((e) => this.titleHash(e.title)),
    );

    const seen = new Set<string>();
    const deduped: CelebrityEvent[] = [];
    let filteredCount = 0;
    let mergedCount = 0;

    for (const event of currentEvents) {
      // Skip if already seen in previous reports (URL match)
      if (event.sourceUrl && prevUrls.has(event.sourceUrl)) {
        filteredCount++;
        continue;
      }

      // Skip if title is similar to a previous event
      const hash = this.titleHash(event.title);
      if (prevTitleHashes.has(hash)) {
        filteredCount++;
        continue;
      }

      // Deduplicate within current batch by URL
      if (event.sourceUrl && seen.has(`url:${event.sourceUrl}`)) {
        mergedCount++;
        continue;
      }

      // Deduplicate within current batch by title similarity
      let merged = false;
      for (const kept of deduped) {
        if (
          kept.celebrityId === event.celebrityId &&
          this.jaccardSimilarity(kept.title, event.title) > 0.85
        ) {
          // Keep higher importance
          if (
            this.importanceRank(event.importance) >
            this.importanceRank(kept.importance)
          ) {
            kept.importance = event.importance;
          }
          mergedCount++;
          merged = true;
          break;
        }

        // Same celebrity + ticker window dedup
        if (
          kept.celebrityId === event.celebrityId &&
          kept.publishedAt &&
          event.publishedAt &&
          Math.abs(
            new Date(kept.publishedAt).getTime() -
              new Date(event.publishedAt).getTime(),
          ) <
            6 * 60 * 60 * 1000 // 6h window
        ) {
          const keptSignals = this.extractTickers(kept.title + kept.summary);
          const eventSignals = this.extractTickers(event.title + event.summary);
          const overlap = keptSignals.filter((t) => eventSignals.includes(t));
          if (
            overlap.length > 0 &&
            this.jaccardSimilarity(kept.summary, event.summary) > 0.6
          ) {
            mergedCount++;
            merged = true;
            break;
          }
        }
      }

      if (!merged) {
        if (event.sourceUrl) seen.add(`url:${event.sourceUrl}`);
        deduped.push(event);
      }
    }

    return { newEvents: deduped, mergedCount, filteredCount };
  }

  private titleHash(title: string): string {
    const words = title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .sort();
    return words.join('|');
  }

  private jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(
      a
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    const wordsB = new Set(
      b
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    if (wordsA.size === 0 && wordsB.size === 0) return 1;
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = wordsA.size + wordsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private importanceRank(importance: CelebrityEvent['importance']): number {
    return { high: 3, medium: 2, low: 1 }[importance] ?? 1;
  }

  private extractTickers(text: string): string[] {
    const matches = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
    return [...new Set(matches)];
  }
}
