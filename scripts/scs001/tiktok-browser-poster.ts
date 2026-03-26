#!/usr/bin/env npx ts-node
/**
 * tiktok-browser-poster.ts — SPRINT-508-BROWSER-01
 *
 * Direct single-video TikTok poster via Browser Use + Chrome Default profile.
 * Wraps post-tiktok.py for TypeScript pipeline integration.
 *
 * Usage:
 *   npx ts-node scripts/scs001/tiktok-browser-poster.ts \
 *     --video /path/to/video.mp4 --caption "AI news #ai" [--dry-run] [--post]
 *
 *   # or resolve from video ID:
 *   npx ts-node scripts/scs001/tiktok-browser-poster.ts --video-id <id> [--dry-run]
 *
 * Modes:
 *   --dry-run (default): logs intent, does NOT invoke browser, returns success
 *   default:             prepares upload in browser, takes screenshot, waits for human click
 *   --post:              fully automated post (requires warmup complete)
 *
 * WARMUP GATE: posting is blocked until workspace/scs001/warmup-status.json has verified=true
 *              Expected: 2026-03-29 after WARMUP-01 completion.
 *
 * Output (stdout JSON):
 *   { ok: true, video_id, mode, screenshot_path?, posted_at? }
 *   { ok: false, error }
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');

try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

// ── Paths ──────────────────────────────────────────────────────────────────

const WARMUP_STATUS  = join(ROOT, 'workspace', 'scs001', 'warmup-status.json');
const MANUAL_POSTS   = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const LEDGER_PATH    = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const DELIVERED_PATH = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const LOG_PATH       = join(ROOT, 'logs', 'tiktok-browser-poster.jsonl');
const VENV_DIR       = join(ROOT, '.venv-browser-use');
const POST_PY        = join(ROOT, 'scripts', 'scs001', 'post-tiktok.py');

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string): string | null => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const hasFlag = (flag: string): boolean => args.includes(flag);

const DRY_RUN   = hasFlag('--dry-run') || process.env.AUTO_POST_DRY_RUN === '1';
const DO_POST   = hasFlag('--post');
const VIDEO_ARG = getArg('--video');
const VIDEO_ID  = getArg('--video-id');

// ── Helpers ────────────────────────────────────────────────────────────────

function logEvent(event: Record<string, unknown>): void {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify({ ...event, ts: new Date().toISOString() }) + '\n');
}

function findMp4ByVideoId(videoId: string): string | null {
  const scsDir = join(ROOT, 'workspace', 'scs001');

  // ready-to-post folder
  const readyDir = join(scsDir, 'ready-to-post');
  if (existsSync(readyDir)) {
    for (const f of readdirSync(readyDir)) {
      if (f.endsWith('.mp4') && f.includes(videoId)) return join(readyDir, f);
    }
  }

  // multiformat-runs output
  const mfDir = join(scsDir, 'multiformat-runs');
  if (existsSync(mfDir)) {
    for (const run of readdirSync(mfDir).sort().reverse()) {
      const outDir = join(mfDir, run, 'output');
      if (!existsSync(outDir)) continue;
      for (const suf of ['_final.mp4', '_final_av.mp4', '_video_only.mp4', '_base.mp4']) {
        const p = join(outDir, videoId + suf);
        if (existsSync(p)) return p;
      }
    }
  }

  // vlog-runs
  const vlogDir = join(scsDir, 'vlog-runs');
  if (existsSync(vlogDir)) {
    for (const run of readdirSync(vlogDir).sort().reverse()) {
      const outDir = join(vlogDir, run, 'output');
      if (!existsSync(outDir)) continue;
      for (const f of readdirSync(outDir)) {
        if (f.endsWith('.mp4') && f.includes(videoId)) return join(outDir, f);
      }
    }
  }

  return null;
}

function resolveVideoPath(): { videoPath: string; videoId: string } | null {
  if (VIDEO_ARG) {
    if (!existsSync(VIDEO_ARG)) {
      console.error(JSON.stringify({ ok: false, error: `Video not found: ${VIDEO_ARG}` }));
      return null;
    }
    const videoId = VIDEO_ID || VIDEO_ARG.replace(/.*\//, '').replace(/\.mp4$/, '');
    return { videoPath: VIDEO_ARG, videoId };
  }

  if (VIDEO_ID) {
    // Try auto-delivered first
    if (existsSync(DELIVERED_PATH)) {
      for (const line of readFileSync(DELIVERED_PATH, 'utf-8').split('\n')) {
        try {
          const e = JSON.parse(line);
          if (e.video_id === VIDEO_ID && e.mp4_path && existsSync(e.mp4_path)) {
            return { videoPath: e.mp4_path, videoId: VIDEO_ID };
          }
        } catch {}
      }
    }
    const found = findMp4ByVideoId(VIDEO_ID);
    if (!found) {
      console.error(JSON.stringify({ ok: false, error: `No MP4 found for video_id: ${VIDEO_ID}` }));
      return null;
    }
    return { videoPath: found, videoId: VIDEO_ID };
  }

  // No video arg — pick first unposted from queue
  const postedIds = new Set<string>();
  if (existsSync(MANUAL_POSTS)) {
    for (const line of readFileSync(MANUAL_POSTS, 'utf-8').split('\n')) {
      try { const e = JSON.parse(line); if (e.video_id) postedIds.add(e.video_id); } catch {}
    }
  }

  for (const src of [DELIVERED_PATH, LEDGER_PATH]) {
    if (!existsSync(src)) continue;
    for (const line of readFileSync(src, 'utf-8').split('\n')) {
      try {
        const e = JSON.parse(line);
        if (!e.video_id || postedIds.has(e.video_id)) continue;
        const mp4 = (e.mp4_path && existsSync(e.mp4_path)) ? e.mp4_path : findMp4ByVideoId(e.video_id);
        if (mp4) return { videoPath: mp4, videoId: e.video_id };
      } catch {}
    }
  }

  console.error(JSON.stringify({ ok: false, error: 'No unposted video found in queue' }));
  return null;
}

function checkWarmup(): boolean {
  if (!existsSync(WARMUP_STATUS)) return false;
  try {
    const s = JSON.parse(readFileSync(WARMUP_STATUS, 'utf-8'));
    return s.verified === true;
  } catch { return false; }
}

function recordPost(videoId: string, mode: string): void {
  mkdirSync(dirname(MANUAL_POSTS), { recursive: true });
  appendFileSync(MANUAL_POSTS,
    JSON.stringify({ video_id: videoId, views: 0, posted_at: new Date().toISOString(), method: mode }) + '\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const resolved = resolveVideoPath();
  if (!resolved) process.exit(1);
  const { videoPath, videoId } = resolved;

  // DRY RUN — just log and exit success
  if (DRY_RUN) {
    const result = {
      ok: true,
      video_id: videoId,
      mode: 'dry-run',
      video_path: videoPath,
      warmup_verified: checkWarmup(),
      note: 'DRY_RUN=1 — no browser invoked',
    };
    console.log(JSON.stringify(result));
    logEvent({ event: 'dry_run', ...result });
    return;
  }

  // WARMUP GATE — block live posting until 2026-03-29
  if (!checkWarmup()) {
    const result = {
      ok: false,
      error: 'Warmup not complete. Run /warmup-complete after 2026-03-29.',
      video_id: videoId,
      mode: 'blocked',
    };
    console.error(JSON.stringify(result));
    logEvent({ event: 'warmup_blocked', ...result });
    process.exit(2);
  }

  // VENV CHECK
  if (!existsSync(VENV_DIR)) {
    console.error(JSON.stringify({
      ok: false, error: 'browser-use venv not found. Run: bash scripts/scs001/install-browser-use.sh',
    }));
    process.exit(1);
  }

  // BUILD command
  const pythonBin = join(VENV_DIR, 'bin', 'python');
  const postFlag  = DO_POST ? '--post' : '';
  const cmd = `"${pythonBin}" "${POST_PY}" --video "${videoPath}" ${postFlag} --skip-warmup`;

  console.error(`[tiktok-browser-poster] Invoking browser poster for ${videoId}...`);

  try {
    const output = execSync(cmd, { cwd: ROOT, timeout: 180_000, stdio: 'pipe' }).toString();
    console.error(output.slice(-500));

    const mode = DO_POST ? 'browser-post-live' : 'browser-post-prepare';
    recordPost(videoId, mode);
    logEvent({ event: 'posted', video_id: videoId, mode, video_path: videoPath });

    const result = { ok: true, video_id: videoId, mode, video_path: videoPath, posted_at: new Date().toISOString() };
    console.log(JSON.stringify(result));

  } catch (err) {
    const errMsg = (err as Error).message?.slice(0, 300);
    const result = { ok: false, error: errMsg, video_id: videoId };
    console.error(JSON.stringify(result));
    logEvent({ event: 'error', ...result });
    process.exit(1);
  }
}

main();
