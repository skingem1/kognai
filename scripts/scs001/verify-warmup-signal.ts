#!/usr/bin/env npx ts-node
/**
 * verify-warmup-signal.ts — Sprint 783 (WARMUP-01)
 *
 * After operator runs /warmup-complete, this script checks whether the
 * TikTok account's For You Page is trained on AI/tech niche content.
 *
 * Verification checks:
 * 1. Warmup flag file exists (set by /warmup-complete command)
 * 2. Warmup duration >= 3 days since account creation/reset
 * 3. Operator self-reported niche alignment score
 *
 * Usage: npx ts-node scripts/scs001/verify-warmup-signal.ts
 * Called by: /warmup-complete Telegram command
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD = process.cwd();
const WARMUP_FLAG_PATH = join(CWD, 'workspace', 'scs001', 'warmup-status.json');
const WARMUP_LOG_PATH = join(CWD, 'logs', 'warmup-verification.jsonl');

export interface WarmupStatus {
  warmup_complete: boolean;
  warmup_started_at: string;       // ISO date when operator started scrolling
  warmup_completed_at: string | null; // ISO date when /warmup-complete was called
  niche_alignment: number;          // 0-10 self-reported score
  days_active: number;              // days of active scrolling
  verified: boolean;                // true if all checks pass
  verified_at: string | null;
  notes: string;
}

function logEvent(event: Record<string, unknown>): void {
  mkdirSync(dirname(WARMUP_LOG_PATH), { recursive: true });
  appendFileSync(WARMUP_LOG_PATH, JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n', 'utf-8');
}

export function loadWarmupStatus(): WarmupStatus | null {
  if (!existsSync(WARMUP_FLAG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(WARMUP_FLAG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveWarmupStatus(status: WarmupStatus): void {
  mkdirSync(dirname(WARMUP_FLAG_PATH), { recursive: true });
  writeFileSync(WARMUP_FLAG_PATH, JSON.stringify(status, null, 2), 'utf-8');
}

export function isWarmupComplete(): boolean {
  const status = loadWarmupStatus();
  return status?.verified === true;
}

export interface VerifyResult {
  pass: boolean;
  checks: Array<{ name: string; pass: boolean; detail: string }>;
}

export function verifyWarmupSignal(): VerifyResult {
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
  const status = loadWarmupStatus();

  // Check 1: Flag file exists
  if (!status) {
    checks.push({
      name: 'Warmup flag',
      pass: false,
      detail: 'No warmup-status.json — run /warmup-start first',
    });
    return { pass: false, checks };
  }

  checks.push({
    name: 'Warmup flag',
    pass: true,
    detail: 'warmup-status.json exists',
  });

  // Check 2: Operator marked warmup complete
  checks.push({
    name: 'Operator confirmation',
    pass: status.warmup_complete,
    detail: status.warmup_complete
      ? `Completed at ${status.warmup_completed_at}`
      : 'Operator has not run /warmup-complete yet',
  });

  // Check 3: Minimum 3 days of active scrolling
  const minDays = 3;
  checks.push({
    name: `Active days (min ${minDays})`,
    pass: status.days_active >= minDays,
    detail: `${status.days_active} days active`,
  });

  // Check 4: Niche alignment score >= 6/10
  const minAlignment = 6;
  checks.push({
    name: `Niche alignment (min ${minAlignment}/10)`,
    pass: status.niche_alignment >= minAlignment,
    detail: `Score: ${status.niche_alignment}/10`,
  });

  const allPass = checks.every(c => c.pass);

  if (allPass && !status.verified) {
    status.verified = true;
    status.verified_at = new Date().toISOString();
    saveWarmupStatus(status);
    logEvent({ event: 'warmup_verified', status });
  }

  return { pass: allPass, checks };
}

// CLI entry point
if (require.main === module) {
  const result = verifyWarmupSignal();

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  TIKTOK WARMUP VERIFICATION');
  console.log('══════════════════════════════════════════════════════\n');

  for (const c of result.checks) {
    const icon = c.pass ? '✅' : '❌';
    console.log(`  ${icon} ${c.name}: ${c.detail}`);
  }

  console.log(`\n  Result: ${result.pass ? '✅ VERIFIED — posting unlocked' : '❌ NOT READY — keep warming up'}\n`);
  process.exit(result.pass ? 0 : 1);
}
