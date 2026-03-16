#!/usr/bin/env ts-node
/**
 * validate-sprint-146.ts — Sprint 146 validation
 * /invite-achiri command + file-based runtime alpha whitelist
 *
 * 7 checks:
 *   1. commands.ts exports handleInviteAchiri
 *   2. commands.ts has ALPHA_WHITELIST_PATH (file-based whitelist)
 *   3. commands.ts defines checkAlphaAccess function
 *   4. commands.ts handleAchiri uses checkAlphaAccess (not static .has())
 *   5. handleHelp lists /invite-achiri
 *   6. index.ts imports handleInviteAchiri
 *   7. index.ts routes '/invite-achiri'
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

const commands = readFile('agents/telegram-bot/commands.ts');
const index    = readFile('agents/telegram-bot/index.ts');

// Check 1: handleInviteAchiri exported
check('146-01', 'commands.ts exports handleInviteAchiri',
  commands.includes('export async function handleInviteAchiri') ||
  commands.includes('export function handleInviteAchiri'));

// Check 2: file-based whitelist path defined
check('146-02', 'commands.ts defines ALPHA_WHITELIST_PATH (file-based whitelist)',
  commands.includes('ALPHA_WHITELIST_PATH') || commands.includes('alpha-whitelist.jsonl'));

// Check 3: checkAlphaAccess function exists
check('146-03', 'commands.ts defines checkAlphaAccess()',
  commands.includes('checkAlphaAccess'));

// Check 4: handleAchiri uses checkAlphaAccess (not static env Set)
check('146-04', 'handleAchiri uses checkAlphaAccess() not static ACHIRI_ALPHA_WHITELIST.has()',
  commands.includes('checkAlphaAccess(chatId)') &&
  !commands.includes('ACHIRI_ALPHA_WHITELIST.has(String(chatId))'));

// Check 5: handleHelp lists /invite-achiri
check('146-05', 'handleHelp lists /invite-achiri',
  commands.includes('/invite-achiri'));

// Check 6: index.ts imports handleInviteAchiri
check('146-06', 'index.ts imports handleInviteAchiri',
  index.includes('handleInviteAchiri'));

// Check 7: index.ts routes /invite-achiri
check('146-07', "index.ts routes '/invite-achiri'",
  index.includes("'/invite-achiri'") || index.includes('"/invite-achiri"'));

// Summary
console.log('');
console.log(`══════════════════════════════════════════════════════`);
console.log(`  Sprint 146 Validation: ${passed}/7 checks passed`);
if (failed === 0) {
  console.log(`  ✅ ALL PASS — Sprint 146 complete`);
} else {
  console.log(`  ❌ ${failed} check(s) FAILED`);
}
console.log(`══════════════════════════════════════════════════════`);

process.exit(failed === 0 ? 0 : 1);
