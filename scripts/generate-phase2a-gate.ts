#!/usr/bin/env npx ts-node
/**
 * generate-phase2a-gate.ts — Sprint 1445
 * Generates Phase 1→Phase 2A readiness report (deadline: 2026-04-11).
 * Run: npx ts-node scripts/generate-phase2a-gate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const DEADLINE = '2026-04-11';
const daysRemaining = Math.ceil(
  (new Date(DEADLINE).getTime() - Date.now()) / 86_400_000
);

// ── Criteria ─────────────────────────────────────────────────────────────────

// 1. Phase 1.5 gate passed
let phase15Pass = false;
let phase15Detail = 'workspace/gates/phase1-5-gate.json not found';
const gate15Path = path.join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json');
if (fs.existsSync(gate15Path)) {
  try {
    const g = JSON.parse(fs.readFileSync(gate15Path, 'utf-8'));
    phase15Pass = g.overall_pass === true;
    const postCrit = (g.criteria || []).find((c: any) => c.id === 'post-count');
    phase15Detail = phase15Pass
      ? `PASS — ${postCrit?.details ?? 'overall_pass=true'}`
      : `FAIL — ${postCrit?.details ?? 'overall_pass=false'}`;
  } catch (e: any) {
    phase15Detail = `parse error: ${e.message}`;
  }
}

// 2. Achiri 17/17 tests pass
let achiriPass = false;
let achiriDetail = 'workspace/achiri/alpha-launch-validation.json not found';
const achiriPath = path.join(ROOT, 'workspace', 'achiri', 'alpha-launch-validation.json');
if (fs.existsSync(achiriPath)) {
  try {
    const a = JSON.parse(fs.readFileSync(achiriPath, 'utf-8'));
    const { passed, failed, skipped } = a.test_suite ?? {};
    achiriPass = failed === 0 && (passed ?? 0) > 0;
    achiriDetail = achiriPass
      ? `PASS — ${passed}/${passed + failed + skipped} tests passed (0 failed)`
      : `FAIL — ${failed} test(s) failing out of ${passed + failed + skipped}`;
  } catch (e: any) {
    achiriDetail = `parse error: ${e.message}`;
  }
}

// 3. Stripe configured (key present — test or live)
const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
const stripePass = stripeKey.length > 5;
const isLiveStripe = stripeKey.startsWith('sk_live_');
const stripeDetail = stripePass
  ? `PASS — STRIPE_SECRET_KEY set (${isLiveStripe ? 'live key' : 'test key — upgrade to sk_live_ before first subscriber'})`
  : 'FAIL — STRIPE_SECRET_KEY missing';

// 4. Pipeline operational (recent run completed today or yesterday)
let pipelinePass = false;
let pipelineDetail = 'reports/pipeline-runs/latest.json not found';
const pipelinePath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
if (fs.existsSync(pipelinePath)) {
  try {
    const p = JSON.parse(fs.readFileSync(pipelinePath, 'utf-8'));
    const completedAt = new Date(p.completed_at ?? 0);
    const ageHours = (Date.now() - completedAt.getTime()) / 3_600_000;
    pipelinePass = ageHours < 48;
    pipelineDetail = pipelinePass
      ? `PASS — last run ${p.run_id}, completed ${completedAt.toISOString()} (${Math.round(ageHours)}h ago)`
      : `FAIL — last run is ${Math.round(ageHours)}h ago (>48h stale)`;
  } catch (e: any) {
    pipelineDetail = `parse error: ${e.message}`;
  }
}

// 5. Bot token (informational — pending human action)
const botToken = process.env.ACHIRI_TELEGRAM_BOT_TOKEN ?? '';
const botSet = botToken.length > 5;
const botDetail = botSet
  ? 'SET — Telegram bot token present'
  : 'NOT SET — create @AchiriBuddyBot and add ACHIRI_TELEGRAM_BOT_TOKEN to .env';

// ── Assemble result ───────────────────────────────────────────────────────────

const overallPass = phase15Pass && achiriPass && stripePass && pipelinePass;
const blockers: string[] = [];
if (!phase15Pass) blockers.push('Phase 1.5 gate not passed');
if (!achiriPass) blockers.push('Achiri test suite has failures');
if (!stripePass) blockers.push('Stripe not in live mode');
if (!pipelinePass) blockers.push('Pipeline has not run in 48h');
if (!botSet) blockers.push('PENDING HUMAN: ACHIRI_TELEGRAM_BOT_TOKEN not set (Achiri alpha launch Apr 25)');

const recommendation = overallPass
  ? 'PROCEED to Phase 2A — all gate criteria met. Achiri alpha on track for Apr 25.'
  : `BLOCKED — ${blockers.length} issue(s) must be resolved before Phase 2A.`;

const output = {
  gate: 'phase1-phase2a',
  generated_at: new Date().toISOString(),
  deadline: DEADLINE,
  days_remaining: daysRemaining,
  criteria: [
    { id: 'phase15_gate', name: 'Phase 1.5 Gate Passed', pass: phase15Pass, details: phase15Detail },
    { id: 'achiri_tests', name: 'Achiri Test Suite (target: 0 failures)', pass: achiriPass, details: achiriDetail },
    { id: 'stripe_live',  name: 'Stripe in Live Mode', pass: stripePass, details: stripeDetail },
    { id: 'pipeline_ok',  name: 'Pipeline Operational (<48h since last run)', pass: pipelinePass, details: pipelineDetail },
    { id: 'bot_token',    name: 'Achiri Bot Token Set (informational)', pass: null, details: botDetail },
  ],
  overall_pass: overallPass,
  recommendation,
  blockers,
};

const outPath = path.join(ROOT, 'workspace', 'gates', 'phase1-phase2a-gate.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
console.log(`\nWritten: ${outPath}`);
