#!/usr/bin/env npx ts-node
/**
 * posting-preflight.ts — Sprint 311
 * Phase 1 Go-Live Preflight Checker.
 *
 * Validates all prerequisites for TikTok posting:
 * - Required env vars (TIKTOK_ACCESS_TOKEN, TIKTOK_CLIENT_KEY, etc.)
 * - Queued videos in publish-ledger.jsonl
 * - Gate status (days remaining, posts needed)
 * - Stripe readiness
 *
 * Usage: npx ts-node scripts/scs001/posting-preflight.ts
 * Exit 0 = all checks pass, Exit 1 = blockers found
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { isWarmupComplete, loadWarmupStatus } from './verify-warmup-signal';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD = process.cwd();
const LEDGER_PATH = join(CWD, 'workspace', 'scs001', 'publish-ledger.jsonl');
const MANUAL_POSTS_PATH = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const GATE_PATH = join(CWD, 'workspace', 'gates', 'phase1-5-gate.json');

interface Check {
  name: string;
  pass: boolean;
  detail: string;
  blocker: boolean; // true = blocks posting, false = warning only
}

function countJsonlLines(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf-8').split('\n').filter(l => l.trim()).length;
}

function runChecks(): Check[] {
  const checks: Check[] = [];

  // Warmup gate (Sprint 783) — must complete before any posting
  const warmupDone = isWarmupComplete();
  const warmupStatus = loadWarmupStatus();
  checks.push({
    name: 'TikTok warmup',
    pass: warmupDone,
    detail: warmupDone
      ? `Verified ${warmupStatus?.verified_at?.slice(0, 10)} (${warmupStatus?.days_active}d, alignment ${warmupStatus?.niche_alignment}/10)`
      : 'NOT COMPLETE — run /warmup-start then /warmup-complete after 3 days of scrolling',
    blocker: !warmupDone,
  });

  // Env var checks
  const envChecks: Array<{ name: string; key: string; blocker: boolean }> = [
    { name: 'TikTok Access Token', key: 'TIKTOK_ACCESS_TOKEN', blocker: true },
    { name: 'TikTok Client Key', key: 'TIKTOK_CLIENT_KEY', blocker: true },
    { name: 'TikTok Client Secret', key: 'TIKTOK_CLIENT_SECRET', blocker: true },
    { name: 'Supabase URL', key: 'SUPABASE_URL', blocker: true },
    { name: 'Supabase Service Key', key: 'SUPABASE_SERVICE_KEY', blocker: true },
    { name: 'Telegram Bot Token', key: 'TELEGRAM_BOT_TOKEN', blocker: false },
    { name: 'Owner Chat ID', key: 'OWNER_TELEGRAM_CHAT_ID', blocker: false },
    { name: 'Stripe Secret Key', key: 'STRIPE_SECRET_KEY', blocker: false },
  ];

  for (const { name, key, blocker } of envChecks) {
    const val = process.env[key];
    checks.push({
      name,
      pass: !!val,
      detail: val ? 'SET' : 'MISSING — set in .env',
      blocker: blocker && !val,
    });
  }

  // Queued videos
  const queuedVideos = countJsonlLines(LEDGER_PATH);
  const postedVideos = countJsonlLines(MANUAL_POSTS_PATH);
  checks.push({
    name: 'Queued videos (publish-ledger)',
    pass: queuedVideos > 0,
    detail: `${queuedVideos} videos in queue`,
    blocker: queuedVideos === 0,
  });

  checks.push({
    name: 'Posted videos (manual-posts)',
    pass: postedVideos > 0,
    detail: `${postedVideos}/30 posts recorded`,
    blocker: false,
  });

  // Gate deadline
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - postedVideos);
  const paceNeeded = daysLeft > 0 && postsNeeded > 0 ? Math.round(postsNeeded / daysLeft * 10) / 10 : 0;
  checks.push({
    name: 'Gate deadline (Apr 7)',
    pass: daysLeft > 7,
    detail: `${daysLeft}d left | ${postsNeeded} posts needed | pace: ${paceNeeded}/day`,
    blocker: daysLeft <= 3 && postsNeeded > 0,
  });

  // Gate JSON freshness
  if (existsSync(GATE_PATH)) {
    const gate = JSON.parse(readFileSync(GATE_PATH, 'utf-8'));
    checks.push({
      name: 'Gate report',
      pass: true,
      detail: `${gate.urgency} — ${gate.urgency_signal}`,
      blocker: false,
    });
  } else {
    checks.push({
      name: 'Gate report',
      pass: false,
      detail: 'Not generated — run: npx ts-node scripts/scs001/generate-phase1-5-gate.ts',
      blocker: false,
    });
  }

  return checks;
}

function main(): void {
  const checks = runChecks();
  const blockers = checks.filter(c => c.blocker);
  const warnings = checks.filter(c => !c.pass && !c.blocker);
  const passed = checks.filter(c => c.pass);

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  PHASE 1 GO-LIVE PREFLIGHT CHECK');
  console.log('══════════════════════════════════════════════════════\n');

  for (const c of checks) {
    const icon = c.pass ? '✅' : c.blocker ? '🚫' : '⚠️';
    console.log(`  ${icon} ${c.name}: ${c.detail}`);
  }

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`  ✅ Passed: ${passed.length} | ⚠️ Warnings: ${warnings.length} | 🚫 Blockers: ${blockers.length}`);

  if (blockers.length > 0) {
    console.log('\n  🚫 BLOCKERS (must fix before posting):');
    for (const b of blockers) {
      console.log(`     • ${b.name}: ${b.detail}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('\n  ✅ ALL CLEAR — Ready to post!\n');
    process.exit(0);
  }
}

main();
