/**
 * analytics-scraper.ts — SCS-001 Analytics Scraper (TypeScript module)
 * Sprint BUGFIX-ANALYTICS-01
 *
 * Provides:
 *   - runScraper()          — spawns analytics-browser-scrape.py via Browser Use
 *   - loadPostMetrics()     — reads logs/post-metrics.jsonl + workspace/scs001/manual-posts.jsonl
 *                             returns real KPIs keyed by kognai video_id (or by index)
 *
 * Used by:
 *   - agents/scs001-analytics/index.ts  (replaces generateMockKPIs)
 *   - scripts/scs001/auto-post-browser.ts  (optional: trigger scrape after posting)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const CWD = join(__dirname, '..', '..');
const POST_METRICS_PATH = join(CWD, 'logs', 'post-metrics.jsonl');
const MANUAL_POSTS_PATH  = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const SCRAPER_PY         = join(CWD, 'scripts', 'scs001', 'analytics-browser-scrape.py');
const VENV_PYTHON        = join(CWD, '.venv-browser-use', 'bin', 'python');

// ── Types ───────────────────────────────────────────────────────────────────

export interface ScrapedMetrics {
  scraped_at:              string;
  title:                   string;
  publish_date:            string;
  views:                   number;
  likes:                   number;
  comments:                number;
  shares:                  number;
  avg_watch_time_seconds:  number;
  completion_rate:         number;
  tiktok_id:               string | null;
  kognai_video_id:         string | null;
}

export interface ManualPostRecord {
  video_id:     string;
  views:        number;
  tiktok_url:   string | null;
  tiktok_id:    string | null;
  title:        string | null;
  posted_at:    string;
}

export interface RealKPIs {
  views:                   number;
  likes:                   number;
  comments:                number;
  shares:                  number;
  avg_watch_time_seconds:  number;
  completion_rate:         number;
  source:                  'scraped' | 'manual_record' | 'mock';
}

// ── Loaders ─────────────────────────────────────────────────────────────────

/** Load all entries from logs/post-metrics.jsonl (scraped by Browser Use). */
export function loadScrapedMetrics(): ScrapedMetrics[] {
  if (!existsSync(POST_METRICS_PATH)) return [];
  const lines = readFileSync(POST_METRICS_PATH, 'utf-8').trim().split('\n').filter(Boolean);
  const entries: ScrapedMetrics[] = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line) as ScrapedMetrics); } catch {}
  }
  // Return most recent first
  return entries.reverse();
}

/** Load all entries from workspace/scs001/manual-posts.jsonl.
 *  Entries with a tiktok_url have real views (from /record command). */
export function loadManualPosts(): ManualPostRecord[] {
  if (!existsSync(MANUAL_POSTS_PATH)) return [];
  const lines = readFileSync(MANUAL_POSTS_PATH, 'utf-8').trim().split('\n').filter(Boolean);
  const entries: ManualPostRecord[] = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      const tiktok_id = e.tiktok_url
        ? (e.tiktok_url.match(/\/video\/(\d+)/) || [])[1] ?? null
        : null;
      entries.push({
        video_id:   e.video_id || '',
        views:      Number(e.views || 0),
        tiktok_url: e.tiktok_url || null,
        tiktok_id,
        title:      e.title || null,
        posted_at:  e.posted_at || e.recorded_at || '',
      });
    } catch {}
  }
  // Return most recent first
  return entries.reverse();
}

/**
 * Look up real KPIs for a given kognai video_id.
 * Priority:
 *   1. Scraped metrics (has completion_rate + full KPIs) — match by kognai_video_id
 *   2. Manual post record (has real views) — match by video_id
 *   3. Scraped metrics by positional index (fallback when ID unknown)
 * Returns null if no real data available.
 */
export function lookupKPIs(videoId: string, fallbackIndex: number): RealKPIs | null {
  const scraped = loadScrapedMetrics();
  const manual  = loadManualPosts();

  // 1. Exact match in scraped by kognai_video_id
  const exactScraped = scraped.find(s => s.kognai_video_id === videoId);
  if (exactScraped) {
    return {
      views:                  exactScraped.views,
      likes:                  exactScraped.likes,
      comments:               exactScraped.comments,
      shares:                 exactScraped.shares,
      avg_watch_time_seconds: exactScraped.avg_watch_time_seconds,
      completion_rate:        exactScraped.completion_rate,
      source:                 'scraped',
    };
  }

  // 2. Match in manual posts
  const manualRecord = manual.find(m => m.video_id === videoId);
  if (manualRecord && manualRecord.views > 0) {
    // Try to find scraped metrics for same tiktok_id
    const matchedScrape = manualRecord.tiktok_id
      ? scraped.find(s => s.tiktok_id === manualRecord.tiktok_id)
      : null;
    return {
      views:                  manualRecord.views,
      likes:                  matchedScrape?.likes ?? 0,
      comments:               matchedScrape?.comments ?? 0,
      shares:                 matchedScrape?.shares ?? 0,
      avg_watch_time_seconds: matchedScrape?.avg_watch_time_seconds ?? 0,
      completion_rate:        matchedScrape?.completion_rate ?? 0,
      source:                 'manual_record',
    };
  }

  // 3. Positional fallback — use scraped entry at fallbackIndex
  if (scraped.length > 0) {
    const s = scraped[fallbackIndex % scraped.length];
    return {
      views:                  s.views,
      likes:                  s.likes,
      comments:               s.comments,
      shares:                 s.shares,
      avg_watch_time_seconds: s.avg_watch_time_seconds,
      completion_rate:        s.completion_rate,
      source:                 'scraped',
    };
  }

  return null;
}

/** Returns summary stats for logging. */
export function getMetricsSummary(): { scraped: number; manual_with_views: number; latest_scrape: string | null } {
  const scraped = loadScrapedMetrics();
  const manual  = loadManualPosts().filter(m => m.views > 0);
  return {
    scraped:           scraped.length,
    manual_with_views: manual.length,
    latest_scrape:     scraped[0]?.scraped_at ?? null,
  };
}

// ── Scraper Runner ───────────────────────────────────────────────────────────

/**
 * Spawn analytics-browser-scrape.py as a subprocess.
 * Non-blocking: fires and forgets (returns immediately).
 * Call this after posting a video to schedule a delayed analytics check.
 */
export function runScraperDetached(days: number = 7): void {
  const python = existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
  const env = { ...process.env };

  console.log(`[AnalyticsScraper] Spawning Browser Use analytics scrape (last ${days} days)...`);
  const child = require('child_process').spawn(python, [SCRAPER_PY, '--days', String(days)], {
    env,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  child.unref();
  console.log(`[AnalyticsScraper] Scrape process spawned (PID ${child.pid}) — will write to logs/post-metrics.jsonl`);
}

/**
 * Spawn analytics-browser-scrape.py synchronously (blocking).
 * Use for scheduled scrape jobs.
 */
export function runScraperSync(days: number = 7): boolean {
  const python = existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
  console.log(`[AnalyticsScraper] Running synchronous analytics scrape (last ${days} days)...`);
  const result = spawnSync(python, [SCRAPER_PY, '--days', String(days)], {
    env:     process.env,
    timeout: 300_000, // 5 minutes max
    stdio:   'inherit',
  });
  if (result.status === 0) {
    console.log('[AnalyticsScraper] ✅ Scrape complete');
    return true;
  }
  console.error(`[AnalyticsScraper] ❌ Scrape failed (exit ${result.status})`);
  return false;
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const days = parseInt(process.argv[2] || '7', 10);
  const summary = getMetricsSummary();
  console.log(`[AnalyticsScraper] Current metrics summary:`, summary);
  console.log(`[AnalyticsScraper] Running scrape for last ${days} days...`);
  const ok = runScraperSync(days);
  process.exit(ok ? 0 : 1);
}
