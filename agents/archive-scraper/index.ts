// Phase 1 — TikTok Content Agent | Step 1: Internet Archive Scraper
// Section 05 Task #4 — First Phase 1 revenue code
//
// APIs used:
//   CDX Server:   http://web.archive.org/cdx/search/cdx?url=...
//   Availability: http://archive.org/wayback/available?url=...
//   Item search:  https://archive.org/advancedsearch.php (JSON)

import { RATE_LIMIT_MS } from './config';

export interface ArchiveResult {
  id: string;
  title: string;
  url: string;
  mediaType: string;
  year: string;
  description: string;
}

export interface ScraperConfig {
  query: string;
  maxResults: number;
  apiBaseUrl: string;
}

export class ArchiveScraper {
  private config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  /**
   * Scrape Internet Archive for items matching config.query.
   * Uses CDX API to fetch URLs and availability API to enrich metadata.
   *
   * CDX endpoint:  {apiBaseUrl}/cdx/search/cdx?url={query}&output=json&limit={maxResults}
   * Availability:  {apiBaseUrl}/wayback/available?url={query}
   * Advanced search: https://archive.org/advancedsearch.php?q={query}&output=json
   */
  async scrape(): Promise<ArchiveResult[]> {
    const results: ArchiveResult[] = [];
    // Use Advanced Search API for keyword queries (CDX is for URL pattern matching only)
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(this.config.query)}+mediatype:image&output=json&fl[]=identifier,title,description,mediatype,year&rows=${this.config.maxResults}&page=1`;

    try {
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error(`Advanced search failed with status ${res.status}`);

      const data = await res.json() as { response?: { docs?: any[] } };
      const docs = data.response?.docs ?? [];

      for (const doc of docs) {
        const identifier = doc.identifier as string;
        if (!identifier) continue;
        results.push({
          id: identifier,
          title: doc.title ?? identifier,
          url: `https://archive.org/services/img/${identifier}`,
          mediaType: doc.mediatype ?? 'image',
          year: String(doc.year ?? ''),
          description: doc.description ?? '',
        });
        if (results.length < docs.length) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
        }
      }
    } catch (error) {
      console.error('Error fetching from Advanced Search API:', error);
    }

    return results;
  }
}