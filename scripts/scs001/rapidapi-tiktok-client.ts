/**
 * RapidAPI TikTok Video Downloader Client
 *
 * Downloads TikTok videos without watermark using RapidAPI.
 * API: "Tiktok video no watermark" by yi005
 * Endpoint: https://tiktok-video-no-watermark2.p.rapidapi.com
 *
 * Free tier: 500 requests/month
 * Requires: RAPIDAPI_KEY env var
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";

// ── Types ──────────────────────────────────────────────

export interface TikTokVideoInfo {
  video_id: string;
  url: string;           // Original TikTok URL
  download_url: string;  // No-watermark MP4 URL
  author: string;
  description: string;
  duration: number;       // seconds
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  music_title?: string;
  cover_url?: string;
}

export interface DownloadResult {
  video_id: string;
  local_path: string;
  file_size_bytes: number;
  source_url: string;
  author: string;
  description: string;
  engagement: {
    plays: number;
    likes: number;
    comments: number;
    shares: number;
  };
}

/** A video result from keyword search or trending feed */
export interface TikTokSearchResult {
  url: string;
  video_id: string;
  author: string;
  description: string;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  duration: number;
  download_url?: string;
  cover_url?: string;
}

// ── Config ─────────────────────────────────────────────

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? "";
const RAPIDAPI_HOST = "tiktok-video-no-watermark2.p.rapidapi.com";
const API_BASE = `https://${RAPIDAPI_HOST}`;

const DEFAULT_CLIPS_DIR = process.env.SCS_CLIPS_DIR ?? join(__dirname, "..", "..", "clips");

// ── API Functions ──────────────────────────────────────

/**
 * Get video info + no-watermark download URL from a TikTok URL.
 */
export async function getVideoInfo(tiktokUrl: string): Promise<TikTokVideoInfo> {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not set — cannot download TikTok videos");
  }

  const res = await fetch(`${API_BASE}/`, {
    method: "GET",
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
    // The API uses query params
  });

  // Try the POST endpoint which is more reliable
  const postRes = await fetch(`${API_BASE}/`, {
    method: "POST",
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `url=${encodeURIComponent(tiktokUrl)}`,
  });

  if (!postRes.ok) {
    const errText = await postRes.text();
    throw new Error(`RapidAPI TikTok ${postRes.status}: ${errText}`);
  }

  const data: any = await postRes.json();

  // Parse response — structure varies by API version
  const videoData = data?.data ?? data;
  if (!videoData?.play) {
    throw new Error("No download URL in API response");
  }

  const videoId = createHash("sha256")
    .update(tiktokUrl)
    .digest("hex")
    .slice(0, 12);

  return {
    video_id: `tiktok-${videoId}`,
    url: tiktokUrl,
    download_url: videoData.play,           // No-watermark MP4
    author: videoData.author?.nickname ?? videoData.author?.unique_id ?? "unknown",
    description: videoData.title ?? "",
    duration: videoData.duration ?? 0,
    play_count: videoData.play_count ?? 0,
    like_count: videoData.digg_count ?? 0,
    comment_count: videoData.comment_count ?? 0,
    share_count: videoData.share_count ?? 0,
    music_title: videoData.music_info?.title,
    cover_url: videoData.cover ?? videoData.origin_cover,
  };
}

/**
 * Download the no-watermark video to local clips directory.
 */
export async function downloadVideo(
  info: TikTokVideoInfo,
  outDir: string = DEFAULT_CLIPS_DIR
): Promise<DownloadResult> {
  mkdirSync(outDir, { recursive: true });

  const filename = `${info.video_id}.mp4`;
  const localPath = join(outDir, filename);

  // Skip if already downloaded
  if (existsSync(localPath)) {
    console.log(`  [TikTokDownloader] Already cached: ${filename}`);
    const { statSync } = require("fs");
    return {
      video_id: info.video_id,
      local_path: localPath,
      file_size_bytes: statSync(localPath).size,
      source_url: info.url,
      author: info.author,
      description: info.description,
      engagement: {
        plays: info.play_count,
        likes: info.like_count,
        comments: info.comment_count,
        shares: info.share_count,
      },
    };
  }

  console.log(`  [TikTokDownloader] Downloading ${info.video_id}...`);

  const res = await fetch(info.download_url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "Referer": "https://www.tiktok.com/",
    },
  });

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(localPath, buffer);

  console.log(`  [TikTokDownloader] Saved ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

  return {
    video_id: info.video_id,
    local_path: localPath,
    file_size_bytes: buffer.length,
    source_url: info.url,
    author: info.author,
    description: info.description,
    engagement: {
      plays: info.play_count,
      likes: info.like_count,
      comments: info.comment_count,
      shares: info.share_count,
    },
  };
}

/**
 * Full pipeline: get info + download in one call.
 */
export async function fetchAndDownload(
  tiktokUrl: string,
  outDir?: string
): Promise<DownloadResult> {
  const info = await getVideoInfo(tiktokUrl);
  return downloadVideo(info, outDir);
}

// ── Search & Discovery ────────────────────────────────

/**
 * Search TikTok videos by keyword using the yi005 API.
 * Uses the /feed/search endpoint. Returns up to `count` results.
 *
 * Each API call = 1 request towards the 500/month free tier.
 */
export async function searchByKeyword(
  keywords: string,
  count: number = 10,
  cursor: number = 0,
  region: string = "us",
): Promise<TikTokSearchResult[]> {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not set — cannot search TikTok");
  }

  const url = new URL(`${API_BASE}/feed/search`);
  url.searchParams.set("keywords", keywords);
  url.searchParams.set("count", String(Math.min(count, 30)));
  url.searchParams.set("cursor", String(cursor));
  url.searchParams.set("region", region);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`RapidAPI search ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  const videos = data?.data?.videos ?? data?.data ?? [];

  if (!Array.isArray(videos)) return [];

  return videos.map((v: any) => parseSearchResult(v)).filter(Boolean) as TikTokSearchResult[];
}

/**
 * Get trending/popular TikTok videos for a region.
 * Uses the /feed/list endpoint.
 */
export async function getTrendingFeed(
  region: string = "us",
  count: number = 10,
): Promise<TikTokSearchResult[]> {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not set — cannot fetch trending feed");
  }

  const url = new URL(`${API_BASE}/feed/list`);
  url.searchParams.set("region", region);
  url.searchParams.set("count", String(Math.min(count, 30)));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`RapidAPI trending ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  const videos = data?.data?.videos ?? data?.data ?? [];

  if (!Array.isArray(videos)) return [];

  return videos.map((v: any) => parseSearchResult(v)).filter(Boolean) as TikTokSearchResult[];
}

/** Normalize API response into TikTokSearchResult */
function parseSearchResult(v: any): TikTokSearchResult | null {
  if (!v) return null;

  // The yi005 API returns various field names depending on the endpoint
  const videoId =
    v.video_id ?? v.aweme_id ?? v.id ?? "";
  const authorName =
    v.author?.nickname ?? v.author?.unique_id ?? v.author ?? "unknown";

  // Build the TikTok URL from video ID if not provided
  const videoUrl =
    v.play_addr?.url_list?.[0]
      ? `https://www.tiktok.com/@${authorName}/video/${videoId}`
      : v.share_url ?? v.url ?? `https://www.tiktok.com/@${authorName}/video/${videoId}`;

  return {
    url: videoUrl,
    video_id: String(videoId),
    author: String(authorName),
    description: v.title ?? v.desc ?? v.description ?? "",
    play_count: v.play_count ?? v.statistics?.play_count ?? 0,
    like_count: v.digg_count ?? v.statistics?.digg_count ?? 0,
    comment_count: v.comment_count ?? v.statistics?.comment_count ?? 0,
    share_count: v.share_count ?? v.statistics?.share_count ?? 0,
    duration: v.duration ?? 0,
    download_url: v.play ?? v.play_addr?.url_list?.[0],
    cover_url: v.cover ?? v.origin_cover ?? v.cover_data?.cover?.url_list?.[0],
  };
}

/**
 * Check if the RapidAPI TikTok downloader is configured.
 */
export function isConfigured(): boolean {
  return RAPIDAPI_KEY.length > 0;
}
