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
    const cdxUrl = `${this.config.apiBaseUrl}/cdx/search/cdx?url=${encodeURIComponent(this.config.query)}&output=json&limit=${this.config.maxResults}`;
    
    try {
      const cdxResponse = await fetch(cdxUrl);
      if (!cdxResponse.ok) {
        throw new Error(`CDX API request failed with status ${cdxResponse.status}`);
      }
      
      const cdxData = await cdxResponse.json() as any[];
      
      for (let i = 1; i < cdxData.length; i++) { // Skip CDX header row (index 0 = field names)
        const [url, timestamp, mimeType] = cdxData[i];
        const availabilityUrl = `${this.config.apiBaseUrl}/wayback/available?url=${encodeURIComponent(url)}`;
        
        try {
          const availabilityResponse = await fetch(availabilityUrl);
          if (!availabilityResponse.ok) {
            throw new Error(`Availability check failed for ${url}`);
          }
          
          const availabilityData = await availabilityResponse.json() as any;
          // Real API shape: { archived_snapshots: { closest: { url, timestamp, status } } }
          const closest = availabilityData.archived_snapshots?.closest || {};

          results.push({
            id: url,
            title: closest.title || '',
            url,
            mediaType: mimeType || 'unknown',
            year: closest.timestamp?.substring(0, 4) || timestamp.substring(0, 4) || '',
            description: closest.description || ''
          });
          
          // Rate limit between requests
          if (i < cdxData.length - 1) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
          }
        } catch (error) {
          console.error(`Error processing URL ${url}:`, error);
          continue;
        }
      }
    } catch (error) {
      console.error('Error fetching from CDX API:', error);
    }
    
    return results;
  }
}