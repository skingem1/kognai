/**
 * check-ready.ts — Sprint 1457
 * Daily go-live readiness check for SCS-001 TikTok pipeline.
 *
 * Usage: npx ts-node scripts/scs001/check-ready.ts
 *
 * Exit codes:
 *   0 — warmup complete (>= 3 days), ready to post
 *   1 — warmup still pending
 *
 * Env overrides (for testing):
 *   WARMUP_OVERRIDE_DAYS=N — treat days_active as N (bypasses file read)
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
  score?: string;
  file?: string;
  status?: string;
}

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
  // Persist updated value if higher (mirrors Sprint 1456 fix)
  if (effectiveDays > (status.days_active || 0) && !override) {
    status.days_active = effectiveDays;
    fs.writeFileSync(WARMUP_FILE, JSON.stringify(status, null, 2));
  }
  return { days: effectiveDays, startedAt: status.warmup_started_at || null };
}

function readPostQueue(): PostQueueEntry[] {
  if (!fs.existsSync(POST_QUEUE_FILE)) return [];
  return fs.readFileSync(POST_QUEUE_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean) as PostQueueEntry[];
}

function estimateCompletionDate(startedAt: string | null, days: number): string {
  if (!startedAt) return 'unknown';
  const start = new Date(startedAt).getTime();
  const completionTime = start + MIN_DAYS * MS_PER_DAY;
  return new Date(completionTime).toISOString().slice(0, 10);
}

function main(): void {
  const { days, startedAt } = getActiveDays();
  const allEntries = readPostQueue();
  const pending = allEntries.filter(e => !e.status || e.status === 'pending');
  const isReady = days >= MIN_DAYS;

  const line = '═'.repeat(60);
  console.log('\n' + line);

  if (isReady) {
    console.log('  ✅  READY TO POST');
    console.log(`  Warmup: ${days}/${MIN_DAYS} days complete`);
  } else {
    const eta = estimateCompletionDate(startedAt, days);
    console.log('  ⏳  WARMUP PENDING');
    console.log(`  Progress: ${days}/${MIN_DAYS} days  |  ETA: ${eta}`);
  }

  console.log(`  Post queue: ${pending.length} videos pending`);
  console.log(line);

  if (pending.length > 0) {
    console.log('\n  Next videos to post:');
    pending.slice(0, 5).forEach((v, i) => {
      // Normalize invalid scores (e.g. "-100%" from multiformat backfill bug)
      const rawScore = v.score || '?';
      const score = rawScore.startsWith('-') ? 'N/A' : rawScore;
      const title = (v.title || v.video_id || 'untitled').slice(0, 55);
      const filePart = v.file ? path.basename(v.file) : 'no file';
      console.log(`  ${i + 1}. [${score}] ${title}`);
      console.log(`       ${filePart}`);
    });
  }

  console.log('');
  process.exit(isReady ? 0 : 1);
}

main();
