#!/usr/bin/env npx ts-node
/**
 * auto-post-browser.ts — Sprint 802
 *
 * Browser-based auto-posting daemon. Picks the top unposted video from
 * publish-ledger.jsonl (or auto-delivered.jsonl), posts via Browser Use
 * (post-tiktok-browser.sh), records to manual-posts.jsonl, notifies via Telegram.
 *
 * Unlike auto-post.ts, this does NOT require TIKTOK_ACCESS_TOKEN — it uses
 * Chrome browser automation instead.
 *
 * Run via PM2 cron (2x/day at 12:00 + 19:00) or manually:
 *   npx ts-node scripts/scs001/auto-post-browser.ts
 *
 * Env:
 *   AUTO_POST_DRY_RUN=1      — skip actual post, log only
 *   AUTO_POST_MAX=1           — max videos per run (default 1)
 *   TELEGRAM_BOT_TOKEN        — for owner notification
 *   OWNER_TELEGRAM_CHAT_ID    — for owner notification
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import { runScraperDetached } from './analytics-scraper';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD            = process.cwd();
const LEDGER_PATH    = join(CWD, 'workspace', 'scs001', 'publish-ledger.jsonl');
const DELIVERED_PATH = join(CWD, 'workspace', 'scs001', 'auto-delivered.jsonl');
const MANUAL_PATH    = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const TOPICS_PATH    = join(CWD, 'workspace', 'scs001', 'viral-topics.json');
const LOG_PATH       = join(CWD, 'logs', 'auto-post-browser.jsonl');
const POST_SCRIPT    = join(CWD, 'scripts', 'scs001', 'post-tiktok-browser.sh');

const DRY_RUN        = process.env.AUTO_POST_DRY_RUN === '1';
const MAX_PER_RUN    = parseInt(process.env.AUTO_POST_MAX || '1', 10);
const BOT_TOKEN      = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const OWNER_CHAT_ID  = process.env.OWNER_TELEGRAM_CHAT_ID || '';

interface VideoCandidate {
  video_id: string;
  mp4_path: string;
  viral_score: number;
  topic?: string;
  source: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function findMp4ForVideo(videoId: string): string | null {
  const scsDir = join(CWD, 'workspace', 'scs001');
  // Check legacy run-* dirs
  try {
    const runDirs = readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (existsSync(p)) return p;
    }
  } catch {}
  // Check multiformat-runs output dirs
  try {
    const mfDir = join(scsDir, 'multiformat-runs');
    if (existsSync(mfDir)) {
      const mfRuns = readdirSync(mfDir).filter(d => d.startsWith('mf-'));
      for (const dir of mfRuns) {
        const outDir = join(mfDir, dir, 'output');
        if (!existsSync(outDir)) continue;
        for (const suffix of ['_final.mp4', '_final_av.mp4', '_video_only.mp4', '_base.mp4']) {
          const p = join(outDir, `${videoId}${suffix}`);
          if (existsSync(p)) return p;
        }
      }
    }
  } catch {}
  return null;
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

function buildCandidateList(recordedIds: Set<string>): VideoCandidate[] {
  const candidates: VideoCandidate[] = [];
  const seen = new Set<string>();

  // Source 1: auto-delivered.jsonl (has mp4_path + viral_score)
  if (existsSync(DELIVERED_PATH)) {
    readFileSync(DELIVERED_PATH, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try {
        const e = JSON.parse(l);
        if (!e.video_id || recordedIds.has(e.video_id) || seen.has(e.video_id)) return;
        const mp4 = (e.mp4_path && existsSync(e.mp4_path)) ? e.mp4_path : findMp4ForVideo(e.video_id);
        if (mp4) {
          seen.add(e.video_id);
          candidates.push({
            video_id: e.video_id,
            mp4_path: mp4,
            viral_score: e.viral_score ?? 0,
            topic: e.topic,
            source: 'auto-delivered',
          });
        }
      } catch {}
    });
  }

  // Source 2: publish-ledger.jsonl (may not have viral_score)
  if (existsSync(LEDGER_PATH)) {
    readFileSync(LEDGER_PATH, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try {
        const e = JSON.parse(l);
        if (!e.video_id || recordedIds.has(e.video_id) || seen.has(e.video_id)) return;
        const mp4 = findMp4ForVideo(e.video_id);
        if (mp4) {
          seen.add(e.video_id);
          candidates.push({
            video_id: e.video_id,
            mp4_path: mp4,
            viral_score: 0,
            topic: e.topic,
            source: 'ledger',
          });
        }
      } catch {}
    });
  }

  // Sort by viral score descending
  candidates.sort((a, b) => b.viral_score - a.viral_score);
  return candidates;
}

function recordPost(videoId: string, method: string): void {
  mkdirSync(dirname(MANUAL_PATH), { recursive: true });
  const entry = {
    video_id: videoId,
    views: 0,
    posted_at: new Date().toISOString(),
    method,
  };
  appendFileSync(MANUAL_PATH, JSON.stringify(entry) + '\n', 'utf-8');
}

function logEvent(event: Record<string, unknown>): void {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n', 'utf-8');
}

async function sendTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN || !OWNER_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: OWNER_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[auto-post-browser] Starting — ${new Date().toISOString()}`);
  console.log(`[auto-post-browser] DRY_RUN=${DRY_RUN}, MAX=${MAX_PER_RUN}`);

  const recordedIds = loadRecordedIds();
  const candidates = buildCandidateList(recordedIds);

  if (candidates.length === 0) {
    console.log('[auto-post-browser] No unposted videos available.');
    logEvent({ event: 'skip', reason: 'no_videos' });
    return;
  }

  console.log(`[auto-post-browser] ${candidates.length} candidates, posting top ${MAX_PER_RUN}`);
  const toPost = candidates.slice(0, MAX_PER_RUN);
  const hashtags = [...loadViralHashtags(), 'fyp', 'viral', 'learnontiktok'].map(h => `#${h}`).join(' ');

  let posted = 0;
  for (const video of toPost) {
    const caption = `${video.topic?.slice(0, 150) || 'AI insights'}\n\n${hashtags}`;

    try {
      if (DRY_RUN) {
        console.log(`[auto-post-browser] [DRY-RUN] Would post: ${video.video_id} (score: ${video.viral_score})`);
        recordPost(video.video_id, 'browser-post-dry');
        logEvent({ event: 'dry_run', video_id: video.video_id, score: video.viral_score });
        posted++;
        continue;
      }

      // Post via Browser Use
      console.log(`[auto-post-browser] Posting ${video.video_id} via browser...`);
      const result = execSync(
        `bash "${POST_SCRIPT}" "${video.mp4_path}" "${caption.replace(/"/g, '\\"')}" --post`,
        { cwd: CWD, timeout: 120_000, stdio: 'pipe' }
      ).toString();
      console.log(`[auto-post-browser] ✅ Browser post initiated: ${video.video_id}`);
      console.log(result.slice(-200));

      recordPost(video.video_id, 'browser-post');
      logEvent({
        event: 'browser_posted',
        video_id: video.video_id,
        score: video.viral_score,
        mp4_path: video.mp4_path,
      });
      posted++;

      // Sprint BUGFIX-ANALYTICS-01: trigger analytics scrape 30 min after posting
      // so Creator Center has time to register the new video.
      // Detached — does not block posting flow.
      setTimeout(() => {
        console.log(`[auto-post-browser] ⏱ Triggering analytics scrape (30 min post-post delay)...`);
        runScraperDetached(7);
      }, 30 * 60 * 1000);

      const totalPosted = recordedIds.size + posted;
      const remaining = Math.max(0, 30 - totalPosted);
      await sendTelegram([
        `🌐 *Browser auto-posted!*`,
        '',
        `📹 \`${video.video_id}\``,
        video.topic ? `📝 ${video.topic.slice(0, 80)}` : '',
        `🧬 Score: ${video.viral_score}`,
        '',
        `📊 Gate: *${totalPosted}/30* posts (${remaining} remaining)`,
      ].filter(Boolean).join('\n'));

    } catch (err) {
      const errMsg = (err as Error).message?.slice(0, 200);
      console.error(`[auto-post-browser] ❌ Failed ${video.video_id}: ${errMsg}`);
      logEvent({ event: 'error', video_id: video.video_id, error: errMsg });
      await sendTelegram(`❌ *Browser auto-post failed*\n\`${video.video_id}\`: ${errMsg}`);
    }
  }

  console.log(`[auto-post-browser] Done. Posted ${posted}/${toPost.length} videos.`);
}

main().catch(err => {
  console.error(`[auto-post-browser] Fatal: ${err.message}`);
  logEvent({ event: 'fatal', error: err.message });
  process.exit(1);
});
