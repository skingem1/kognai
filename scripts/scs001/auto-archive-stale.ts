/**
 * auto-archive-stale.ts — Sprint 599
 * Scans publish-ledger.jsonl for unposted videos older than STALE_DAYS (default 7).
 * Archives them so the queue only shows fresh content.
 *
 * Usage: npx ts-node scripts/scs001/auto-archive-stale.ts
 * Dry-run: ARCHIVE_DRY_RUN=1 npx ts-node scripts/scs001/auto-archive-stale.ts
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const MANUAL_PATH = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const ARCHIVE_PATH = join(ROOT, 'workspace', 'scs001', 'archived-videos.json');

const STALE_DAYS = parseInt(process.env.STALE_DAYS || '7', 10);
const DRY_RUN = process.env.ARCHIVE_DRY_RUN === '1';

function readLines(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function loadArchived(): Set<string> {
  if (!existsSync(ARCHIVE_PATH)) return new Set();
  try {
    const data = JSON.parse(readFileSync(ARCHIVE_PATH, 'utf-8'));
    return new Set(Array.isArray(data.ids) ? data.ids : []);
  } catch { return new Set(); }
}

function saveArchived(ids: Set<string>): void {
  writeFileSync(ARCHIVE_PATH, JSON.stringify({
    ids: Array.from(ids),
    updated_at: new Date().toISOString(),
    count: ids.size,
  }, null, 2), 'utf-8');
}

function main(): void {
  console.log(`\n=== Content Freshness Decay — Auto-Archive ===`);
  console.log(`Stale threshold: ${STALE_DAYS} days\n`);

  const ledger = readLines(LEDGER_PATH);
  const manual = readLines(MANUAL_PATH);
  const postedIds = new Set(manual.map((e: any) => e.video_id).filter(Boolean));
  const archived = loadArchived();

  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();
  let newlyArchived = 0;

  for (const entry of ledger) {
    const id = entry.video_id;
    if (!id) continue;
    if (postedIds.has(id)) continue; // Already posted
    if (archived.has(id)) continue; // Already archived

    const publishedAt = entry.published_at || entry.created_at || '';
    if (!publishedAt || publishedAt < cutoff) {
      archived.add(id);
      newlyArchived++;
      console.log(`📦 Archived: ${id} (${publishedAt || 'no date'})`);
    }
  }

  console.log(`\nTotal in ledger: ${ledger.length}`);
  console.log(`Already posted: ${postedIds.size}`);
  console.log(`Previously archived: ${archived.size - newlyArchived}`);
  console.log(`Newly archived: ${newlyArchived}`);
  console.log(`Total archived: ${archived.size}`);

  if (newlyArchived === 0) {
    console.log('\n✅ No stale items to archive.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] Would archive — not writing to file.');
    return;
  }

  saveArchived(archived);
  console.log(`\n✅ Archived ${newlyArchived} stale videos. Total: ${archived.size}`);
}

export { main as autoArchiveStale };

main();
