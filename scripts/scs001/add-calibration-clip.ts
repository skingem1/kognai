#!/usr/bin/env ts-node
// SCS-001 Calibration Set Builder
// Adds one clip at a time to workspace/scs001/calibration-set/calibration-clips.json
//
// Usage (interactive):
//   npx ts-node scripts/scs001/add-calibration-clip.ts
//
// Usage (flags):
//   npx ts-node scripts/scs001/add-calibration-clip.ts \
//     --url "https://tiktok.com/@x/video/123" \
//     --domain ai_agents \
//     --label viral \
//     --speaker "Sam Altman" \
//     --completion 74 \
//     --duration 28 \
//     --why "Bold prediction with specific timeframe" \
//     --curiosity 4 --emotion 3 --clarity 5 --insight 4 --controversy 3
//
// Other commands:
//   --list        Show all clips added so far with progress summary
//   --stats       Show domain/label breakdown
//   --delete <id> Remove a clip by clip_id

import * as readline from 'readline';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

type Domain =
  | 'ai_agents'
  | 'startup_founders'
  | 'tech_predictions'
  | 'automation_future_of_work'
  | 'web3_crypto_ai';

type Label = 'viral' | 'non_viral';

type Platform = 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'x_twitter' | 'other';

interface FiveFactorScore {
  curiosity:   number;
  emotion:     number;
  clarity:     number;
  insight:     number;
  controversy: number;
  total:       number;
}

interface CalibrationClip {
  clip_id:                  string;
  source_url:               string;
  platform:                 Platform;
  domain_tag:               Domain;
  speaker_name:             string;
  completion_rate_observed: number;
  viral_label:              Label;
  duration_seconds:         number;
  topic_summary:            string;
  why_viral_or_not:         string;
  five_factor_human_score:  FiveFactorScore;
  added_at:                 string;
}

interface CalibrationSet {
  version:    string;
  updated_at: string;
  clips:      CalibrationClip[];
}

// ── Config ───────────────────────────────────────────────────────────────────

const ROOT      = join(__dirname, '..', '..');
const OUT_DIR   = join(ROOT, 'workspace', 'scs001', 'calibration-set');
const OUT_FILE  = join(OUT_DIR, 'calibration-clips.json');
const TARGET    = 50;

const DOMAINS: Domain[] = [
  'ai_agents',
  'startup_founders',
  'tech_predictions',
  'automation_future_of_work',
  'web3_crypto_ai',
];

const DOMAIN_LABELS: Record<Domain, string> = {
  ai_agents:                  'AI Agents & Autonomous Systems',
  startup_founders:           'Startup Founders & Builder Culture',
  tech_predictions:           'Tech Predictions & Paradigm Shifts',
  automation_future_of_work:  'Automation & Future of Work',
  web3_crypto_ai:             'Web3 / Crypto x AI Intersection',
};

// ── File I/O ─────────────────────────────────────────────────────────────────

function load(): CalibrationSet {
  if (!existsSync(OUT_FILE)) {
    return { version: '1.0', updated_at: new Date().toISOString(), clips: [] };
  }
  return JSON.parse(readFileSync(OUT_FILE, 'utf8')) as CalibrationSet;
}

function save(set: CalibrationSet): void {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  set.updated_at = new Date().toISOString();
  writeFileSync(OUT_FILE, JSON.stringify(set, null, 2));
}

function nextId(set: CalibrationSet): string {
  const n = set.clips.length + 1;
  return `cal-${String(n).padStart(3, '0')}`;
}

// ── Stats / List ─────────────────────────────────────────────────────────────

function printStats(set: CalibrationSet): void {
  const clips = set.clips;
  const viral    = clips.filter(c => c.viral_label === 'viral').length;
  const nonViral = clips.filter(c => c.viral_label === 'non_viral').length;

  console.log(`\n📊 Calibration Set Progress`);
  console.log(`   Total: ${clips.length}/${TARGET} (${TARGET - clips.length} remaining)`);
  console.log(`   Viral:     ${viral}/25`);
  console.log(`   Non-viral: ${nonViral}/25`);
  console.log(`\n   By domain:`);

  DOMAINS.forEach(d => {
    const v  = clips.filter(c => c.domain_tag === d && c.viral_label === 'viral').length;
    const nv = clips.filter(c => c.domain_tag === d && c.viral_label === 'non_viral').length;
    const bar = '█'.repeat(v + nv) + '░'.repeat(10 - v - nv);
    console.log(`   ${bar} ${d.padEnd(30)} V:${v}/5  NV:${nv}/5`);
  });
  console.log('');
}

function printList(set: CalibrationSet): void {
  if (set.clips.length === 0) {
    console.log('\nNo clips added yet.\n');
    return;
  }
  console.log(`\n📋 ${set.clips.length} clips:\n`);
  set.clips.forEach(c => {
    const score = c.five_factor_human_score.total;
    const label = c.viral_label === 'viral' ? '🟢' : '🔴';
    console.log(`  ${c.clip_id} ${label} [${score}/25] ${c.domain_tag.padEnd(30)} ${c.speaker_name.padEnd(20)} ${c.source_url.substring(0, 50)}`);
  });
  console.log('');
}

// ── Platform detection ───────────────────────────────────────────────────────

function detectPlatform(url: string): Platform {
  if (url.includes('tiktok.com'))   return 'tiktok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube_shorts';
  if (url.includes('instagram.com')) return 'instagram_reels';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'x_twitter';
  return 'other';
}

// ── Suggestion helpers ───────────────────────────────────────────────────────

function suggestNeeded(set: CalibrationSet): string {
  const clips = set.clips;
  // Find domain + label combo most needed
  let best = '';
  let lowestCount = 999;
  for (const d of DOMAINS) {
    for (const l of ['viral', 'non_viral'] as Label[]) {
      const count = clips.filter(c => c.domain_tag === d && c.viral_label === l).length;
      if (count < lowestCount) {
        lowestCount = count;
        best = `${l === 'viral' ? '🟢 viral' : '🔴 non-viral'} clip in [${DOMAIN_LABELS[d]}]`;
      }
    }
  }
  return best;
}

// ── Interactive prompt ───────────────────────────────────────────────────────

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

async function promptScore(rl: readline.Interface, factor: string, description: string): Promise<number> {
  while (true) {
    const ans = await ask(rl, `  ${factor} (0-5) — ${description}: `);
    const n = parseInt(ans.trim(), 10);
    if (!isNaN(n) && n >= 0 && n <= 5) return n;
    console.log('  ⚠️  Enter a number 0-5');
  }
}

async function promptDomain(rl: readline.Interface): Promise<Domain> {
  console.log('\n  Domains:');
  DOMAINS.forEach((d, i) => console.log(`    ${i + 1}. ${DOMAIN_LABELS[d]}`));
  while (true) {
    const ans = await ask(rl, '  Domain (1-5): ');
    const n = parseInt(ans.trim(), 10);
    if (n >= 1 && n <= 5) return DOMAINS[n - 1] as Domain;
    console.log('  ⚠️  Enter 1-5');
  }
}

async function promptLabel(rl: readline.Interface): Promise<Label> {
  while (true) {
    const ans = await ask(rl, '  Label — viral or non_viral (v/n): ');
    const t = ans.trim().toLowerCase();
    if (t === 'v' || t === 'viral') return 'viral';
    if (t === 'n' || t === 'non_viral' || t === 'nv') return 'non_viral';
    console.log('  ⚠️  Enter v or n');
  }
}

async function promptNumber(rl: readline.Interface, question: string, min: number, max: number): Promise<number> {
  while (true) {
    const ans = await ask(rl, question);
    const n = parseFloat(ans.trim());
    if (!isNaN(n) && n >= min && n <= max) return n;
    console.log(`  ⚠️  Enter a number between ${min} and ${max}`);
  }
}

// ── Arg parsing ───────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string, def = ''): string {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}

function getIntArg(args: string[], flag: string, def = -1): number {
  const v = getArg(args, flag);
  const n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const set = load();

  // ── --list ────────────────────────────────────────────────────────────────
  if (args.includes('--list')) {
    printList(set);
    printStats(set);
    process.exit(0);
  }

  // ── --stats ───────────────────────────────────────────────────────────────
  if (args.includes('--stats')) {
    printStats(set);
    process.exit(0);
  }

  // ── --delete <id> ─────────────────────────────────────────────────────────
  const deleteIdx = args.indexOf('--delete');
  if (deleteIdx !== -1 && args[deleteIdx + 1]) {
    const id = args[deleteIdx + 1];
    const before = set.clips.length;
    set.clips = set.clips.filter(c => c.clip_id !== id);
    if (set.clips.length < before) {
      save(set);
      console.log(`\n✅ Deleted ${id}. ${set.clips.length} clips remaining.\n`);
    } else {
      console.log(`\n⚠️  Clip ${id} not found.\n`);
    }
    process.exit(0);
  }

  // ── Flag mode (all args provided) ─────────────────────────────────────────
  const urlArg        = getArg(args, '--url');
  const domainArg     = getArg(args, '--domain') as Domain;
  const labelArg      = getArg(args, '--label') as Label;
  const speakerArg    = getArg(args, '--speaker');
  const completionArg = getIntArg(args, '--completion');
  const durationArg   = getIntArg(args, '--duration');
  const whyArg        = getArg(args, '--why');
  const curiosity     = getIntArg(args, '--curiosity');
  const emotion       = getIntArg(args, '--emotion');
  const clarity       = getIntArg(args, '--clarity');
  const insight       = getIntArg(args, '--insight');
  const controversy   = getIntArg(args, '--controversy');

  const flagMode = urlArg && domainArg && labelArg && speakerArg &&
    completionArg !== -1 && durationArg !== -1 && whyArg &&
    curiosity !== -1 && emotion !== -1 && clarity !== -1 && insight !== -1 && controversy !== -1;

  let clip: CalibrationClip;

  if (flagMode) {
    const total = curiosity + emotion + clarity + insight + controversy;
    clip = {
      clip_id:                  nextId(set),
      source_url:               urlArg,
      platform:                 detectPlatform(urlArg),
      domain_tag:               domainArg,
      speaker_name:             speakerArg,
      completion_rate_observed: completionArg,
      viral_label:              labelArg,
      duration_seconds:         durationArg,
      topic_summary:            whyArg,
      why_viral_or_not:         whyArg,
      five_factor_human_score:  { curiosity, emotion, clarity, insight, controversy, total },
      added_at:                 new Date().toISOString(),
    };
  } else {
    // ── Interactive mode ───────────────────────────────────────────────────
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n🎬 SCS-001 Calibration Clip Builder');
    printStats(set);
    console.log(`💡 Next needed: ${suggestNeeded(set)}\n`);

    const url        = (await ask(rl, '  URL: ')).trim();
    const platform   = detectPlatform(url);
    console.log(`  Platform detected: ${platform}`);
    const domain     = await promptDomain(rl);
    const label      = await promptLabel(rl);
    const speaker    = (await ask(rl, '  Speaker name: ')).trim();
    const completion = await promptNumber(rl, '  Completion rate % (0-100): ', 0, 100);
    const duration   = await promptNumber(rl, '  Duration seconds: ', 1, 300);
    const summary    = (await ask(rl, '  Topic summary (1 sentence): ')).trim();
    const why        = (await ask(rl, '  Why viral/non-viral (your annotation): ')).trim();

    console.log('\n  5-Factor Human Score (0-5 each):');
    const c = await promptScore(rl, 'Curiosity  ', 'makes viewer want to know more?');
    const e = await promptScore(rl, 'Emotion    ', 'speaker visibly excited/frustrated?');
    const cl = await promptScore(rl, 'Clarity    ', 'understandable in 15s with no context?');
    const i = await promptScore(rl, 'Insight    ', 'original/non-obvious/surprising?');
    const co = await promptScore(rl, 'Controversy', 'challenges mainstream belief?');
    const total = c + e + cl + i + co;

    rl.close();

    clip = {
      clip_id:                  nextId(set),
      source_url:               url,
      platform,
      domain_tag:               domain,
      speaker_name:             speaker,
      completion_rate_observed: completion,
      viral_label:              label,
      duration_seconds:         duration,
      topic_summary:            summary,
      why_viral_or_not:         why,
      five_factor_human_score:  { curiosity: c, emotion: e, clarity: cl, insight: i, controversy: co, total },
      added_at:                 new Date().toISOString(),
    };
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  set.clips.push(clip);
  save(set);

  const qualified = clip.five_factor_human_score.total >= 20;
  console.log(`\n✅ Added ${clip.clip_id} — ${clip.viral_label} | ${clip.domain_tag} | score: ${clip.five_factor_human_score.total}/25 ${qualified ? '(QUALIFIED)' : '(BELOW GATE)'}`);
  console.log(`   ${set.clips.length}/${TARGET} clips total\n`);

  printStats(set);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
