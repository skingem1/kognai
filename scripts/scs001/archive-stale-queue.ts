/**
 * Sprint 1002: Content Freshness Decay Archiver
 * - Stamps pending queue items with created_at if missing
 * - Archives pending items older than STALE_DAYS to archived-queue.jsonl
 * - Marks them stale-archived in sprint-queue.json
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const QUEUE_PATH = path.join(ROOT, 'workspace/sprint-queue.json');
const ARCHIVE_PATH = path.join(ROOT, 'workspace/scs001/archived-queue.jsonl');
const STALE_DAYS = parseInt(process.env.STALE_DAYS ?? '7', 10);

interface QueueItem {
  sprint: number | string;
  title: string;
  block: string;
  status: string;
  priority?: string;
  rationale?: string;
  created_at?: string;
  _note?: string;
  [key: string]: unknown;
}

interface QueueFile {
  queue: QueueItem[];
  updated?: string;
  [key: string]: unknown;
}

function daysDiff(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60 * 24);
}

function appendToArchive(item: QueueItem): void {
  const line = JSON.stringify({ ...item, archived_at: new Date().toISOString() }) + '\n';
  fs.appendFileSync(ARCHIVE_PATH, line, 'utf8');
}

function main(): void {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.log('[archiver] sprint-queue.json not found — nothing to do');
    return;
  }

  const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
  const qf: QueueFile = JSON.parse(raw);
  const today = new Date().toISOString().split('T')[0];

  let stamped = 0;
  let archived = 0;

  for (const item of qf.queue) {
    if (item.status !== 'pending') continue;

    // Stamp items without created_at
    if (!item.created_at) {
      item.created_at = today;
      stamped++;
      continue; // Don't archive on first stamp — give it a full cycle
    }

    // Archive items older than STALE_DAYS
    if (daysDiff(item.created_at) >= STALE_DAYS) {
      const reason = `stale after ${STALE_DAYS} days (created ${item.created_at})`;
      item.status = 'stale-archived';
      item._note = `Auto-archived ${today}: ${reason}`;
      appendToArchive(item);
      archived++;
      console.log(`[archiver] archived sprint-${item.sprint}: ${item.title.slice(0, 60)}...`);
    }
  }

  qf.updated = new Date().toISOString().slice(0, 16);
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(qf, null, 2));

  console.log(`[archiver] done — stamped=${stamped} archived=${archived} stale_days=${STALE_DAYS}`);
  if (archived > 0) {
    console.log(`[archiver] archive → ${ARCHIVE_PATH}`);
  }
}

main();
