/**
 * cross-platform-publish.ts — Sprint 678
 * Unified cross-platform publisher: TikTok + YouTube Shorts.
 * Reads from auto-delivered.jsonl and uploads to YouTube Shorts.
 * Respects YOUTUBE_DRY_RUN=1 for safe testing.
 *
 * Usage:
 *   npx ts-node scripts/scs001/cross-platform-publish.ts [--video-id ID] [--all-pending] [--dry-run] [--status]
 *
 * Modes:
 *   --video-id ID     Upload a specific video by ID
 *   --all-pending     Upload all delivered videos not yet on YouTube
 *   --dry-run         Preview without uploading
 *   --status          Show YouTube readiness + upload stats
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');

try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const SCS_DIR = join(ROOT, 'workspace', 'scs001');
const DELIVERED_LOG = join(SCS_DIR, 'auto-delivered.jsonl');
const YOUTUBE_LOG = join(SCS_DIR, 'youtube-uploads.jsonl');
const LEDGER_PATH = join(SCS_DIR, 'publish-ledger.jsonl');
const CROSSPLATFORM_LOG = join(SCS_DIR, 'crossplatform-publish.jsonl');

const DRY_RUN = process.argv.includes('--dry-run') || process.env.YOUTUBE_DRY_RUN === '1';
const STATUS_MODE = process.argv.includes('--status');
const ALL_PENDING = process.argv.includes('--all-pending');

const videoIdArg = process.argv.find((_, i, a) => a[i - 1] === '--video-id') ?? '';

interface DeliveredEntry {
  video_id: string;
  delivered_at: string;
  viral_score: number;
  mp4_path: string;
}

interface LedgerEntry {
  video_id: string;
  topic?: string;
  hook_text?: string;
  hashtags?: string[];
  [key: string]: any;
}

function readLines(path: string): any[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function getYouTubeUploaded(): Set<string> {
  return new Set(readLines(YOUTUBE_LOG).map((e: any) => e.video_id).filter(Boolean));
}

function getLedgerEntry(videoId: string): LedgerEntry | undefined {
  const entries = readLines(LEDGER_PATH);
  return entries.find((e: any) => e.video_id === videoId);
}

function buildYouTubeMetadata(entry: DeliveredEntry, ledger?: LedgerEntry) {
  const topic = ledger?.topic || 'AI & Tech Insights';
  const hookText = ledger?.hook_text || topic;
  const title = `${hookText.slice(0, 90)} #shorts`;
  const description = [
    hookText,
    '',
    `Topic: ${topic}`,
    '',
    '#shorts #ai #tech #viral #trending',
    ledger?.hashtags ? ledger.hashtags.map((h: string) => `#${h}`).join(' ') : '',
  ].filter(Boolean).join('\n').slice(0, 5000);

  const tags = ['shorts', 'ai', 'tech', 'viral', 'trending'];
  if (ledger?.hashtags) tags.push(...ledger.hashtags.slice(0, 10));

  return { title, description, tags };
}

async function uploadToYouTube(entry: DeliveredEntry): Promise<{ success: boolean; video_id?: string; error?: string }> {
  const ledger = getLedgerEntry(entry.video_id);
  const meta = buildYouTubeMetadata(entry, ledger);

  if (!existsSync(entry.mp4_path)) {
    return { success: false, error: `Video file not found: ${entry.mp4_path}` };
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would upload: ${entry.video_id}`);
    console.log(`    Title: ${meta.title}`);
    console.log(`    File: ${entry.mp4_path}`);
    return { success: true, video_id: `DRY_${entry.video_id}` };
  }

  // Import and use the YouTube upload client
  try {
    const { uploadShort } = require('./youtube-shorts');
    const result = await uploadShort({
      videoPath: entry.mp4_path,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      privacyStatus: 'public',
    });
    return { success: result.success, video_id: result.video_id, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function logResult(videoId: string, platform: string, success: boolean, details: any): void {
  const entry = {
    video_id: videoId,
    platform,
    success,
    ...details,
    timestamp: new Date().toISOString(),
  };
  try {
    appendFileSync(CROSSPLATFORM_LOG, JSON.stringify(entry) + '\n');
  } catch {}
}

function showStatus(): void {
  console.log('\n=== Cross-Platform Publishing Status ===\n');

  // YouTube readiness
  const hasClientId = !!process.env.YOUTUBE_CLIENT_ID;
  const hasClientSecret = !!process.env.YOUTUBE_CLIENT_SECRET;
  const hasRefreshToken = !!process.env.YOUTUBE_REFRESH_TOKEN;
  const canUpload = hasClientId && hasClientSecret && hasRefreshToken;

  console.log('YouTube Shorts:');
  console.log(`  Client ID: ${hasClientId ? 'SET' : 'MISSING'}`);
  console.log(`  Client Secret: ${hasClientSecret ? 'SET' : 'MISSING'}`);
  console.log(`  Refresh Token: ${hasRefreshToken ? 'SET' : 'MISSING'}`);
  console.log(`  Upload Ready: ${canUpload ? 'YES' : 'NO'}`);

  // Stats
  const delivered = readLines(DELIVERED_LOG);
  const ytUploaded = getYouTubeUploaded();
  const pending = delivered.filter((e: any) => !ytUploaded.has(e.video_id));
  const crossLog = readLines(CROSSPLATFORM_LOG);

  console.log(`\nVideos:`);
  console.log(`  Delivered (Telegram): ${delivered.length}`);
  console.log(`  Uploaded (YouTube): ${ytUploaded.size}`);
  console.log(`  Pending upload: ${pending.length}`);
  console.log(`  Cross-platform events: ${crossLog.length}`);

  // TikTok status
  const hasTikTokToken = !!process.env.TIKTOK_ACCESS_TOKEN;
  console.log(`\nTikTok:`);
  console.log(`  Access Token: ${hasTikTokToken ? 'SET' : 'MISSING (manual posting)'}`);
}

async function main(): Promise<void> {
  if (STATUS_MODE) {
    showStatus();
    return;
  }

  console.log(`\n=== Cross-Platform Publisher ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  const delivered: DeliveredEntry[] = readLines(DELIVERED_LOG);
  const ytUploaded = getYouTubeUploaded();

  let targets: DeliveredEntry[] = [];

  if (videoIdArg) {
    const entry = delivered.find(e => e.video_id === videoIdArg);
    if (!entry) {
      console.log(`Video ${videoIdArg} not found in delivered log.`);
      process.exit(1);
    }
    targets = [entry];
  } else if (ALL_PENDING) {
    targets = delivered.filter(e => !ytUploaded.has(e.video_id));
    console.log(`Found ${targets.length} videos pending YouTube upload.`);
  } else {
    // Default: next unuploaded video
    const next = delivered.find(e => !ytUploaded.has(e.video_id));
    if (next) targets = [next];
    else {
      console.log('All delivered videos are already uploaded to YouTube.');
      return;
    }
  }

  if (targets.length === 0) {
    console.log('No videos to upload.');
    return;
  }

  let success = 0, failed = 0;

  for (const entry of targets) {
    console.log(`\nUploading: ${entry.video_id} (score: ${entry.viral_score})`);
    const result = await uploadToYouTube(entry);

    if (result.success) {
      success++;
      logResult(entry.video_id, 'youtube', true, { yt_video_id: result.video_id });
      console.log(`  YouTube: ${result.video_id}`);
    } else {
      failed++;
      logResult(entry.video_id, 'youtube', false, { error: result.error });
      console.log(`  FAILED: ${result.error}`);
    }
  }

  console.log(`\n--- Results: ${success} uploaded, ${failed} failed ---`);
}

export { main as crossPlatformPublish, showStatus, buildYouTubeMetadata };

main().catch(e => { console.error(`Error: ${e.message}`); process.exit(1); });
