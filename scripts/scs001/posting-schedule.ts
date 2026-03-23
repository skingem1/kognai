/**
 * posting-schedule.ts — Sprint 830
 *
 * Generates a day-by-day posting schedule from now through the Apr 7 gate.
 * Assigns specific video IDs to time slots (2/day: 12:00 + 18:00).
 * Outputs to reports/posting-schedule.json and console.
 *
 * Usage:
 *   npx ts-node scripts/scs001/posting-schedule.ts
 *
 * Telegram: /schedule (already wired via cmdSchedule)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

const MANUAL_POSTS = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const DELIVERED_LOG = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const SCHEDULE_PATH = join(ROOT, 'reports', 'posting-schedule.json');
const GATE_DATE = new Date('2026-04-07T00:00:00Z');
const GATE_TARGET = 30;
const POST_TIMES = ['12:00', '18:00']; // 2 posts/day

function readJsonLines(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function findMp4(videoId: string): boolean {
  const dirs = [
    join(ROOT, 'workspace', 'scs001', 'ready-to-post'),
    join(ROOT, 'workspace', 'scs001', 'captioned'),
  ];
  const { readdirSync } = require('fs');
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.mp4') && f.includes(videoId)) return true;
    }
  }
  // Check multiformat outputs
  const mfDir = join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
  if (existsSync(mfDir)) {
    for (const run of readdirSync(mfDir)) {
      const outDir = join(mfDir, run, 'output');
      if (!existsSync(outDir)) continue;
      for (const f of readdirSync(outDir)) {
        if (f.endsWith('.mp4') && f.includes(videoId)) return true;
      }
    }
  }
  return false;
}

function getUnpostedVideos(): Array<{ video_id: string; viral_score: number; topic?: string }> {
  const postedIds = new Set<string>();
  for (const e of readJsonLines(MANUAL_POSTS)) {
    if (e.video_id) postedIds.add(e.video_id);
  }

  const viralScores = new Map<string, number>();
  const expPath = join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  for (const e of readJsonLines(expPath)) {
    const id = e.clip_id ?? e.video_id;
    if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
  }

  const seen = new Set<string>();
  const videos: Array<{ video_id: string; viral_score: number; topic?: string }> = [];

  // Delivered first
  for (const e of readJsonLines(DELIVERED_LOG)) {
    if (!e.video_id || postedIds.has(e.video_id) || seen.has(e.video_id)) continue;
    seen.add(e.video_id);
    videos.push({
      video_id: e.video_id,
      viral_score: e.viral_score ?? viralScores.get(e.video_id) ?? 0,
      topic: e.topic,
    });
  }

  // Ledger
  for (const e of readJsonLines(LEDGER_PATH)) {
    if (!e.video_id || postedIds.has(e.video_id) || seen.has(e.video_id)) continue;
    seen.add(e.video_id);
    videos.push({
      video_id: e.video_id,
      viral_score: viralScores.get(e.video_id) ?? 0,
      topic: e.topic,
    });
  }

  // Sort by viral score descending
  videos.sort((a, b) => b.viral_score - a.viral_score);
  return videos;
}

function main() {
  const now = new Date();
  const posted = readJsonLines(MANUAL_POSTS);
  const remaining = Math.max(0, GATE_TARGET - posted.length);
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const paceNeeded = daysLeft > 0 ? (remaining / daysLeft).toFixed(1) : 'N/A';

  const videos = getUnpostedVideos();

  console.log('=== Posting Schedule Generator ===');
  console.log(`Gate: ${posted.length}/${GATE_TARGET} posted · ${remaining} remaining`);
  console.log(`Days left: ${daysLeft} · Pace needed: ${paceNeeded}/day`);
  console.log(`Available videos: ${videos.length}`);
  console.log('');

  // Generate schedule
  const schedule: Array<{
    date: string;
    day: string;
    slots: Array<{ time: string; video_id: string | null; viral_score: number; topic?: string }>;
  }> = [];

  let videoIdx = 0;
  let assigned = 0;

  for (let d = 0; d < daysLeft && assigned < remaining; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().substring(0, 10);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

    const slots: Array<{ time: string; video_id: string | null; viral_score: number; topic?: string }> = [];

    for (const time of POST_TIMES) {
      if (assigned >= remaining) {
        slots.push({ time, video_id: null, viral_score: 0 });
        continue;
      }
      if (videoIdx < videos.length) {
        const v = videos[videoIdx++];
        slots.push({ time, video_id: v.video_id, viral_score: v.viral_score, topic: v.topic });
        assigned++;
      } else {
        slots.push({ time, video_id: null, viral_score: 0 });
      }
    }

    schedule.push({ date: dateStr, day: dayName, slots });
  }

  // Output
  const report = {
    generated_at: now.toISOString(),
    gate_date: '2026-04-07',
    gate_target: GATE_TARGET,
    posted: posted.length,
    remaining,
    days_left: daysLeft,
    pace_needed: parseFloat(paceNeeded as string) || 0,
    videos_available: videos.length,
    videos_assigned: assigned,
    coverage: assigned >= remaining ? 'FULL' : `PARTIAL (${assigned}/${remaining})`,
    schedule,
  };

  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(SCHEDULE_PATH, JSON.stringify(report, null, 2));
  console.log(`Schedule written to: ${SCHEDULE_PATH}`);
  console.log('');

  // Print readable schedule
  for (const day of schedule) {
    console.log(`📅 ${day.date} (${day.day})`);
    for (const slot of day.slots) {
      if (slot.video_id) {
        const score = slot.viral_score > 0 ? ` [${slot.viral_score.toFixed(2)}]` : '';
        const topic = slot.topic ? ` — ${slot.topic.slice(0, 40)}` : '';
        console.log(`   ${slot.time}: ${slot.video_id}${score}${topic}`);
      } else {
        console.log(`   ${slot.time}: (need more videos)`);
      }
    }
  }

  console.log('');
  if (assigned < remaining) {
    console.log(`⚠️  Only ${assigned}/${remaining} slots filled. Need ${remaining - assigned} more videos.`);
    console.log(`   Run: npx ts-node scripts/scs001/batch-produce.ts --runs ${Math.ceil((remaining - assigned) / 3)}`);
  } else {
    console.log(`✅ Full coverage: all ${remaining} slots assigned.`);
  }
}

main();
