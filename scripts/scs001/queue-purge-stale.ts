/**
 * queue-purge-stale.ts — Sprint 1465
 * Remove pending post-queue entries whose video file no longer exists on disk.
 * Never removes entries that are posted, skipped, or have no file field.
 *
 * Usage: npx ts-node scripts/scs001/queue-purge-stale.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const QUEUE_FILE = path.join(ROOT, 'workspace', 'scs001', 'post-queue.jsonl');
const DRY_RUN = process.argv.includes('--dry-run');

if (!fs.existsSync(QUEUE_FILE)) {
  console.log('[queue-purge-stale] No post-queue.jsonl — nothing to do');
  process.exit(0);
}

const lines = fs.readFileSync(QUEUE_FILE, 'utf-8').split('\n').filter(Boolean);
const kept: string[] = [];
const removed: string[] = [];

for (const line of lines) {
  let entry: any;
  try { entry = JSON.parse(line); }
  catch { kept.push(line); continue; }

  // Only purge pending entries with a file field that doesn't exist
  const isPending = !entry.status || entry.status === 'pending';
  const hasFile = typeof entry.file === 'string' && entry.file.length > 0;
  const fileMissing = hasFile && !fs.existsSync(entry.file);

  if (isPending && fileMissing) {
    removed.push(`  - [${entry.score || '?'}] ${entry.video_id} — ${(entry.title || 'untitled').slice(0, 60)}`);
  } else {
    kept.push(line);
  }
}

console.log(`[queue-purge-stale] Scanned ${lines.length} entries`);
console.log(`[queue-purge-stale] Stale (pending + file missing): ${removed.length}`);
removed.forEach(r => console.log(r));

if (removed.length === 0) {
  console.log('[queue-purge-stale] Queue is clean — nothing to remove');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('[queue-purge-stale] DRY RUN — no changes written');
  process.exit(0);
}

fs.writeFileSync(QUEUE_FILE, kept.join('\n') + '\n');
console.log(`[queue-purge-stale] Kept ${kept.length}, removed ${removed.length} stale entries`);
console.log('[queue-purge-stale] DONE');
