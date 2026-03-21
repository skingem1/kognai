/**
 * auto-archive-stale.ts — Sprint 599, extended Sprint 675
 * Scans publish-ledger.jsonl, viral-topics.json, content-calendar.json,
 * and topic-radar/ for stale items older than STALE_DAYS (default 7).
 * Archives them so the queue only shows fresh content.
 *
 * Usage: npx ts-node scripts/scs001/auto-archive-stale.ts
 * Dry-run: ARCHIVE_DRY_RUN=1 npx ts-node scripts/scs001/auto-archive-stale.ts
 * Report only: npx ts-node scripts/scs001/auto-archive-stale.ts --report
 */

import { readFileSync, existsSync, writeFileSync, readdirSync, renameSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const SCS_DIR = join(ROOT, 'workspace', 'scs001');
const LEDGER_PATH = join(SCS_DIR, 'publish-ledger.jsonl');
const MANUAL_PATH = join(SCS_DIR, 'manual-posts.jsonl');
const ARCHIVE_PATH = join(SCS_DIR, 'archived-videos.json');
const VIRAL_TOPICS_PATH = join(SCS_DIR, 'viral-topics.json');
const CALENDAR_PATH = join(SCS_DIR, 'content-calendar.json');
const RADAR_DIR = join(SCS_DIR, 'topic-radar');
const RADAR_ARCHIVE_DIR = join(SCS_DIR, 'topic-radar', 'archived');

const STALE_DAYS = parseInt(process.env.STALE_DAYS || '7', 10);
const DRY_RUN = process.env.ARCHIVE_DRY_RUN === '1';
const REPORT_ONLY = process.argv.includes('--report');

interface FreshnessReport {
  ledger: { total: number; stale: number; archived: number };
  viralTopics: { total: number; stale: number; kept: number };
  calendar: { total: number; stale: number; kept: number };
  radar: { total: number; stale: number; archived: number };
}

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

function archiveLedger(cutoff: string, archived: Set<string>): number {
  const ledger = readLines(LEDGER_PATH);
  const manual = readLines(MANUAL_PATH);
  const postedIds = new Set(manual.map((e: any) => e.video_id).filter(Boolean));
  let count = 0;

  for (const entry of ledger) {
    const id = entry.video_id;
    if (!id || postedIds.has(id) || archived.has(id)) continue;
    const ts = entry.published_at || entry.created_at || '';
    if (!ts || ts < cutoff) {
      archived.add(id);
      count++;
      if (!REPORT_ONLY) console.log(`  ledger: ${id} (${ts || 'no date'})`);
    }
  }
  return count;
}

function archiveViralTopics(cutoff: string): { stale: number; total: number } {
  if (!existsSync(VIRAL_TOPICS_PATH)) return { stale: 0, total: 0 };
  try {
    const data = JSON.parse(readFileSync(VIRAL_TOPICS_PATH, 'utf-8'));
    const trending: any[] = Array.isArray(data.trending) ? data.trending : [];
    const total = trending.length;
    const fresh = trending.filter((t: any) => {
      const ts = t.collected_at || t.created_at || '';
      return ts >= cutoff;
    });
    const stale = total - fresh.length;

    if (stale > 0 && !DRY_RUN && !REPORT_ONLY) {
      data.trending = fresh;
      data.archived_count = (data.archived_count || 0) + stale;
      data.last_cleanup = new Date().toISOString();
      writeFileSync(VIRAL_TOPICS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    }
    return { stale, total };
  } catch { return { stale: 0, total: 0 }; }
}

function archiveCalendar(cutoff: string): { stale: number; total: number } {
  if (!existsSync(CALENDAR_PATH)) return { stale: 0, total: 0 };
  try {
    const data = JSON.parse(readFileSync(CALENDAR_PATH, 'utf-8'));
    const schedule: Record<string, any[]> = data.schedule || {};
    const cutoffDate = cutoff.slice(0, 10); // YYYY-MM-DD
    let stale = 0;
    let total = 0;

    const freshSchedule: Record<string, any[]> = {};
    for (const [date, items] of Object.entries(schedule)) {
      total += items.length;
      if (date >= cutoffDate) {
        freshSchedule[date] = items;
      } else {
        stale += items.length;
        if (!REPORT_ONLY) console.log(`  calendar: ${date} — ${items.length} items stale`);
      }
    }

    if (stale > 0 && !DRY_RUN && !REPORT_ONLY) {
      data.schedule = freshSchedule;
      data.total_videos_assigned = Object.values(freshSchedule).reduce((s, v) => s + v.length, 0);
      data.last_cleanup = new Date().toISOString();
      writeFileSync(CALENDAR_PATH, JSON.stringify(data, null, 2), 'utf-8');
    }
    return { stale, total };
  } catch { return { stale: 0, total: 0 }; }
}

function archiveRadarFiles(cutoff: string): { stale: number; total: number } {
  if (!existsSync(RADAR_DIR)) return { stale: 0, total: 0 };
  const files = readdirSync(RADAR_DIR).filter(f => f.startsWith('radar-') && f.endsWith('.json'));
  const total = files.length;
  let stale = 0;

  // Extract date from filename: radar-YYYYMMDDTHH-hash.json
  const cutoffCompact = cutoff.slice(0, 10).replace(/-/g, '');

  for (const file of files) {
    const match = file.match(/^radar-(\d{8})T/);
    if (!match) continue;
    const fileDate = match[1];
    if (fileDate < cutoffCompact) {
      stale++;
      if (!DRY_RUN && !REPORT_ONLY) {
        if (!existsSync(RADAR_ARCHIVE_DIR)) mkdirSync(RADAR_ARCHIVE_DIR, { recursive: true });
        renameSync(join(RADAR_DIR, file), join(RADAR_ARCHIVE_DIR, file));
        console.log(`  radar: ${file} -> archived/`);
      }
    }
  }
  return { stale, total };
}

function main(): void {
  const mode = REPORT_ONLY ? 'REPORT' : DRY_RUN ? 'DRY-RUN' : 'LIVE';
  console.log(`\n=== Content Freshness Decay — Auto-Archive (${mode}) ===`);
  console.log(`Stale threshold: ${STALE_DAYS} days\n`);

  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();
  const archived = loadArchived();
  const prevSize = archived.size;

  // 1. Ledger
  const ledgerStale = archiveLedger(cutoff, archived);
  console.log(`[Ledger] ${ledgerStale} stale videos archived`);

  // 2. Viral topics
  const vt = archiveViralTopics(cutoff);
  console.log(`[Viral Topics] ${vt.stale}/${vt.total} stale topics removed`);

  // 3. Content calendar
  const cal = archiveCalendar(cutoff);
  console.log(`[Calendar] ${cal.stale}/${cal.total} stale schedule entries removed`);

  // 4. Topic radar files
  const radar = archiveRadarFiles(cutoff);
  console.log(`[Radar] ${radar.stale}/${radar.total} stale radar files archived`);

  // Summary
  const totalStale = ledgerStale + vt.stale + cal.stale + radar.stale;
  console.log(`\n--- Summary ---`);
  console.log(`Total stale items: ${totalStale}`);
  console.log(`Archived video IDs: ${archived.size} (was ${prevSize})`);

  if (totalStale === 0) {
    console.log('\nAll content is fresh.');
    return;
  }

  if (REPORT_ONLY) {
    console.log('\n[report] No changes made.');
    return;
  }
  if (DRY_RUN) {
    console.log('\n[dry-run] Would archive — not writing to file.');
    return;
  }

  saveArchived(archived);
  console.log(`\nFreshness cleanup complete.`);
}

export { main as autoArchiveStale };

main();
