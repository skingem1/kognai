#!/usr/bin/env npx ts-node
/**
 * generate-daily-report.ts — Standalone daily report aggregator
 * Sprint 491: Generates reports/swarm-runs/daily-YYYY-MM-DD.json
 * independently of swarm runs. Aggregates git activity, pipeline
 * output, and sprint progress for the day.
 *
 * Run manually: npx ts-node scripts/generate-daily-report.ts
 * Run via PM2 cron: add to ecosystem.config.js (23:55 daily)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..');

function readJSON(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function readLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// Git activity for today
function getGitActivity(date: string): { commits: number; files_changed: number; insertions: number; deletions: number; sprint_commits: string[] } {
  try {
    const log = execSync(
      `cd "${ROOT}" && git log --since="${date}T00:00:00" --until="${date}T23:59:59" --oneline 2>/dev/null`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    const commits = log ? log.split('\n').filter(l => l.trim()) : [];
    const sprintCommits = commits.filter(c => c.match(/Sprint \d+/i));

    let filesChanged = 0, insertions = 0, deletions = 0;
    try {
      const stat = execSync(
        `cd "${ROOT}" && git log --since="${date}T00:00:00" --until="${date}T23:59:59" --shortstat --oneline 2>/dev/null`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      const matches = stat.match(/(\d+) files? changed/g) || [];
      for (const m of matches) filesChanged += parseInt(m);
      const ins = stat.match(/(\d+) insertions?/g) || [];
      for (const i of ins) insertions += parseInt(i);
      const dels = stat.match(/(\d+) deletions?/g) || [];
      for (const d of dels) deletions += parseInt(d);
    } catch { /* ignore */ }

    return { commits: commits.length, files_changed: filesChanged, insertions, deletions, sprint_commits: sprintCommits };
  } catch {
    return { commits: 0, files_changed: 0, insertions: 0, deletions: 0, sprint_commits: [] };
  }
}

// Pipeline output for today
function getPipelineOutput(date: string): { videos_generated: number; videos_posted: number; total_views: number } {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));

  const todayVideos = ledger.filter((e: any) => (e.published_at ?? '').startsWith(date)).length;
  const todayPosts = posts.filter((e: any) => (e.posted_at ?? e.timestamp ?? '').startsWith(date)).length;
  const totalViews = posts.reduce((s: number, e: any) => s + (e.views ?? 0), 0);

  return { videos_generated: todayVideos, videos_posted: todayPosts, total_views: totalViews };
}

// Gate progress
function getGateProgress(): { posts: number; target_posts: number; views: number; target_views: number; days_remaining: number } {
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const totalViews = posts.reduce((s: number, e: any) => s + (e.views ?? 0), 0);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysRemaining = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));

  return { posts: posts.length, target_posts: 30, views: totalViews, target_views: 500, days_remaining: daysRemaining };
}

// Swarm runs today
function getSwarmRuns(date: string): any[] {
  const dailyPath = path.join(ROOT, 'reports', 'swarm-runs', `daily-${date}.json`);
  try { return JSON.parse(fs.readFileSync(dailyPath, 'utf-8')); }
  catch { return []; }
}

// Sprint queue status
function getQueueStatus(): { total: number; done: number; pending: number; next_sprint: number | null } {
  const queue = readJSON(path.join(ROOT, 'workspace', 'sprint-queue.json'));
  if (!queue?.queue) return { total: 0, done: 0, pending: 0, next_sprint: null };
  const items = queue.queue;
  const done = items.filter((i: any) => i.status === 'done').length;
  const pending = items.filter((i: any) => i.status === 'pending');
  return { total: items.length, done, pending: pending.length, next_sprint: pending[0]?.sprint ?? null };
}

// CMO report — check if CMO has generated any content today
function getCMOStatus(): { has_market_watch: boolean; has_weekly_plan: boolean; manifesto_ready: boolean; landing_page: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  const marketWatchExists = fs.existsSync(path.join(ROOT, 'reports', 'cmo', `market-watch-${today}.md`));
  const weeklyPlanDir = path.join(ROOT, 'reports', 'cmo');
  let hasWeeklyPlan = false;
  try {
    const files = fs.readdirSync(weeklyPlanDir);
    hasWeeklyPlan = files.some(f => f.startsWith('weekly-content-plan-'));
  } catch { /* dir missing */ }
  const manifestoExists = fs.existsSync(path.join(ROOT, 'workspace', 'launch', 'manifesto-thread.json'));
  const landingExists = fs.existsSync(path.join(ROOT, 'workspace', 'landing-page'));

  return {
    has_market_watch: marketWatchExists,
    has_weekly_plan: hasWeeklyPlan,
    manifesto_ready: manifestoExists,
    landing_page: landingExists
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const today = getToday();
const git = getGitActivity(today);
const pipeline = getPipelineOutput(today);
const gate = getGateProgress();
const swarmRuns = getSwarmRuns(today);
const queueStatus = getQueueStatus();
const cmo = getCMOStatus();

const report = {
  date: today,
  generated_at: new Date().toISOString(),
  type: 'daily-aggregate',
  git_activity: git,
  pipeline_output: pipeline,
  gate_progress: gate,
  swarm_runs: {
    count: swarmRuns.length,
    total_tokens: swarmRuns.reduce((s: number, r: any) => s + (r.total_tokens ?? 0), 0),
    total_cost_usd: swarmRuns.reduce((s: number, r: any) => s + (parseFloat(r.total_cost_usd) || 0), 0).toFixed(4)
  },
  sprint_queue: queueStatus,
  cmo_status: cmo,
  summary: {
    sprints_shipped: git.sprint_commits.length,
    sprint_names: git.sprint_commits,
    health: gate.posts >= 30 && gate.views >= 500 ? 'GREEN' :
            gate.days_remaining <= 7 && gate.posts < 20 ? 'RED' :
            gate.days_remaining <= 14 && gate.posts < 15 ? 'YELLOW' : 'AMBER'
  }
};

// Write report
const reportPath = path.join(ROOT, 'reports', 'swarm-runs', `daily-${today}.json`);

// If daily report already exists from swarm runs, merge
let existing: any[] = [];
try { existing = JSON.parse(fs.readFileSync(reportPath, 'utf-8')); } catch { /* new file */ }

// Write as aggregate object (not array) for standalone reports
if (Array.isArray(existing) && existing.length > 0) {
  // Swarm already wrote run-level data — append aggregate summary
  const combined = { swarm_runs: existing, daily_summary: report };
  fs.writeFileSync(reportPath, JSON.stringify(combined, null, 2));
  console.log(`Updated existing daily report: ${reportPath} (${existing.length} swarm run(s) + summary)`);
} else {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Created daily report: ${reportPath}`);
}

console.log(`\n=== Daily Report — ${today} ===`);
console.log(`Git: ${git.commits} commits, ${git.sprint_commits.length} sprints`);
console.log(`Pipeline: ${pipeline.videos_generated} generated, ${pipeline.videos_posted} posted`);
console.log(`Gate: ${gate.posts}/${gate.target_posts} posts, ${gate.views}/${gate.target_views} views (${gate.days_remaining}d left)`);
console.log(`Queue: ${queueStatus.pending} pending, next: Sprint ${queueStatus.next_sprint}`);
console.log(`CMO: market-watch ${cmo.has_market_watch ? '✅' : '—'}, weekly-plan ${cmo.has_weekly_plan ? '✅' : '—'}, manifesto ${cmo.manifesto_ready ? '✅' : '—'}`);
console.log(`Health: ${report.summary.health}`);
console.log(`\n✅ PASS — Daily report generated`);
