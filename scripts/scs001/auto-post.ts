/**
 * auto-post.ts — Automatic TikTok posting daemon (Sprint 233)
 *
 * Picks the top unposted video from publish-ledger.jsonl, uploads to Supabase
 * for a public URL, posts via TikTok Content Posting API, records to
 * manual-posts.jsonl, and notifies owner via Telegram.
 *
 * Run via PM2 cron (2x/day at 08:00 + 19:00) or manually:
 *   npx ts-node scripts/scs001/auto-post.ts
 *
 * Env:
 *   TIKTOK_ACCESS_TOKEN   — required (run scripts/tiktok-oauth.ts first)
 *   TIKTOK_CLIENT_KEY     — required
 *   SUPABASE_URL          — required (for video hosting)
 *   SUPABASE_SERVICE_KEY  — required
 *   TELEGRAM_BOT_TOKEN    — for owner notification
 *   OWNER_TELEGRAM_CHAT_ID — for owner notification
 *   AUTO_POST_DRY_RUN=1   — skip actual TikTok post, log only
 *   AUTO_POST_MAX=1        — max videos per run (default 1)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD            = process.cwd();
const LEDGER_PATH    = join(CWD, 'workspace', 'scs001', 'publish-ledger.jsonl');
const MANUAL_PATH    = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const TOPICS_PATH    = join(CWD, 'workspace', 'scs001', 'viral-topics.json');
const LOG_PATH       = join(CWD, 'logs', 'auto-post.jsonl');

const DRY_RUN        = process.env.AUTO_POST_DRY_RUN === '1';
const MAX_PER_RUN    = parseInt(process.env.AUTO_POST_MAX || '1', 10);
const ACCESS_TOKEN   = process.env.TIKTOK_ACCESS_TOKEN || '';
const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN || '';
const OWNER_CHAT_ID  = process.env.OWNER_TELEGRAM_CHAT_ID || '';

interface LedgerEntry {
  video_id: string;
  run_id: string;
  speaker?: string;
  topic?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findCaptionedMp4(videoId: string): string | null {
  try {
    const scsDir = join(CWD, 'workspace', 'scs001');
    const runDirs = readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

function loadRecordedIds(): Set<string> {
  const ids = new Set<string>();
  if (existsSync(MANUAL_PATH)) {
    try {
      readFileSync(MANUAL_PATH, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { const e = JSON.parse(l); if (e.video_id) ids.add(e.video_id); } catch {} });
    } catch {}
  }
  return ids;
}

function loadViralHashtags(): string[] {
  if (existsSync(TOPICS_PATH)) {
    try {
      const vt = JSON.parse(readFileSync(TOPICS_PATH, 'utf-8'));
      return (vt.topics ?? []).slice(0, 4).map((t: string) => t.replace(/^#/, ''));
    } catch {}
  }
  return ['ai', 'tech'];
}

function loadExperimentScores(): Map<string, number> {
  const scores = new Map<string, number>();
  const expDir = join(CWD, 'workspace', 'scs001');
  try {
    const runDirs = readdirSync(expDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const expPath = join(expDir, dir, 'experiment.jsonl');
      if (!existsSync(expPath)) continue;
      readFileSync(expPath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
        try {
          const e = JSON.parse(l);
          if (e.video_id && e.partial_viral_score != null) {
            scores.set(e.video_id, e.partial_viral_score);
          }
        } catch {}
      });
    }
  } catch {}
  return scores;
}

function recordPost(videoId: string, publishId: string, method: string): void {
  mkdirSync(dirname(MANUAL_PATH), { recursive: true });
  const entry = {
    video_id: videoId,
    views: 0,
    posted_at: new Date().toISOString(),
    publish_id: publishId,
    method,
  };
  appendFileSync(MANUAL_PATH, JSON.stringify(entry) + '\n', 'utf-8');
}

function logEvent(event: Record<string, unknown>): void {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n', 'utf-8');
}

async function sendTelegramMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !OWNER_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: OWNER_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch {}
}

// ── TikTok posting ───────────────────────────────────────────────────────────

async function uploadToSupabase(localPath: string, videoId: string): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || '',
  );

  const fileBuffer = readFileSync(localPath);
  const storagePath = `auto-post/${videoId}.mp4`;
  const bucket = 'scs001-videos';

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, { contentType: 'video/mp4', upsert: true });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function postToTikTok(publicUrl: string, caption: string): Promise<string> {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: caption,
        privacy_level: 'PUBLIC_TO_EVERYONE',
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: publicUrl,
      },
      media_type: 'VIDEO',
    }),
  });

  const json = await res.json() as any;

  if (!res.ok || (json.error?.code && json.error.code !== 'ok')) {
    throw new Error(`TikTok API error: ${json.error?.message || JSON.stringify(json)}`);
  }

  return json.data?.publish_id || `posted-${Date.now()}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[auto-post] Starting — ${new Date().toISOString()}`);
  console.log(`[auto-post] DRY_RUN=${DRY_RUN}, MAX=${MAX_PER_RUN}`);

  if (!ACCESS_TOKEN && !DRY_RUN) {
    console.log('[auto-post] TIKTOK_ACCESS_TOKEN not set. Skipping. Run scripts/tiktok-oauth.ts first.');
    logEvent({ event: 'skip', reason: 'no_access_token' });
    await sendTelegramMessage('⚠️ *Auto-post skipped* — TIKTOK\\_ACCESS\\_TOKEN not set.\nRun `/tiktokauth` for instructions.');
    return;
  }

  // Load ledger entries
  if (!existsSync(LEDGER_PATH)) {
    console.log('[auto-post] No publish-ledger.jsonl found. Nothing to post.');
    return;
  }

  const recordedIds = loadRecordedIds();
  const viralHashtags = loadViralHashtags();
  const scores = loadExperimentScores();

  const entries: LedgerEntry[] = readFileSync(LEDGER_PATH, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as LedgerEntry[];

  // Find unposted videos with files on disk
  const ready: Array<LedgerEntry & { filePath: string; score: number }> = [];
  for (const e of entries) {
    if (recordedIds.has(e.video_id)) continue;
    const mp4 = findCaptionedMp4(e.video_id);
    if (mp4) {
      ready.push({ ...e, filePath: mp4, score: scores.get(e.video_id) ?? -1 });
    }
  }

  // Sort by viral score (highest first)
  ready.sort((a, b) => b.score - a.score);

  const toPost = ready.slice(0, MAX_PER_RUN);

  if (toPost.length === 0) {
    console.log('[auto-post] No unposted videos available.');
    logEvent({ event: 'skip', reason: 'no_videos' });
    return;
  }

  console.log(`[auto-post] ${toPost.length} video(s) to post (${ready.length} total in queue)`);

  let posted = 0;
  for (const video of toPost) {
    const hashtags = [...viralHashtags, 'fyp', 'viral', 'learnontiktok'].map(h => `#${h}`).join(' ');
    const caption = `${video.topic?.slice(0, 150) || 'AI insights'}\n\n${hashtags}`;

    try {
      if (DRY_RUN) {
        console.log(`[auto-post] [DRY-RUN] Would post: ${video.video_id} (score: ${video.score})`);
        console.log(`[auto-post] [DRY-RUN] Caption: ${caption.slice(0, 100)}...`);
        recordPost(video.video_id, `dry-run-${Date.now()}`, 'auto-post-dry');
        logEvent({ event: 'dry_run', video_id: video.video_id, score: video.score });
        posted++;
        continue;
      }

      // Upload to Supabase for public URL
      console.log(`[auto-post] Uploading ${video.video_id} to Supabase...`);
      const publicUrl = await uploadToSupabase(video.filePath, video.video_id);
      console.log(`[auto-post] Public URL: ${publicUrl}`);

      // Post to TikTok
      console.log(`[auto-post] Posting to TikTok...`);
      const publishId = await postToTikTok(publicUrl, caption);
      console.log(`[auto-post] ✅ Published: ${publishId}`);

      // Record
      recordPost(video.video_id, publishId, 'auto-post');
      logEvent({
        event: 'posted',
        video_id: video.video_id,
        publish_id: publishId,
        score: video.score,
        public_url: publicUrl,
      });

      posted++;

      // Notify owner
      const totalPosted = recordedIds.size + posted;
      const remaining = Math.max(0, 30 - totalPosted);
      await sendTelegramMessage([
        `🚀 *Auto-posted to TikTok!*`,
        '',
        `📹 \`${video.video_id}\``,
        video.topic ? `📝 ${video.topic.slice(0, 80)}` : '',
        `🧬 Viral score: ${video.score}`,
        '',
        `📊 Gate: *${totalPosted}/30* posts (${remaining} remaining)`,
        `🔗 Publish ID: \`${publishId}\``,
      ].filter(Boolean).join('\n'));

    } catch (err) {
      const errMsg = (err as Error).message?.slice(0, 200);
      console.error(`[auto-post] ❌ Failed ${video.video_id}: ${errMsg}`);
      logEvent({ event: 'error', video_id: video.video_id, error: errMsg });

      await sendTelegramMessage(`❌ *Auto-post failed*\n\`${video.video_id}\`: ${errMsg}`);
    }
  }

  console.log(`[auto-post] Done. Posted ${posted}/${toPost.length} videos.`);
}

main().catch(err => {
  console.error(`[auto-post] Fatal: ${err.message}`);
  logEvent({ event: 'fatal', error: err.message });
  process.exit(1);
});
