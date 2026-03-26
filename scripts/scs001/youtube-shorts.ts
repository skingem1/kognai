/**
 * SCS-001 YouTube Shorts Upload Client
 *
 * Uses YouTube Data API v3 for automated Shorts upload.
 * Videos under 60s + vertical (9:16) are automatically classified as Shorts.
 *
 * Requirements:
 *   - YOUTUBE_API_KEY (read-only, for checking status)
 *   - YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN (for upload)
 *   - Videos must be < 60 seconds, 1080x1920 (9:16 vertical)
 *
 * Usage:
 *   const { uploadShort, checkUploadReadiness } = require('./youtube-shorts');
 *   await uploadShort({ videoPath, title, description, tags });
 *
 * Dry-run: set YOUTUBE_DRY_RUN=1 to skip actual upload
 */

import { existsSync, readFileSync, writeFileSync, createReadStream, statSync } from "fs";
import { join } from "path";

// ── Types ─────────────────────────────────────────────

export interface UploadOptions {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string; // Default: 28 (Science & Technology)
  privacyStatus?: "public" | "unlisted" | "private";
}

export interface UploadResult {
  success: boolean;
  video_id?: string;
  url?: string;
  error?: string;
  dry_run: boolean;
  upload_time_ms: number;
}

export interface ReadinessCheck {
  api_key_set: boolean;
  client_id_set: boolean;
  client_secret_set: boolean;
  refresh_token_set: boolean;
  can_upload: boolean;
  can_read: boolean;
  issues: string[];
}

// ── Config ─────────────────────────────────────────────

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? "";
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID ?? "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET ?? "";
const YOUTUBE_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN ?? "";
const YOUTUBE_DRY_RUN = process.env.YOUTUBE_DRY_RUN === "1";

const ROOT = join(__dirname, "..", "..");
const UPLOAD_LOG = join(ROOT, "workspace", "scs001", "youtube-uploads.jsonl");
// Sprint TICKET-010-YT-01: quota tracking — stays under 10K units/day (upload = 1,600 units each)
const QUOTA_PATH = join(ROOT, "data", "youtube-quota.json");
const UPLOAD_QUOTA_COST = 1600; // YouTube Data API v3 video insert = 1,600 units

function updateQuotaTracker(units: number = UPLOAD_QUOTA_COST): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let quota: { date: string; count: number; units_used?: number } = { date: today, count: 0, units_used: 0 };
    if (existsSync(QUOTA_PATH)) {
      const raw = readFileSync(QUOTA_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.date === today) quota = parsed;
      // else: reset for new day
    }
    quota.date = today;
    quota.count = (quota.count || 0) + 1;
    quota.units_used = (quota.units_used || 0) + units;
    writeFileSync(QUOTA_PATH, JSON.stringify(quota, null, 2));
  } catch { /* non-blocking */ }
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

// Default tags for AI/tech content
const DEFAULT_TAGS = ["shorts", "ai", "tech", "viral", "trending"];

// ── OAuth2 Token Refresh ──────────────────────────────

async function getAccessToken(): Promise<string> {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    throw new Error("YouTube OAuth2 credentials not configured");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth2 token refresh failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Upload ────────────────────────────────────────────

/**
 * Upload a video to YouTube Shorts.
 * Uses resumable upload protocol for reliability.
 */
export async function uploadShort(opts: UploadOptions): Promise<UploadResult> {
  const start = Date.now();
  const dryRun = YOUTUBE_DRY_RUN;

  // Validate video file
  if (!existsSync(opts.videoPath)) {
    return { success: false, error: `Video not found: ${opts.videoPath}`, dry_run: dryRun, upload_time_ms: 0 };
  }

  const fileSize = statSync(opts.videoPath).size;
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);

  if (dryRun) {
    console.log(`[YouTube] DRY RUN — would upload:`);
    console.log(`  File: ${opts.videoPath} (${fileSizeMB} MB)`);
    console.log(`  Title: ${opts.title}`);
    console.log(`  Tags: ${opts.tags.join(", ")}`);
    console.log(`  Privacy: ${opts.privacyStatus ?? "public"}`);

    const result: UploadResult = {
      success: true,
      video_id: "DRY_RUN_" + Date.now(),
      url: "https://youtube.com/shorts/DRY_RUN",
      dry_run: true,
      upload_time_ms: Date.now() - start,
    };

    logUpload(result, opts);
    return result;
  }

  try {
    const accessToken = await getAccessToken();

    // Step 1: Initialize resumable upload
    const metadata = {
      snippet: {
        title: opts.title.slice(0, 100), // YouTube title limit
        description: opts.description.slice(0, 5000),
        tags: [...DEFAULT_TAGS, ...opts.tags].slice(0, 30),
        categoryId: opts.categoryId ?? "28", // Science & Technology
      },
      status: {
        privacyStatus: opts.privacyStatus ?? "public",
        selfDeclaredMadeForKids: false,
      },
    };

    const initRes = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(fileSize),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    });

    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`Upload init failed (${initRes.status}): ${err}`);
    }

    const uploadUri = initRes.headers.get("location");
    if (!uploadUri) throw new Error("No upload URI returned");

    // Step 2: Upload video data
    const videoData = readFileSync(opts.videoPath);
    const uploadRes = await fetch(uploadUri, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fileSize),
      },
      body: videoData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Video upload failed (${uploadRes.status}): ${err}`);
    }

    const uploadData = (await uploadRes.json()) as { id: string };
    const videoId = uploadData.id;

    const result: UploadResult = {
      success: true,
      video_id: videoId,
      url: `https://youtube.com/shorts/${videoId}`,
      dry_run: false,
      upload_time_ms: Date.now() - start,
    };

    console.log(`[YouTube] ✓ Uploaded: ${result.url} (${fileSizeMB} MB, ${result.upload_time_ms}ms)`);
    logUpload(result, opts);
    return result;
  } catch (err: any) {
    const result: UploadResult = {
      success: false,
      error: err.message,
      dry_run: false,
      upload_time_ms: Date.now() - start,
    };
    logUpload(result, opts);
    return result;
  }
}

// ── Logging ───────────────────────────────────────────

function logUpload(result: UploadResult, opts: UploadOptions): void {
  const entry = {
    ...result,
    title: opts.title,
    video_path: opts.videoPath,
    tags: opts.tags,
    timestamp: new Date().toISOString(),
  };
  try {
    const line = JSON.stringify(entry) + "\n";
    writeFileSync(UPLOAD_LOG, line, { flag: "a" });
  } catch { /* ignore log errors */ }
  // Sprint TICKET-010-YT-01: update quota tracker for real uploads only
  if (result.success && !result.dry_run) {
    updateQuotaTracker(UPLOAD_QUOTA_COST);
  }
}

// ── Readiness Check ───────────────────────────────────

/**
 * Check if YouTube upload is configured and ready.
 */
export function checkUploadReadiness(): ReadinessCheck {
  const issues: string[] = [];

  const apiKeySet = !!YOUTUBE_API_KEY;
  const clientIdSet = !!YOUTUBE_CLIENT_ID;
  const clientSecretSet = !!YOUTUBE_CLIENT_SECRET;
  const refreshTokenSet = !!YOUTUBE_REFRESH_TOKEN;

  if (!apiKeySet) issues.push("YOUTUBE_API_KEY not set (needed for read access)");
  if (!clientIdSet) issues.push("YOUTUBE_CLIENT_ID not set (needed for upload)");
  if (!clientSecretSet) issues.push("YOUTUBE_CLIENT_SECRET not set (needed for upload)");
  if (!refreshTokenSet) issues.push("YOUTUBE_REFRESH_TOKEN not set (needed for upload)");

  const canUpload = clientIdSet && clientSecretSet && refreshTokenSet;
  const canRead = apiKeySet;

  return {
    api_key_set: apiKeySet,
    client_id_set: clientIdSet,
    client_secret_set: clientSecretSet,
    refresh_token_set: refreshTokenSet,
    can_upload: canUpload,
    can_read: canRead,
    issues,
  };
}

/**
 * Format readiness as human-readable string for Telegram.
 */
export function formatYouTubeStatus(): string {
  const r = checkUploadReadiness();

  const lines: string[] = [
    "📺 *YouTube Shorts Status*",
    "",
    `API Key: ${r.api_key_set ? "✅ SET" : "❌ Missing"}`,
    `Client ID: ${r.client_id_set ? "✅ SET" : "❌ Missing"}`,
    `Client Secret: ${r.client_secret_set ? "✅ SET" : "❌ Missing"}`,
    `Refresh Token: ${r.refresh_token_set ? "✅ SET" : "❌ Missing"}`,
    "",
    `Upload: ${r.can_upload ? "✅ READY" : "❌ NOT READY"}`,
    `Read: ${r.can_read ? "✅ READY" : "❌ NOT READY"}`,
  ];

  if (r.issues.length > 0) {
    lines.push("");
    lines.push("*Setup needed:*");
    for (const issue of r.issues) {
      lines.push(`  • ${issue}`);
    }
    lines.push("");
    lines.push("*How to set up:*");
    lines.push("1. Go to console.cloud.google.com");
    lines.push("2. Enable YouTube Data API v3");
    lines.push("3. Create OAuth2 credentials");
    lines.push("4. Set env vars in .env");
  }

  // Check upload history
  if (existsSync(UPLOAD_LOG)) {
    try {
      const logLines = readFileSync(UPLOAD_LOG, "utf-8").split("\n").filter((l) => l.trim());
      const total = logLines.length;
      if (total > 0) {
        const last = JSON.parse(logLines[logLines.length - 1]);
        lines.push("");
        lines.push(`*Upload History:* ${total} uploads`);
        lines.push(`Last: ${last.success ? "✅" : "❌"} ${last.title?.slice(0, 40) ?? "unknown"} (${last.timestamp?.slice(0, 10)})`);
      }
    } catch { /* skip */ }
  }

  return lines.join("\n");
}
