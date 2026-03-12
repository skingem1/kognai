// Phase 1 — TikTok Content Agent | Archive Scraper Config

import type { ScraperConfig } from './index';

export const DEFAULT_CONFIG: ScraperConfig = {
  apiBaseUrl: 'https://archive.org',
  maxResults: 20,
  query: '',
};

// CDX API endpoints (documented at archive.org/help/wayback_api.php)
export const CDX_SEARCH_URL = 'http://web.archive.org/cdx/search/cdx';
export const WAYBACK_AVAILABILITY_URL = 'https://archive.org/wayback/available';
export const ADVANCED_SEARCH_URL = 'https://archive.org/advancedsearch.php';

export const RATE_LIMIT_MS = 1000; // 1 req/sec — respectful default
