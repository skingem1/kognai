/**
 * go-live.ts — Sprint 1462
 * TikTok go-live operator assistant.
 *
 * Usage:
 *   npx ts-node scripts/scs001/go-live.ts
 *     → warmup status + top 5 pending videos ranked by score
 *
 *   npx ts-node scripts/scs001/go-live.ts --mark-posted VIDEO_ID
 *     → marks that video_id as status=posted in post-queue.jsonl
 *
 * Exit codes:
 *   0 — warmup complete (>= 3 days), READY TO POST
 *   1 — warmup still pending
 *
 * Env overrides (for testing):
 *   WARMUP_OVERRIDE_DAYS=N — treat days_active as N
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const WARMUP_FILE = path.join(ROOT, 'workspace', 'scs001', 'warmup-status.json');
const POST_QUEUE_FILE = path.join(ROOT, 'workspace', 'scs001', 'post-queue.jsonl');
const MIN_DAYS = 3;
const MS_PER_DAY = 86_400_000;

interface PostQueueEntry {
  video_id: string;
  title?: string;
  file?: string;
  score?: string;
  added_at?: string;
  status?: string;
}

// ── score sort weight (higher = better) ────────────────────────────────────
function scoreWeight(score: string | undefined): number {
  const s = score || '?';
  if (s === '?' || s === 'N/A' || s.startsWith('-')) return 0;
  // "50%" → 50
  const n = parseFloat(s.replace('%', ''));
  return isNaN(n) ? 0 : n;
}

// ── warmup days ─────────────────────────────────────────────────────────────
function getActiveDays(): { days: number; startedAt: string | null } {
  const override = process.env.WARMUP_OVERRIDE_DAYS;
  if (override !== undefined) {
    return { days: parseInt(override, 10), startedAt: null };
  }
  if (!fs.existsSync(WARMUP_FILE)) {
    return { days: 0, startedAt: null };
  }
  const status = JSON.parse(fs.readFileSync(WARMUP_FILE, 'utf-8'));
  const daysElapsed = status.warmup_started_at
    ? Math.floor((Date.now() - new Date(status.warmup_started_at).getTime()) / MS_PER_DAY)
    : 0;
  const effectiveDays = Math.max(daysElapsed, status.days_active || 0);
  return { days: effectiveDays, startedAt: status.warmup_started_at || null };
}

// ── read + write post queue ─────────────────────────────────────────────────
function readPostQueue(): PostQueueEntry[] {
  if (!fs.existsSync(POST_QUEUE_FILE)) return [];
  return fs.readFileSync(POST_QUEUE_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean) as PostQueueEntry[];
}

function writePostQueue(entries: PostQueueEntry[]): void {
  fs.writeFileSync(POST_QUEUE_FILE, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

// ── mark posted ─────────────────────────────────────────────────────────────
function markPosted(videoId: string): void {
  const entries = readPostQueue();
  const idx = entries.findIndex(e => e.video_id === videoId);
  if (idx === -1) {
    console.error(`[go-live] ERROR: video_id "${videoId}" not found in post-queue.jsonl`);
    process.exit(1);
  }
  entries[idx].status = 'posted';
  writePostQueue(entries);
  console.log(`[go-live] ✅  Marked as posted: ${videoId}`);
  console.log(`[go-live]    Title: ${entries[idx].title || 'untitled'}`);
}

// ── display ─────────────────────────────────────────────────────────────────
function estimateCompletionDate(startedAt: string | null): string {
  if (!startedAt) return 'unknown';
  const completionTime = new Date(startedAt).getTime() + MIN_DAYS * MS_PER_DAY;
  return new Date(completionTime).toISOString().slice(0, 10);
}

function main(): void {
  // handle --mark-posted flag
  const markIdx = process.argv.indexOf('--mark-posted');
  if (markIdx !== -1) {
    const videoId = process.argv[markIdx + 1];
    if (!videoId) {
      console.error('[go-live] ERROR: --mark-posted requires a VIDEO_ID argument');
      process.exit(1);
    }
    markPosted(videoId);
    return;
  }

  const { days, startedAt } = getActiveDays();
  const allEntries = readPostQueue();
  const pending = allEntries
    .filter(e => !e.status || e.status === 'pending')
    .sort((a, b) => {
      // file-exists entries always rank above file-missing ones
      const aHasFile = a.file ? fs.existsSync(a.file) : false;
      const bHasFile = b.file ? fs.existsSync(b.file) : false;
      if (aHasFile !== bHasFile) return aHasFile ? -1 : 1;
      return scoreWeight(b.score) - scoreWeight(a.score);
    });

  const isReady = days >= MIN_DAYS;
  const line = '═'.repeat(62);

  console.log('\n' + line);
  if (isReady) {
    console.log('  ✅  READY TO POST — warmup complete');
    console.log(`  Warmup: ${days}/${MIN_DAYS} days`);
  } else {
    const eta = estimateCompletionDate(startedAt);
    console.log('  ⏳  WARMUP PENDING');
    console.log(`  Progress: ${days}/${MIN_DAYS} days  |  ETA: ${eta}`);
  }
  console.log(`  Queue: ${pending.length} pending  /  ${allEntries.length} total`);
  console.log(line);

  if (pending.length === 0) {
    console.log('\n  No pending videos in queue. Run the pipeline to generate more.\n');
  } else {
    console.log('\n  Top videos to post (sorted by score):');
    pending.slice(0, 5).forEach((v, i) => {
      const rawScore = v.score || '?';
      const score = rawScore.startsWith('-') ? 'N/A' : rawScore;
      const title = (v.title || v.video_id || 'untitled').slice(0, 55);
      const filePath = v.file || 'no file path';
      const fileExists = v.file ? fs.existsSync(v.file) : false;
      const fileStatus = v.file
        ? (fileExists ? '✅ file OK' : '⚠️  FILE MISSING')
        : '⚠️  no file';

      console.log(`\n  ${i + 1}. [${score}] ${title}`);
      console.log(`       id:   ${v.video_id}`);
      console.log(`       file: ${filePath}`);
      console.log(`             ${fileStatus}`);
    });
    console.log('');

    if (isReady) {
      console.log('  To mark a video as posted after uploading:');
      console.log(`  npx ts-node scripts/scs001/go-live.ts --mark-posted VIDEO_ID`);
      console.log('');
    }
  }

  process.exit(isReady ? 0 : 1);
}

main();
