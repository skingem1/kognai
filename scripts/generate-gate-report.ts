#!/usr/bin/env npx ts-node
/**
 * generate-gate-report.ts — Sprint 495
 * Generates formal Phase 1.5 gate report (April 7, 2026).
 * Run on gate day: npx ts-node scripts/generate-gate-report.ts
 * Run anytime for preview: same command (uses current data)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

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

// ── Criteria Assessment ──────────────────────────────────────────────────────

// 1. Post count
const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
const postCount = posts.length;
const postTarget = 30;
const postPass = postCount >= postTarget;

// 2. View count
const totalViews = posts.reduce((s: number, e: any) => s + (e.views ?? 0), 0);
const viewTarget = 500;
const viewPass = totalViews >= viewTarget;
const avgViews = postCount > 0 ? Math.round(totalViews / postCount) : 0;

// 3. Pipeline operational
const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
const pipelinePass = ledger.length >= 10;

// 4. Monetization ready
const stripeReady = !!process.env.STRIPE_SECRET_KEY;

// 5. System health
let smokeTestResult = 'unknown';
try {
  const smokeData = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'smoke-test-latest.json'), 'utf-8'));
  smokeTestResult = `${smokeData.pass}/${smokeData.total} pass`;
} catch { smokeTestResult = 'no recent test'; }

// 6. Git stats
let commitCount = 0;
try {
  commitCount = parseInt(execSync(`cd "${ROOT}" && git rev-list --count HEAD`, { encoding: 'utf-8', timeout: 5000 }).trim());
} catch { /* ignore */ }

// ── Kill Switch Check ────────────────────────────────────────────────────────

const killSwitchTriggered = (postCount >= 30 && totalViews < 500)
  ? 'TRIGGERED — <500 views with 30+ posts'
  : 'NOT TRIGGERED';

// ── Gate Decision ────────────────────────────────────────────────────────────

const criteriaResults = [
  { id: 'post-count', name: '30 TikTok Posts', target: postTarget, actual: postCount, pass: postPass },
  { id: 'total-views', name: '500 Total Views', target: viewTarget, actual: totalViews, pass: viewPass, avg_per_post: avgViews },
  { id: 'pipeline-operational', name: 'Pipeline Producing Videos', target: '10+ in ledger', actual: ledger.length, pass: pipelinePass },
  { id: 'monetization-ready', name: 'Stripe Configured', target: 'STRIPE_SECRET_KEY set', actual: stripeReady ? 'SET' : 'NOT SET', pass: stripeReady },
];

const criteriaPassed = criteriaResults.filter(c => c.pass).length;
const overallPass = postPass && viewPass && pipelinePass;

const gateDate = new Date('2026-04-07T00:00:00Z');
const daysUntil = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));
const isGateDay = daysUntil === 0;

const report = {
  report_id: 'phase-1.5-gate-report',
  gate_name: 'Phase 1.5 Decision Gate',
  gate_date: '2026-04-07',
  generated_at: new Date().toISOString(),
  is_gate_day: isGateDay,
  days_until_gate: daysUntil,
  overall_status: overallPass ? 'PASS' : 'FAIL',
  criteria_passed: `${criteriaPassed}/${criteriaResults.length}`,
  criteria: criteriaResults,
  kill_switch: killSwitchTriggered,
  system_health: {
    smoke_test: smokeTestResult,
    commits: commitCount,
    pipeline_videos: ledger.length,
    agents: 44,
    sprints_shipped: '487+',
  },
  decision: overallPass
    ? 'PROCEED — Gate criteria met. Advance to Phase 2 planning. Launch window: April 8-15.'
    : `HOLD — ${4 - criteriaPassed} criteria not met. ${daysUntil > 0 ? `${daysUntil} days remaining to remediate.` : 'Gate day reached. Generate revised timeline.'}`,
  next_actions: overallPass
    ? ['Execute launch plan (Launch Strategy v1.0)', 'Begin Phase 2 sprint planning', 'Activate X ads campaign']
    : ['Review remediation plan (workspace/gates/remediation-plan.json)', 'Prioritize posting', 'Re-run this report daily until gate day'],
  top_performers: posts
    .sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 5)
    .map((p: any) => ({ video_id: p.video_id, views: p.views ?? 0, posted_at: p.posted_at ?? p.timestamp })),
};

// Write report
const reportPath = path.join(ROOT, 'workspace', 'gates', 'april-7-gate.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

// Console output
console.log(`\n=== Phase 1.5 Gate Report ===`);
console.log(`Gate date: April 7, 2026 (${daysUntil} days away)`);
console.log(`Overall: ${report.overall_status}`);
console.log(`\nCriteria:`);
for (const c of criteriaResults) {
  const icon = c.pass ? '✅' : '❌';
  console.log(`  ${icon} ${c.name}: ${c.actual}/${c.target}`);
}
console.log(`\nKill switch: ${killSwitchTriggered}`);
console.log(`Decision: ${report.decision}`);
console.log(`\nReport: workspace/gates/april-7-gate.json`);
console.log(`\n✅ Gate report generated`);
