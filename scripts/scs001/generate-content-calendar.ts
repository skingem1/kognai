#!/usr/bin/env npx ts-node
/**
 * generate-content-calendar.ts — Creates a daily posting plan for Apr 7 gate
 *
 * Reads unposted videos sorted by viral score, assigns 2/day to posting slots.
 * Output: workspace/scs001/content-calendar.json
 *
 * Usage: npx ts-node scripts/scs001/generate-content-calendar.ts [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const EXP_PATH = join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
const MANUAL_PATH = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const CALENDAR_PATH = join(ROOT, 'workspace', 'scs001', 'content-calendar.json');
const DRY_RUN = process.argv.includes('--dry-run');

const GATE_DATE = new Date('2026-04-07T00:00:00Z');
const POSTS_PER_DAY = 2;
const POSTING_SLOTS = ['12:00', '18:00'];

interface LedgerEntry {
  video_id: string;
  run_id: string;
  speaker?: string;
  topic?: string;
  [key: string]: unknown;
}

interface CalendarEntry {
  video_id: string;
  slot: string;
  viral_score: number | null;
  speaker: string;
  topic: string;
  hook_formula?: string;
}

interface Calendar {
  generated_at: string;
  gate_date: string;
  total_days: number;
  total_videos_assigned: number;
  schedule: Record<string, CalendarEntry[]>;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as T; } catch { return null; } })
    .filter(Boolean) as T[];
}

function findCaptionedMp4(videoId: string): boolean {
  const scs001Dir = join(ROOT, 'workspace', 'scs001');
  try {
    const runs = readdirSync(scs001Dir).filter(d => d.startsWith('run-'));
    for (const run of runs) {
      const mp4 = join(scs001Dir, run, 'caption', `${videoId}-captioned.mp4`);
      if (existsSync(mp4)) return true;
    }
  } catch { /* ignore */ }
  return false;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function main() {
  console.log(`📅 Content Calendar Generator${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // Load data
  const ledger = readJsonl<LedgerEntry>(LEDGER_PATH);
  const experiments = new Map<string, { partial_viral_score?: number }>();
  for (const e of readJsonl<any>(EXP_PATH)) {
    const id = e.clip_id ?? e.video_id;
    if (id) experiments.set(id, e);
  }
  const recordedIds = new Set(
    readJsonl<{ video_id: string }>(MANUAL_PATH).map(e => e.video_id).filter(Boolean)
  );

  // Find unposted videos with mp4 on disk, sorted by viral score
  const unposted = ledger
    .filter(e => !recordedIds.has(e.video_id) && findCaptionedMp4(e.video_id))
    .map(e => {
      const exp = experiments.get(e.video_id) as any;
      return {
        ...e,
        viral_score: exp?.partial_viral_score ?? null,
        speaker: exp?.speaker ?? e.speaker ?? 'unknown',
        topic: exp?.topic ?? e.topic ?? '',
        hook_formula: exp?.hook_formula ?? '',
      };
    })
    .sort((a, b) => (b.viral_score ?? -1) - (a.viral_score ?? -1));

  console.log(`📊 ${unposted.length} unposted videos with mp4 on disk`);
  console.log(`📊 ${recordedIds.size} already posted`);

  // Generate date range from today to gate
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  const cursor = new Date(today);
  while (cursor <= GATE_DATE) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  console.log(`📅 ${dates.length} days until gate (${formatDate(today)} → ${formatDate(GATE_DATE)})`);

  // Assign videos to slots
  const schedule: Record<string, CalendarEntry[]> = {};
  let videoIdx = 0;

  for (const date of dates) {
    schedule[date] = [];
    for (let slot = 0; slot < POSTS_PER_DAY && videoIdx < unposted.length; slot++) {
      const v = unposted[videoIdx++];
      schedule[date].push({
        video_id: v.video_id,
        slot: POSTING_SLOTS[slot],
        viral_score: v.viral_score,
        speaker: v.speaker ?? 'unknown',
        topic: (v.topic ?? '').slice(0, 80),
        hook_formula: v.hook_formula || undefined,
      });
    }
  }

  const totalAssigned = Object.values(schedule).reduce((sum, day) => sum + day.length, 0);

  const calendar: Calendar = {
    generated_at: new Date().toISOString(),
    gate_date: GATE_DATE.toISOString(),
    total_days: dates.length,
    total_videos_assigned: totalAssigned,
    schedule,
  };

  console.log(`\n✅ ${totalAssigned} videos assigned across ${dates.length} days`);
  console.log(`   Pace: ${POSTS_PER_DAY}/day (${POSTING_SLOTS.join(' + ')})`);

  // Show first 3 days
  const preview = dates.slice(0, 3);
  for (const date of preview) {
    const items = schedule[date];
    console.log(`\n📅 ${date}:`);
    for (const item of items) {
      const vs = item.viral_score != null ? `🧬 ${item.viral_score}` : '';
      console.log(`   ${item.slot} — ${item.video_id} ${vs} | ${item.speaker}`);
    }
  }
  if (dates.length > 3) console.log(`   ... and ${dates.length - 3} more days`);

  if (!DRY_RUN) {
    writeFileSync(CALENDAR_PATH, JSON.stringify(calendar, null, 2), 'utf-8');
    console.log(`\n📁 Written to: ${CALENDAR_PATH}`);
  } else {
    console.log('\n(dry run — no file written)');
  }
}

main();
