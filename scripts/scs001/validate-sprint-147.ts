#!/usr/bin/env ts-node
/**
 * validate-sprint-147.ts — Sprint 147 validation
 * /deploy-status Telegram command — Achiri alpha deploy checklist
 *
 * 6 checks:
 *   1. commands.ts exports handleDeployStatus
 *   2. commands.ts checks ACHIRI_BASE_URL vs localhost (urlIsRemote)
 *   3. commands.ts checks ACHIRI_ALPHA_ONLY env var
 *   4. commands.ts pings /health URL in handleDeployStatus
 *   5. handleHelp lists /deploy-status
 *   6. index.ts routes '/deploy-status'
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

// Check 1: handleDeployStatus exported
check('147-01', 'commands.ts exports handleDeployStatus',
  commands.includes('export async function handleDeployStatus') ||
  commands.includes('export function handleDeployStatus'));

// Check 2: checks ACHIRI_BASE_URL vs localhost
check('147-02', 'commands.ts checks ACHIRI_BASE_URL vs localhost',
  commands.includes('localhost') && commands.includes('ACHIRI_BASE_URL') &&
  commands.includes('urlIsRemote'));

// Check 3: checks ACHIRI_ALPHA_ONLY
check('147-03', "commands.ts checks ACHIRI_ALPHA_ONLY === 'true'",
  commands.includes("ACHIRI_ALPHA_ONLY") && commands.includes('alphaOnly'));

// Check 4: pings /health in handleDeployStatus
check('147-04', 'commands.ts pings /health URL in handleDeployStatus',
  commands.includes('/health') && commands.includes('healthUrl') && commands.includes('handleDeployStatus'));

// Check 5: handleHelp lists /deploy-status
check('147-05', 'handleHelp lists /deploy-status',
  commands.includes('/deploy-status'));

// Check 6: index.ts routes /deploy-status
check('147-06', "index.ts routes '/deploy-status'",
  index.includes("'/deploy-status'") || index.includes('"/deploy-status"'));

// Summary
console.log('');
console.log(`══════════════════════════════════════════════════════`);
console.log(`  Sprint 147 Validation: ${passed}/6 checks passed`);
if (failed === 0) {
  console.log(`  ✅ ALL PASS — Sprint 147 complete`);
} else {
  console.log(`  ❌ ${failed} check(s) FAILED`);
}
console.log(`══════════════════════════════════════════════════════`);

process.exit(failed === 0 ? 0 : 1);
