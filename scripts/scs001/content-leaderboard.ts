// Sprint 333 — content-leaderboard.ts
// Analyzes experiments.jsonl to rank speakers and hook formulas by viral score.
//
// Usage: npx ts-node scripts/scs001/content-leaderboard.ts
// Output: reports/content-leaderboard.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const EXPERIMENTS_PATH = join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
const OUTPUT_PATH = join(ROOT, 'reports', 'content-leaderboard.json');

interface Experiment {
  clip_id: string;
  hook_formula?: string;
  speaker?: string;
  qc_passed?: boolean;
  partial_viral_score?: number;
  viral_score?: number;
}

interface RankEntry {
  name: string;
  count: number;
  avg_score: number;
  max_score: number;
  qc_rate: number;
}

export interface Leaderboard {
  generated_at: string;
  total_experiments: number;
  speakers: RankEntry[];
  hooks: RankEntry[];
  top_videos: Array<{ clip_id: string; speaker: string; hook: string; score: number }>;
}

function loadExperiments(): Experiment[] {
  if (!existsSync(EXPERIMENTS_PATH)) return [];
  return readFileSync(EXPERIMENTS_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as Experiment; } catch { return null; } })
    .filter(Boolean) as Experiment[];
}

function rankBy(experiments: Experiment[], key: 'speaker' | 'hook_formula'): RankEntry[] {
  const groups = new Map<string, { scores: number[]; qcPassed: number; total: number }>();

  for (const exp of experiments) {
    const name = exp[key] ?? 'unknown';
    if (!groups.has(name)) groups.set(name, { scores: [], qcPassed: 0, total: 0 });
    const g = groups.get(name)!;
    const score = exp.partial_viral_score ?? exp.viral_score ?? 0;
    g.scores.push(score);
    g.total++;
    if (exp.qc_passed) g.qcPassed++;
  }

  return Array.from(groups.entries())
    .map(([name, g]) => ({
      name,
      count: g.total,
      avg_score: Math.round((g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 1000) / 1000,
      max_score: Math.round(Math.max(...g.scores) * 1000) / 1000,
      qc_rate: Math.round((g.qcPassed / g.total) * 100),
    }))
    .sort((a, b) => b.avg_score - a.avg_score);
}

export function generateLeaderboard(): Leaderboard {
  const experiments = loadExperiments();

  // Deduplicate by clip_id (keep latest)
  const seen = new Set<string>();
  const unique: Experiment[] = [];
  for (let i = experiments.length - 1; i >= 0; i--) {
    if (!seen.has(experiments[i].clip_id)) {
      seen.add(experiments[i].clip_id);
      unique.push(experiments[i]);
    }
  }

  const speakers = rankBy(unique, 'speaker');
  const hooks = rankBy(unique, 'hook_formula');

  // Top 10 individual videos by score
  const top_videos = unique
    .sort((a, b) => (b.partial_viral_score ?? b.viral_score ?? 0) - (a.partial_viral_score ?? a.viral_score ?? 0))
    .slice(0, 10)
    .map(e => ({
      clip_id: e.clip_id,
      speaker: e.speaker ?? 'unknown',
      hook: e.hook_formula ?? 'unknown',
      score: e.partial_viral_score ?? e.viral_score ?? 0,
    }));

  const leaderboard: Leaderboard = {
    generated_at: new Date().toISOString(),
    total_experiments: unique.length,
    speakers,
    hooks,
    top_videos,
  };

  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(leaderboard, null, 2));
  console.log(`[leaderboard] ${unique.length} experiments, ${speakers.length} speakers, ${hooks.length} hooks`);
  console.log(`[leaderboard] Top speaker: ${speakers[0]?.name ?? 'none'} (${speakers[0]?.avg_score ?? 0})`);
  console.log(`[leaderboard] Output: ${OUTPUT_PATH}`);

  return leaderboard;
}

if (require.main === module) {
  generateLeaderboard();
}
