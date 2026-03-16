#!/usr/bin/env ts-node
/**
 * validate-sprint-145.ts — Sprint 145 validation
 * Gate urgency escalation in daily-digest.ts + kognai-gate-regen in ecosystem.config.js
 *
 * 6 checks:
 *   1. daily-digest.ts contains kill-switch/gate-failed logic (💀 or GATE FAILED)
 *   2. daily-digest.ts contains kill-risk signal (🚨 or KILL RISK)
 *   3. daily-digest.ts contains warning signal (⚠️ or WARNING — behind pace)
 *   4. daily-digest.ts contains in-progress signal (⏳ IN PROGRESS)
 *   5. ecosystem.config.js contains 'kognai-gate-regen'
 *   6. ecosystem.config.js contains '55 6 * * *' gate regen cron
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function check(id: string, label: string, result: boolean): void {
  if (result) {
    console.log(`✅ [${id}] ${label}`);
    passed++;
  } else {
    console.log(`❌ [${id}] ${label}`);
    failed++;
  }
}

function readFile(rel: string): string {
  const full = resolve(ROOT, rel);
  if (!existsSync(full)) return '';
  return readFileSync(full, 'utf-8');
}

const digest     = readFile('scripts/daily-digest.ts');
const ecosystem  = readFile('ecosystem.config.js');

// Check 1: blocker/gate-failed state
check('145-01', 'daily-digest.ts has GATE FAILED / 💀 blocker signal',
  digest.includes('💀') || digest.includes('GATE FAILED') || digest.includes('kill switch trigger'));

// Check 2: kill risk state
check('145-02', 'daily-digest.ts has KILL RISK / 🚨 critical signal',
  digest.includes('🚨') || digest.includes('KILL RISK'));

// Check 3: warning state
check('145-03', 'daily-digest.ts has WARNING / ⚠️ behind-pace signal',
  digest.includes('⚠️') || digest.includes('WARNING'));

// Check 4: in-progress/on-track state
check('145-04', 'daily-digest.ts has ⏳ IN PROGRESS / on track signal',
  digest.includes('⏳ IN PROGRESS') || digest.includes('on track'));

// Check 5: gate regen in ecosystem.config.js
check('145-05', "ecosystem.config.js has 'kognai-gate-regen' process",
  ecosystem.includes('kognai-gate-regen'));

// Check 6: gate regen cron time
check('145-06', "ecosystem.config.js has '55 6 * * *' gate regen cron",
  ecosystem.includes('55 6 * * *'));

// Summary
console.log('');
console.log(`══════════════════════════════════════════════════════`);
console.log(`  Sprint 145 Validation: ${passed}/6 checks passed`);
if (failed === 0) {
  console.log(`  ✅ ALL PASS — Sprint 145 complete`);
} else {
  console.log(`  ❌ ${failed} check(s) FAILED`);
}
console.log(`══════════════════════════════════════════════════════`);

process.exit(failed === 0 ? 0 : 1);
