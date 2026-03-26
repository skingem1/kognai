/**
 * SCS-001 — Viral TikTok Downloader Agent (Stage 2.5)
 *
 * AUTONOMOUS discovery of trending TikTok clips based on topics from TrendAgent.
 * Uses RapidAPI "TikTok video no watermark" (yi005) to:
 *   1. Search TikTok by keyword using TrendAgent topic names + keyword clusters
 *   2. Filter by engagement threshold (minimum plays)
 *   3. Download no-watermark MP4s
 *   4. Convert to DiscoveryOutput format for the existing pipeline
 *
 * Two discovery modes:
 *   - Topic search: searches keywords from TrendAgent topics (primary)
 *   - Manual URLs: reads from viral-tiktok-urls.json (fallback / human override)
 *
 * Requires: RAPIDAPI_KEY env var
 * Enable: VIRAL_TIKTOK_ENABLED=1 (default: disabled)
 */

import { randomUUID, createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { TrendingTopicBatch, TrendingTopic } from "../scs001-trend/index";
import type { DiscoveryOutput, DiscoveryTimestamp } from "../scs001-discovery/index";
import {
  getVideoInfo,
  downloadVideo,
  searchByKeyword,
  getTrendingFeed,
  isConfigured as isRapidAPIConfigured,
  type TikTokVideoInfo,
  type TikTokSearchResult,
  type DownloadResult,
} from "../../scripts/scs001/rapidapi-tiktok-client";

// ── Config ─────────────────────────────────────────────

const VIRAL_TIKTOK_ENABLED =
  process.env.VIRAL_TIKTOK_ENABLED === "1" || process.env.VIRAL_TIKTOK_ENABLED === "true";

/** Max videos to download per run (caps API usage — free tier: 500/month) */
const MAX_DOWNLOADS_PER_RUN = 5;

/** Max API search calls per run (1 per topic, capped to save quota) */
const MAX_SEARCHES_PER_RUN = 3;

/** Minimum play count to qualify as "viral" */
const MIN_ENGAGEMENT_THRESHOLD = 10_000;

/** Results per search query */
const SEARCH_RESULTS_PER_QUERY = 10;

/**
 * Cooldown between runs in hours. Pipeline runs 4x/day but viral discovery
 * only fires every COOLDOWN_HOURS to conserve RapidAPI quota (500/month free).
 * Set to 12 = 2x/day. Set to 24 = 1x/day.
 */
const COOLDOWN_HOURS = 12;

const CLIPS_DIR = process.env.SCS_CLIPS_DIR ?? join(__dirname, "..", "..", "clips");
const VIRAL_URLS_PATH = join(__dirname, "..", "..", "workspace", "scs001", "viral-tiktok-urls.json");
const LAST_RUN_PATH = join(__dirname, "..", "..", "workspace", "scs001", "viral-last-run.json");
// Sprint 1371: persist RapidAPI subscription-lapse state so we skip searches for 24h
const LAPSE_PATH = join(__dirname, "..", "..", "data", "rapidapi-lapse.json");
const LAPSE_TTL_H = 24;

// ── Dedup Ledger ─────────────────────────────────────────

/** Track which URLs we've already seen to avoid re-processing */
function loadSeenUrls(): Set<string> {
  if (!existsSync(VIRAL_URLS_PATH)) return new Set();
  try {
    const data = JSON.parse(readFileSync(VIRAL_URLS_PATH, "utf8"));
    const urls: ViralUrlEntry[] = Array.isArray(data.urls) ? data.urls : [];
    return new Set(urls.map((u) => u.url));
  } catch {
    return new Set();
  }
}

// ── Viral URL Persistence ────────────────────────────────

interface ViralUrlEntry {
  url: string;
  topic: string;
  added_at: string;
  processed: boolean;
  source: "auto-discovery" | "manual";
  play_count?: number;
  author?: string;
}

function loadViralUrls(): ViralUrlEntry[] {
  if (!existsSync(VIRAL_URLS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(VIRAL_URLS_PATH, "utf8"));
    return Array.isArray(data.urls) ? data.urls : [];
  } catch {
    return [];
  }
}

function saveViralUrls(urls: ViralUrlEntry[]): void {
  mkdirSync(join(VIRAL_URLS_PATH, ".."), { recursive: true });
  writeFileSync(
    VIRAL_URLS_PATH,
    JSON.stringify({ urls, updated_at: new Date().toISOString() }, null, 2)
  );
}

// ── Agent ──────────────────────────────────────────────

export class ViralTikTokDownloader {
  /**
   * Autonomously discover, download, and convert viral TikTok clips.
   *
   * Flow:
   *   1. Extract keywords from TrendAgent topics
   *   2. Search TikTok for each keyword via RapidAPI
   *   3. Filter by engagement + dedup against seen URLs
   *   4. Download top N clips (no watermark)
   *   5. Convert to DiscoveryOutput for pipeline
   *   6. Persist discovered URLs to viral-tiktok-urls.json
   */
  async run(trendBatch?: TrendingTopicBatch): Promise<DiscoveryOutput[]> {
    if (!VIRAL_TIKTOK_ENABLED) {
      console.log("[ViralDownloader] Disabled (set VIRAL_TIKTOK_ENABLED=1 to enable)");
      return [];
    }

    if (!isRapidAPIConfigured()) {
      console.log("[ViralDownloader] RAPIDAPI_KEY not set — skipping TikTok downloads");
      return [];
    }

    // Sprint 1371: Skip searches if subscription is known-lapsed (24h cache)
    if (isSubscriptionLapsed()) {
      return [];
    }

    // Cooldown gate: skip if last run was less than COOLDOWN_HOURS ago
    if (isCooldownActive()) {
      console.log(`[ViralDownloader] Cooldown active (runs every ${COOLDOWN_HOURS}h) — skipping`);
      return [];
    }

    console.log("[ViralDownloader] Starting autonomous viral TikTok discovery...");

    const allViralUrls = loadViralUrls();
    const seenUrls = new Set(allViralUrls.map((u) => u.url));

    // ── Step 1: Autonomous discovery from TrendAgent topics ──
    const searchResults = await this.discoverFromTopics(trendBatch, seenUrls);

    // ── Step 2: Also process any manually curated URLs ──
    const manualUnprocessed = allViralUrls.filter((u) => !u.processed && u.source === "manual");

    // Merge: auto-discovered + manual (auto-discovered first)
    const candidates: ViralUrlEntry[] = [
      ...searchResults,
      ...manualUnprocessed,
    ];

    if (candidates.length === 0) {
      console.log("[ViralDownloader] No candidates found — skipping");
      return [];
    }

    // ── Step 3: Download & convert top N ──
    const toProcess = candidates.slice(0, MAX_DOWNLOADS_PER_RUN);
    console.log(
      `[ViralDownloader] Processing ${toProcess.length} candidates ` +
        `(${searchResults.length} auto-discovered, ${manualUnprocessed.length} manual)`
    );

    const discoveries: DiscoveryOutput[] = [];
    let downloaded = 0;

    for (const entry of toProcess) {
      try {
        // Get full video info (includes no-watermark download URL)
        const info = await getVideoInfo(entry.url);

        // Check minimum engagement
        if (info.play_count < MIN_ENGAGEMENT_THRESHOLD && info.play_count > 0) {
          console.log(
            `  [ViralDownloader] Skipping ${info.video_id}: ${info.play_count} plays < ${MIN_ENGAGEMENT_THRESHOLD} threshold`
          );
          entry.processed = true;
          continue;
        }

        // Download no-watermark video
        const result = await downloadVideo(info, CLIPS_DIR);
        downloaded++;

        // Convert to DiscoveryOutput format
        const topicTags = entry.topic
          .split(/[\s,]+/)
          .filter((t) => t.length > 1)
          .slice(0, 5);

        const discovery: DiscoveryOutput = {
          discovery_id: `disc-viral-${info.video_id}`,
          url: entry.url,
          timestamps: buildTimestamps(info),
          speaker: info.author,
          topic_tags: topicTags,
          source_score: calculateViralScore(info),
          source_topic_id: `viral-${createHash("sha256").update(entry.topic).digest("hex").slice(0, 8)}`,
        };

        discoveries.push(discovery);
        entry.processed = true;
        entry.play_count = info.play_count;
        entry.author = info.author;

        console.log(
          `  [ViralDownloader] ✓ ${info.video_id} by @${info.author} — ` +
            `${formatCount(info.play_count)} plays, ${formatCount(info.like_count)} likes`
        );

        // Rate limit: 1 second between requests
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err: any) {
        console.warn(`  [ViralDownloader] Failed: ${entry.url} — ${err.message}`);
        // Don't mark as processed so it retries next run
      }
    }

    // ── Step 4: Persist all URLs (existing + newly discovered) ──
    const mergedUrls = mergeUrls(allViralUrls, searchResults);
    saveViralUrls(mergedUrls);

    // Save last-run timestamp for cooldown gate
    saveLastRunTimestamp();

    console.log(
      `[ViralDownloader] Done: ${downloaded} downloaded, ${discoveries.length} discovery outputs, ` +
        `${searchResults.length} new URLs discovered. Next run in ${COOLDOWN_HOURS}h.`
    );
    return discoveries;
  }

  /**
   * Search TikTok for trending videos matching TrendAgent topics.
   * Uses keyword_cluster from each topic for better search results.
   */
  private async discoverFromTopics(
    trendBatch: TrendingTopicBatch | undefined,
    seenUrls: Set<string>,
  ): Promise<ViralUrlEntry[]> {
    if (!trendBatch?.topics?.length) {
      console.log("[ViralDownloader] No TrendAgent topics — trying trending feed instead");
      return this.discoverFromTrendingFeed(seenUrls);
    }

    const discovered: ViralUrlEntry[] = [];
    const now = new Date().toISOString();

    // Sort topics by confidence, take top N
    const topTopics = [...trendBatch.topics]
      .sort((a, b) => b.confidence_score - a.confidence_score)
      .slice(0, MAX_SEARCHES_PER_RUN);

    for (const topic of topTopics) {
      try {
        // Build search query from topic name + keywords
        const searchQuery = buildSearchQuery(topic);
        console.log(`  [ViralDownloader] Searching TikTok: "${searchQuery}" (topic: ${topic.topic_name})`);

        const results = await searchByKeyword(searchQuery, SEARCH_RESULTS_PER_QUERY);

        // Filter: engagement threshold + dedup
        const qualified = results.filter(
          (r) =>
            r.play_count >= MIN_ENGAGEMENT_THRESHOLD &&
            !seenUrls.has(r.url) &&
            r.duration > 5 && // Skip ultra-short clips
            r.duration <= 180 // Skip videos over 3 min
        );

        for (const r of qualified) {
          const entry: ViralUrlEntry = {
            url: r.url,
            topic: topic.topic_name,
            added_at: now,
            processed: false,
            source: "auto-discovery",
            play_count: r.play_count,
            author: r.author,
          };
          discovered.push(entry);
          seenUrls.add(r.url); // Prevent duplicates across topics
        }

        console.log(
          `  [ViralDownloader] Found ${results.length} results, ${qualified.length} qualified for "${searchQuery}"`
        );

        // Rate limit between search calls
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err: any) {
        console.warn(`  [ViralDownloader] Search failed for "${topic.topic_name}": ${err.message}`);
        // Sprint 1323: abort search loop on 403 (subscription lapsed) to avoid 25-45s of wasted retries
        if (err.message?.includes('403') || err.message?.toLowerCase().includes('not subscribed')) {
          console.warn('[ViralDownloader] RapidAPI subscription lapsed — aborting remaining searches');
          markSubscriptionLapsed(); // Sprint 1371: persist so next 24h of runs skip immediately
          break;
        }
      }
    }

    // Sort by play count (most viral first)
    discovered.sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0));

    console.log(`[ViralDownloader] Auto-discovered ${discovered.length} viral TikTok URLs from ${topTopics.length} topics`);
    return discovered;
  }

  /**
   * Fallback: get trending feed when no TrendAgent topics are available.
   */
  private async discoverFromTrendingFeed(seenUrls: Set<string>): Promise<ViralUrlEntry[]> {
    try {
      console.log("[ViralDownloader] Fetching trending TikTok feed (US)...");
      const results = await getTrendingFeed("us", 20);
      const now = new Date().toISOString();

      const qualified = results
        .filter(
          (r) =>
            r.play_count >= MIN_ENGAGEMENT_THRESHOLD &&
            !seenUrls.has(r.url) &&
            r.duration > 5 &&
            r.duration <= 180
        )
        .map((r): ViralUrlEntry => ({
          url: r.url,
          topic: "trending",
          added_at: now,
          processed: false,
          source: "auto-discovery",
          play_count: r.play_count,
          author: r.author,
        }));

      console.log(`[ViralDownloader] Trending feed: ${results.length} total, ${qualified.length} qualified`);
      return qualified;
    } catch (err: any) {
      console.warn(`[ViralDownloader] Trending feed failed: ${err.message}`);
      return [];
    }
  }
}

// ── Helpers ────────────────────────────────────────────

/**
 * Build a TikTok search query from a TrendAgent topic.
 * Uses topic_name + first 2 keywords from keyword_cluster for relevance.
 */
function buildSearchQuery(topic: TrendingTopic): string {
  const parts: string[] = [topic.topic_name];

  // Add keywords from cluster for better search accuracy
  if (topic.keyword_cluster?.length) {
    const extraKeywords = topic.keyword_cluster
      .filter((k) => k.toLowerCase() !== topic.topic_name.toLowerCase())
      .slice(0, 2);
    parts.push(...extraKeywords);
  }

  return parts.join(" ");
}

function buildTimestamps(info: TikTokVideoInfo): DiscoveryTimestamp[] {
  const duration = info.duration || 30;
  return [
    {
      start_seconds: 0,
      end_seconds: Math.min(15, duration),
      reason: `Viral TikTok hook by @${info.author} — ${formatCount(info.play_count)} plays`,
    },
    {
      start_seconds: 0,
      end_seconds: Math.min(duration, 60),
      reason: `Full viral clip — ${formatCount(info.like_count)} likes, ${formatCount(info.share_count)} shares`,
    },
  ];
}

function calculateViralScore(info: TikTokVideoInfo): number {
  const total = info.play_count + info.like_count * 10 + info.share_count * 20;
  if (total >= 10_000_000) return 5;
  if (total >= 1_000_000) return 5;
  if (total >= 100_000) return 4;
  if (total >= 10_000) return 3;
  return 2;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Cooldown Gate ──────────────────────────────────────

// Sprint 1371: RapidAPI subscription-lapse cache helpers
/** Returns true if RapidAPI subscription is known-lapsed (403 seen within LAPSE_TTL_H hours) */
function isSubscriptionLapsed(): boolean {
  if (!existsSync(LAPSE_PATH)) return false;
  try {
    const d = JSON.parse(readFileSync(LAPSE_PATH, "utf8"));
    const elapsed = Date.now() - new Date(d.lapsed_at).getTime();
    const ttlMs = LAPSE_TTL_H * 3600_000;
    if (elapsed < ttlMs) {
      const hoursLeft = ((ttlMs - elapsed) / 3600_000).toFixed(1);
      console.log(`[ViralDownloader] RapidAPI subscription lapse cached — skipping searches (clears in ${hoursLeft}h)`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Persist the subscription-lapse state to disk so future runs skip immediately */
function markSubscriptionLapsed(): void {
  try {
    mkdirSync(join(LAPSE_PATH, ".."), { recursive: true });
    writeFileSync(LAPSE_PATH, JSON.stringify({
      lapsed_at: new Date().toISOString(),
      reason: "RapidAPI 403 — not subscribed",
    }, null, 2));
    console.warn("[ViralDownloader] Subscription lapse persisted — searches suppressed for 24h");
  } catch { /* non-fatal */ }
}

/** Check if the cooldown period is still active (last run too recent) */
function isCooldownActive(): boolean {
  if (!existsSync(LAST_RUN_PATH)) return false;
  try {
    const data = JSON.parse(readFileSync(LAST_RUN_PATH, "utf8"));
    const lastRun = new Date(data.last_run_at).getTime();
    const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;
    const elapsed = Date.now() - lastRun;
    if (elapsed < cooldownMs) {
      const hoursLeft = ((cooldownMs - elapsed) / 3600000).toFixed(1);
      console.log(`  [ViralDownloader] Last run ${((Date.now() - lastRun) / 3600000).toFixed(1)}h ago, next in ${hoursLeft}h`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Save current timestamp as last run time */
function saveLastRunTimestamp(): void {
  mkdirSync(join(LAST_RUN_PATH, ".."), { recursive: true });
  writeFileSync(
    LAST_RUN_PATH,
    JSON.stringify({ last_run_at: new Date().toISOString() }, null, 2)
  );
}

/** Merge newly discovered URLs into the existing list (dedup by URL) */
function mergeUrls(existing: ViralUrlEntry[], discovered: ViralUrlEntry[]): ViralUrlEntry[] {
  const byUrl = new Map<string, ViralUrlEntry>();
  for (const e of existing) byUrl.set(e.url, e);
  for (const d of discovered) {
    if (!byUrl.has(d.url)) byUrl.set(d.url, d);
  }
  return Array.from(byUrl.values());
}

/**
 * Check if viral TikTok downloading is available.
 */
export function isViralDownloaderAvailable(): { enabled: boolean; reason: string } {
  if (!VIRAL_TIKTOK_ENABLED) return { enabled: false, reason: "VIRAL_TIKTOK_ENABLED not set" };
  if (!isRapidAPIConfigured()) return { enabled: false, reason: "RAPIDAPI_KEY not set" };
  return { enabled: true, reason: "Ready" };
}
