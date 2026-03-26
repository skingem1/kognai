/**
 * repair-post-queue-scores.ts — Sprint 1461
 * One-time repair: replaces invalid score values (e.g. "-100%") in post-queue.jsonl with "N/A".
 * Cause: multiformat backfill added entries with negative viral_score * 100 as string.
 * Usage: npx ts-node scripts/scs001/repair-post-queue-scores.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const QUEUE_FILE = path.join(ROOT, 'workspace', 'scs001', 'post-queue.jsonl');
const DRY_RUN = process.argv.includes('--dry-run');

function isInvalidScore(score: unknown): boolean {
  if (typeof score !== 'string') return false;
  if (score === '?' || score === 'N/A') return false;
  // Negative percentage e.g. "-100%", "-50%"
  if (score.startsWith('-')) return true;
  return false;
}

if (!fs.existsSync(QUEUE_FILE)) {
  console.log('No post-queue.jsonl found — nothing to repair');
  process.exit(0);
}

const lines = fs.readFileSync(QUEUE_FILE, 'utf-8').split('\n').filter(Boolean);
let fixed = 0;

const repaired = lines.map(line => {
  try {
    const entry = JSON.parse(line);
    if (isInvalidScore(entry.score)) {
      entry.score = 'N/A';
      fixed++;
    }
    return JSON.stringify(entry);
  } catch {
    return line;
  }
});

console.log(`[repair-post-queue-scores] ${lines.length} entries scanned, ${fixed} fixed`);

if (DRY_RUN) {
  console.log('[repair-post-queue-scores] DRY RUN — no changes written');
} else {
  fs.writeFileSync(QUEUE_FILE, repaired.join('\n') + '\n');
  console.log('[repair-post-queue-scores] Written to post-queue.jsonl');
}

if (fixed > 0) console.log(`[repair-post-queue-scores] Sample fixed entry: ${repaired.find(l => l.includes('"N/A"'))?.slice(0, 80)}`);
console.log('[repair-post-queue-scores] DONE');
