#!/usr/bin/env npx ts-node
/**
 * gate-readiness-check.ts — Sprint 1312
 *
 * Lightweight daily Phase 1.5 gate progress check.
 * Reads reports/posting-health.json and workspace/gates/phase1-5-gate.json.
 * Outputs a one-line summary and writes reports/gate-readiness-check.json.
 *
 * Usage:
 *   npx ts-node scripts/scs001/gate-readiness-check.ts
 *
 * Exit codes: 0 = always (informational only)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch {}

const HEALTH_PATH = path.join(ROOT, 'reports', 'posting-health.json');
const GATE_PATH   = path.join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json');
const REPORT_PATH = path.join(ROOT, 'reports', 'gate-readiness-check.json');
const GATE_DATE   = '2026-04-07';

interface GateReport {
  generated_at: string;
  posts_done: number;
  posts_target: number;
  posts_remaining: number;
  days_left: number;
  pace_needed: number;
  on_track: boolean;
  gate_date: string;
  gate_status?: string;
  message: string;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function main() {
  let postsDone = 0;
  let postsTarget = 30;
  let daysLeft = daysUntil(GATE_DATE);

  // Read posting-health.json if available
  if (fs.existsSync(HEALTH_PATH)) {
    try {
      const health = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8'));
      // Support multiple field name conventions
      postsDone = health.posted ?? health.posts_done ?? health.gate?.posted ?? 0;
      postsTarget = health.target ?? health.posts_target ?? health.gate?.target ?? 30;
      const healthDaysLeft = health.days_left ?? health.gate?.days_left;
      if (typeof healthDaysLeft === 'number') daysLeft = healthDaysLeft;
    } catch {}
  }

  // Read phase1-5-gate.json for gate status if available
  let gateStatus: string | undefined;
  if (fs.existsSync(GATE_PATH)) {
    try {
      const gate = JSON.parse(fs.readFileSync(GATE_PATH, 'utf8'));
      gateStatus = gate.status ?? gate.gate_status;
    } catch {}
  }

  const postsRemaining = Math.max(0, postsTarget - postsDone);
  const paceNeeded = daysLeft > 0 ? Math.round((postsRemaining / daysLeft) * 10) / 10 : postsRemaining;
  const onTrack = postsRemaining === 0 || (daysLeft > 0 && paceNeeded <= 3);

  const trackLabel = postsRemaining === 0 ? 'GATE MET' : (onTrack ? 'ON TRACK' : 'BEHIND');
  const message = postsRemaining === 0
    ? `Gate complete! ${postsDone}/${postsTarget} posts done.`
    : `${postsDone}/${postsTarget} posts · ${daysLeft} days left · need ${paceNeeded}/day — ${trackLabel}`;

  const report: GateReport = {
    generated_at: new Date().toISOString(),
    posts_done: postsDone,
    posts_target: postsTarget,
    posts_remaining: postsRemaining,
    days_left: daysLeft,
    pace_needed: paceNeeded,
    on_track: onTrack,
    gate_date: GATE_DATE,
    ...(gateStatus ? { gate_status: gateStatus } : {}),
    message,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  const icon = onTrack ? '\u2713' : '\u26a0';
  console.log(`${icon} Gate: ${message}`);
  if (gateStatus) console.log(`  Gate file status: ${gateStatus}`);

  process.exit(0);
}

main();
