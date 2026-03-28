// SCS-001 — TrendAgent Live Feed Provider (Sprint 101)
// Fetches real trending topics from Google Trends RSS and YouTube Trending API.
// Falls back to mock Oracle-6 feed when both sources fail.
//
// Sources:
//   1. Google Trends RSS: https://trends.google.com/trending/rss?geo=US (no API key)
//   2. YouTube Trending: YouTube Data API v3 videoCategoryId=28 (YOUTUBE_API_KEY required)

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { VoxightFeedProvider } from './voxight-feed';

interface Oracle6Signal {
  signal_id: string;
  topic: string;
  confidence: number;
  scs_relevant: boolean;
  domain_tag: string;
  keyword_cluster?: string[];
  top_speakers?: Array<{ name: string; handle?: string; authority_score?: number }>;
  relevant_channels?: Array<{ platform: string; channel_id: string; channel_name?: string }>;
  mainstream_eta_days?: number;
  provenance_source?: string;
}

interface Oracle6Feed {
  feed_id: string;
  generated_at: string;
  feed_status: 'mock' | 'live' | 'degraded';
  signals: Oracle6Signal[];
}

// Keywords that indicate SCS-relevant content (AI, tech, crypto, startups)
const SCS_KEYWORDS = [
  'ai', 'ml', 'machine learning', 'llm', 'gpt', 'claude', 'openai', 'anthropic',
  'chatgpt', 'gemini', 'deepmind', 'nvidia', 'neural', 'model', 'agent',
  'bitcoin', 'crypto', 'blockchain', 'ethereum', 'defi', 'nft', 'web3',
  'startup', 'founder', 'vc', 'funding', 'valuation', 'ipo', 'saas',
  'automation', 'robotics', 'software', 'tech', 'code', 'programming',
  'mcp', 'x402', 'protocol', 'infrastructure', 'platform',
];

function isScsRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return SCS_KEYWORDS.some(k => lower.includes(k));
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,\-–—\/()]+/)
    .filter(w => w.length > 3)
    .slice(0, 8);
}

// Parse Google Trends RSS (XML) with regex — no external XML parser needed
async function fetchGoogleTrends(): Promise<Oracle6Signal[]> {
  const url = 'https://trends.google.com/trending/rss?geo=US';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Kognai-TrendAgent/1.0' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Google Trends returned ${response.status}`);
  }

  const xml = await response.text();

  // Extract <item><title>...</title></item> blocks
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  const signals: Oracle6Signal[] = [];
  let rank = 0;

  for (const match of Array.from(itemMatches)) {
    const item = match[1];
    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                       item.match(/<title>(.*?)<\/title>/);
    if (!titleMatch) continue;

    const topic = titleMatch[1].trim();
    rank++;

    // Confidence: top 5 = 90+, 6-10 = 80+, 11-20 = 70+
    const confidence = rank <= 5 ? 90 + (5 - rank) : rank <= 10 ? 82 - (rank - 5) : 72 - (rank - 10);

    signals.push({
      signal_id: 'gtren-' + randomUUID().slice(0, 8),
      topic,
      confidence: Math.max(60, Math.min(99, confidence)),
      scs_relevant: isScsRelevant(topic),
      domain_tag: 'google_trends',
      keyword_cluster: extractKeywords(topic),
      provenance_source: 'google_trends',
      mainstream_eta_days: Math.floor(rank * 2),
    });

    if (rank >= 20) break; // limit to top 20
  }

  console.log('[LiveFeedProvider] Google Trends: ' + signals.length + ' topics fetched');
  return signals;
}

// Fetch YouTube Trending (Science & Technology category = 28)
async function fetchYouTubeTrending(apiKey: string): Promise<Oracle6Signal[]> {
  const url = 'https://www.googleapis.com/youtube/v3/videos' +
    '?chart=mostPopular&videoCategoryId=28&regionCode=US&maxResults=20' +
    '&part=snippet,statistics&key=' + apiKey;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`YouTube API returned ${response.status}: ${body.substring(0, 100)}`);
  }

  const data = await response.json() as {
    items: Array<{
      id: string;
      snippet: { title: string; channelTitle: string; description: string };
      statistics: { viewCount?: string };
    }>;
  };

  const signals: Oracle6Signal[] = (data.items ?? []).map((item, idx) => {
    const viewCount = parseInt(item.statistics?.viewCount ?? '0', 10);
    const confidence = idx < 5 ? 88 : idx < 10 ? 78 : 68;

    return {
      signal_id: 'ytren-' + randomUUID().slice(0, 8),
      topic: item.snippet.title,
      confidence,
      scs_relevant: isScsRelevant(item.snippet.title + ' ' + item.snippet.description),
      domain_tag: 'youtube_trending',
      keyword_cluster: extractKeywords(item.snippet.title),
      top_speakers: [{ name: item.snippet.channelTitle, authority_score: Math.min(95, 50 + Math.floor(viewCount / 100000)) }],
      relevant_channels: [{ platform: 'youtube', channel_id: item.id, channel_name: item.snippet.channelTitle }],
      provenance_source: 'youtube_trending',
      mainstream_eta_days: 3 + idx,
    };
  });

  console.log('[LiveFeedProvider] YouTube Trending: ' + signals.length + ' videos fetched');
  return signals;
}

const ROOT = join(__dirname, '..', '..');
const MOCK_FEED_PATH = join(ROOT, 'contracts', 'scs-001', 'mock-oracle6-feed.json');

export class LiveFeedProvider {
  async fetch(): Promise<Oracle6Feed> {
    const apiKey = process.env.YOUTUBE_API_KEY ?? '';
    const results: Oracle6Signal[] = [];
    let anySuccess = false;
    let errorLog = '';

    // Source 1: Google Trends RSS
    try {
      const trends = await fetchGoogleTrends();
      results.push(...trends);
      anySuccess = true;
    } catch (err) {
      errorLog += 'Google Trends: ' + (err as Error).message + '. ';
      console.warn('[LiveFeedProvider] Google Trends failed: ' + (err as Error).message);
    }

    // Source 2: YouTube Trending API (only if key is set)
    if (apiKey) {
      try {
        const yt = await fetchYouTubeTrending(apiKey);
        results.push(...yt);
        anySuccess = true;
      } catch (err) {
        errorLog += 'YouTube: ' + (err as Error).message + '. ';
        console.warn('[LiveFeedProvider] YouTube Trending failed: ' + (err as Error).message);
      }
    } else {
      console.log('[LiveFeedProvider] YOUTUBE_API_KEY not set — skipping YouTube Trending');
    }

    // Dedup by topic name (case-insensitive)
    const seen = new Set<string>();
    const deduped = results.filter(s => {
      const key = s.topic.toLowerCase().substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // If no results, fall back to mock feed
    if (!anySuccess || deduped.length === 0) {
      console.warn('[LiveFeedProvider] All sources failed — falling back to mock feed. Errors: ' + errorLog);
      return this.loadMockFeed('degraded');
    }

    console.log('[LiveFeedProvider] Live feed: ' + deduped.length + ' unique signals (' +
      deduped.filter(s => s.scs_relevant).length + ' SCS-relevant)');

    // Merge Voxight real signals (VOXIGHT-BLOCK-B-01)
    try {
      const voxight = new VoxightFeedProvider();
      const voxightFeed = await voxight.fetch();
      if (voxightFeed.signals.length > 0) {
        deduped.push(...voxightFeed.signals);
        console.log('[LiveFeed] Merged ' + voxightFeed.signals.length + ' Voxight signals');
      }
    } catch (e: any) {
      console.warn('[LiveFeed] Voxight merge failed: ' + e.message);
    }

    return {
      feed_id: 'live-' + new Date().toISOString().slice(0, 10) + '-' + randomUUID().slice(0, 6),
      generated_at: new Date().toISOString(),
      feed_status: 'live',
      signals: deduped,
    };
  }

  private loadMockFeed(status: 'mock' | 'degraded' = 'mock'): Oracle6Feed {
    if (!existsSync(MOCK_FEED_PATH)) {
      return { feed_id: 'fallback', generated_at: new Date().toISOString(), feed_status: 'degraded', signals: [] };
    }
    const raw = readFileSync(MOCK_FEED_PATH, 'utf8');
    const feed = JSON.parse(raw) as Oracle6Feed;
    feed.feed_status = status;
    return feed;
  }
}
