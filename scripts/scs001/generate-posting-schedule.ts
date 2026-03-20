// Sprint 331 — generate-posting-schedule.ts
// Generates a 7-day posting schedule from the content queue.
// Picks top unposted videos by viral score, assigns optimal posting times.
//
// Usage: npx ts-node scripts/scs001/generate-posting-schedule.ts
// Output: reports/posting-schedule.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const EXPERIMENTS_PATH = join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
const MANUAL_POSTS_PATH = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const OUTPUT_PATH = join(ROOT, 'reports', 'posting-schedule.json');

// TikTok optimal posting hours (CET/Tunisia time)
const POSTING_SLOTS = [
  { hour: 7,  label: '07:00 — Morning commute' },
  { hour: 12, label: '12:00 — Lunch break' },
  { hour: 18, label: '18:00 — After work' },
  { hour: 21, label: '21:00 — Evening scroll' },
];

const POSTS_PER_DAY = 2; // Conservative default
const SCHEDULE_DAYS = 7;

interface Experiment {
  clip_id: string;
  hook_formula?: string;
  speaker?: string;
  qc_passed?: boolean;
  partial_viral_score?: number;
  viral_score?: number;
  topic?: string;
  timestamp?: string;
}

interface ScheduleSlot {
  date: string;
  time: string;
  video_id: string;
  speaker: string;
  hook: string;
  viral_score: number;
  slot_label: string;
}

export interface PostingSchedule {
  generated_at: string;
  schedule_days: number;
  posts_per_day: number;
  total_scheduled: number;
  queue_remaining: number;
  gate_target: number;
  gate_date: string;
  posts_done: number;
  posts_needed: number;
  days_to_gate: number;
  pace_needed: number;
  slots: ScheduleSlot[];
}

function loadExperiments(): Experiment[] {
  if (!existsSync(EXPERIMENTS_PATH)) return [];
  return readFileSync(EXPERIMENTS_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as Experiment; } catch { return null; } })
    .filter(Boolean) as Experiment[];
}

function loadPostedIds(): Set<string> {
  const ids = new Set<string>();
  // Only manual-posts.jsonl tracks actually-posted TikTok videos
  // publish-ledger.jsonl is pipeline output queue, NOT actual posts
  if (existsSync(MANUAL_POSTS_PATH)) {
    readFileSync(MANUAL_POSTS_PATH, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try {
        const e = JSON.parse(l);
        if (e.video_id) ids.add(e.video_id);
        if (e.clip_id) ids.add(e.clip_id);
      } catch { /* skip */ }
    });
  }
  return ids;
}

export function generateSchedule(): PostingSchedule {
  const experiments = loadExperiments();
  const postedIds = loadPostedIds();

  // Filter to QC-passed, unposted videos and sort by viral score desc
  const candidates = experiments
    .filter(e => e.qc_passed && !postedIds.has(e.clip_id))
    .sort((a, b) => (b.partial_viral_score ?? b.viral_score ?? 0) - (a.partial_viral_score ?? a.viral_score ?? 0));

  // Deduplicate by clip_id (keep highest scored)
  const seen = new Set<string>();
  const unique = candidates.filter(e => {
    if (seen.has(e.clip_id)) return false;
    seen.add(e.clip_id);
    return true;
  });

  // Sprint 335: Diversity-aware schedule — max 3 videos per speaker per schedule
  const MAX_SPEAKER_REPEATS = 3;

  // Build 7-day schedule with speaker diversity
  const slots: ScheduleSlot[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const speakerCount = new Map<string, number>();
  let candidateIdx = 0;

  for (let day = 0; day < SCHEDULE_DAYS; day++) {
    const date = new Date(today.getTime() + day * 86_400_000);
    const dateStr = date.toISOString().slice(0, 10);
    const daySlots = POSTING_SLOTS.slice(0, POSTS_PER_DAY);

    for (const slot of daySlots) {
      // Find next video that respects speaker diversity
      let video: Experiment | null = null;
      while (candidateIdx < unique.length) {
        const candidate = unique[candidateIdx];
        const speaker = candidate.speaker ?? 'unknown';
        const count = speakerCount.get(speaker) ?? 0;
        candidateIdx++;
        if (count < MAX_SPEAKER_REPEATS) {
          video = candidate;
          speakerCount.set(speaker, count + 1);
          break;
        }
        // Skip this candidate (speaker over-represented), try next
      }
      if (!video) break;

      slots.push({
        date: dateStr,
        time: slot.label.split(' — ')[0],
        video_id: video.clip_id,
        speaker: video.speaker ?? 'unknown',
        hook: video.hook_formula ?? 'unknown',
        viral_score: video.partial_viral_score ?? video.viral_score ?? 0,
        slot_label: slot.label,
      });
    }
  }

  // Gate calculations
  const GATE_DATE = '2026-04-07';
  const daysToGate = Math.max(0, Math.ceil((new Date(GATE_DATE).getTime() - Date.now()) / 86_400_000));
  const postsDone = postedIds.size;
  const postsNeeded = Math.max(0, 30 - postsDone);
  const paceNeeded = daysToGate > 0 ? Math.ceil(postsNeeded / daysToGate * 10) / 10 : 0;

  const schedule: PostingSchedule = {
    generated_at: new Date().toISOString(),
    schedule_days: SCHEDULE_DAYS,
    posts_per_day: POSTS_PER_DAY,
    total_scheduled: slots.length,
    queue_remaining: unique.length - candidateIdx,
    gate_target: 30,
    gate_date: GATE_DATE,
    posts_done: postsDone,
    posts_needed: postsNeeded,
    days_to_gate: daysToGate,
    pace_needed: paceNeeded,
    slots,
  };

  // Write report
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(schedule, null, 2));
  console.log(`[posting-schedule] Generated ${slots.length} slots over ${SCHEDULE_DAYS} days`);
  console.log(`[posting-schedule] Gate: ${postsNeeded} posts needed in ${daysToGate} days (${paceNeeded}/day)`);
  console.log(`[posting-schedule] Output: ${OUTPUT_PATH}`);

  return schedule;
}

// CLI entry
if (require.main === module) {
  generateSchedule();
}
