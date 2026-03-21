// SCS-001 — YouTube Search Provider (Sprint 101, Sprint 682)
// Searches YouTube for real videos matching trending topics.
// Used by DiscoveryAgent when YOUTUBE_API_KEY is set.
//
// API: YouTube Data API v3 search endpoint (100 units/request, 10k/day free)
// Sprint 682: Added daily quota guard (80 requests/day) + search result cache
// No npm dependencies — uses native fetch()

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { TrendingTopic } from '../scs001-trend/index';

export interface YouTubeSearchResult {
  url:          string;  // https://www.youtube.com/watch?v={videoId}
  channelName:  string;
  videoTitle:   string;
  duration:     string;  // template: '30m' (real duration requires extra API call)
}

// ── Sprint 682: Quota + Cache ────────────────────────────────────

const DATA_DIR = join(__dirname, '..', '..', 'data');
const QUOTA_PATH = join(DATA_DIR, 'youtube-quota.json');
const CACHE_PATH = join(DATA_DIR, 'youtube-search-cache.json');
const MAX_DAILY_REQUESTS = 80; // Leave buffer from 100 (10k units / 100 per search)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface QuotaState {
  date: string;
  count: number;
}

interface CacheEntry {
  results: YouTubeSearchResult[];
  timestamp: number;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function getQuota(): QuotaState {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (existsSync(QUOTA_PATH)) {
      const data = JSON.parse(readFileSync(QUOTA_PATH, 'utf-8'));
      if (data.date === today) return data;
    }
  } catch { /* reset */ }
  return { date: today, count: 0 };
}

function incrementQuota(): void {
  ensureDataDir();
  const quota = getQuota();
  quota.count++;
  writeFileSync(QUOTA_PATH, JSON.stringify(quota, null, 2));
}

function isQuotaExhausted(): boolean {
  return getQuota().count >= MAX_DAILY_REQUESTS;
}

function getCachedResult(key: string): YouTubeSearchResult[] | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const cache: Record<string, CacheEntry> = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.results;
  } catch { return null; }
}

function setCachedResult(key: string, results: YouTubeSearchResult[]): void {
  ensureDataDir();
  let cache: Record<string, CacheEntry> = {};
  try {
    if (existsSync(CACHE_PATH)) {
      cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch { cache = {}; }

  // Prune expired entries
  const now = Date.now();
  for (const k of Object.keys(cache)) {
    if (now - cache[k].timestamp > CACHE_TTL_MS) delete cache[k];
  }

  cache[key] = { results, timestamp: now };
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ── Search Provider ──────────────────────────────────────────────

export class YouTubeSearchProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.YOUTUBE_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('[YouTubeSearchProvider] YOUTUBE_API_KEY not set');
    }
  }

  async searchForTopic(topic: TrendingTopic, maxResults = 3): Promise<YouTubeSearchResult[]> {
    const cacheKey = topic.topic_name.toLowerCase().trim();

    // Sprint 682: Check cache first
    const cached = getCachedResult(cacheKey);
    if (cached) {
      console.log('[YouTubeSearchProvider] Cache hit for: ' + topic.topic_name);
      return cached;
    }

    // Sprint 682: Check quota
    if (isQuotaExhausted()) {
      console.warn(`[YouTubeSearchProvider] Daily quota exhausted (${MAX_DAILY_REQUESTS} requests). Skipping: ` + topic.topic_name);
      return [];
    }

    // Build search query from topic + keywords
    const q = encodeURIComponent(topic.topic_name + ' explained analysis');
    const url = 'https://www.googleapis.com/youtube/v3/search' +
      '?q=' + q +
      '&type=video' +
      '&order=relevance' +
      '&videoCategoryId=28' +
      '&maxResults=' + maxResults +
      '&part=snippet' +
      '&key=' + this.apiKey;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      // Sprint 682: Track quota usage
      incrementQuota();

      if (!response.ok) {
        if (response.status === 403) {
          console.warn('[YouTubeSearchProvider] Quota exceeded (403). Stopping further requests.');
          // Set quota to max to prevent further requests today
          ensureDataDir();
          writeFileSync(QUOTA_PATH, JSON.stringify({ date: new Date().toISOString().slice(0, 10), count: MAX_DAILY_REQUESTS }));
        } else {
          console.warn('[YouTubeSearchProvider] Search API returned ' + response.status + ' for topic: ' + topic.topic_name);
        }
        return [];
      }

      const data = await response.json() as {
        items: Array<{
          id: { videoId: string };
          snippet: { title: string; channelTitle: string };
        }>;
      };

      const results = (data.items ?? []).map(item => ({
        url:         'https://www.youtube.com/watch?v=' + item.id.videoId,
        channelName: item.snippet.channelTitle,
        videoTitle:  item.snippet.title,
        duration:    '30m', // template — real duration requires videos.list API call (extra quota)
      }));

      // Sprint 682: Cache results
      setCachedResult(cacheKey, results);

      return results;
    } catch (err) {
      console.warn('[YouTubeSearchProvider] Search failed for "' + topic.topic_name + '": ' + (err as Error).message);
      return [];
    }
  }

  // Returns true if the API key is configured in the environment
  static isConfigured(): boolean {
    return !!(process.env.YOUTUBE_API_KEY);
  }

  // Sprint 682: Get current quota usage
  static getQuotaUsage(): { date: string; count: number; limit: number; remaining: number } {
    const quota = getQuota();
    return { ...quota, limit: MAX_DAILY_REQUESTS, remaining: Math.max(0, MAX_DAILY_REQUESTS - quota.count) };
  }
}
