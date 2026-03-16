#!/usr/bin/env ts-node
/**
 * validate-sprint-148.ts — Sprint 148 validation
 * Dashboard Achiri alpha panel — invited count + invite DM notification
 *
 * 5 checks:
 *   1. achiri.py reads alpha-whitelist.jsonl
 *   2. achiri.py returns total_invited in dict
 *   3. app.js has total_invited in Achiri panel
 *   4. commands.ts handleInviteAchiri sends DM to invited user
 *   5. DM send is wrapped in try-catch (bot may not have been started by user)
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

const achiriPy  = readFile('dashboard/parsers/achiri.py');
const appJs     = readFile('dashboard/static/app.js');
const commands  = readFile('agents/telegram-bot/commands.ts');

// Check 1: achiri.py reads alpha-whitelist.jsonl
check('148-01', 'achiri.py reads alpha-whitelist.jsonl',
  achiriPy.includes('alpha-whitelist.jsonl') || achiriPy.includes('alpha_whitelist'));

// Check 2: achiri.py returns total_invited
check('148-02', "achiri.py returns 'total_invited' in result dict",
  achiriPy.includes('total_invited'));

// Check 3: app.js has total_invited in Achiri panel
check('148-03', 'app.js has total_invited stat in Achiri panel',
  appJs.includes('total_invited'));

// Check 4: handleInviteAchiri sends DM to invited user
check('148-04', 'commands.ts handleInviteAchiri sends DM to invited user (sendMessage(parseInt(targetId)))',
  commands.includes('sendMessage(parseInt(targetId)') ||
  commands.includes('sendMessage(Number(targetId)'));

// Check 5: DM send wrapped in try-catch
check('148-05', 'DM send is wrapped in try-catch (graceful failure)',
  commands.includes('dmErr') || (commands.includes('try {') && commands.includes('DM to')));

// Summary
console.log('');
console.log(`══════════════════════════════════════════════════════`);
console.log(`  Sprint 148 Validation: ${passed}/5 checks passed`);
if (failed === 0) {
  console.log(`  ✅ ALL PASS — Sprint 148 complete`);
} else {
  console.log(`  ❌ ${failed} check(s) FAILED`);
}
console.log(`══════════════════════════════════════════════════════`);

process.exit(failed === 0 ? 0 : 1);
