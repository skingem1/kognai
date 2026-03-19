#!/usr/bin/env ts-node
/**
 * validate-revenue-tracker.ts — Sprint 269
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string): void {
  if (condition) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n══════════════════════════════════════════════');
console.log('  Sprint 269 — Revenue Tracker Validation');
console.log('══════════════════════════════════════════════\n');

// Test 1: Revenue tracker script
console.log('Test 1: revenue-tracker.ts');
const rtSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'scs001', 'revenue-tracker.ts'), 'utf-8');
assert('Script exists', rtSrc.length > 0);
assert('Reads telegram-db.json', rtSrc.includes('telegram-db.json'));
assert('Writes revenue-summary.json', rtSrc.includes('revenue-summary.json'));
assert('Has plan pricing', rtSrc.includes('growth: 19') && rtSrc.includes('premium: 49'));
assert('Computes MRR', rtSrc.includes('mrr'));
assert('Has financial gates', rtSrc.includes('Financial autonomy'));

// Test 2: Generated summary
console.log('\nTest 2: Revenue summary');
const summaryPath = path.join(ROOT, 'reports', 'revenue-summary.json');
assert('revenue-summary.json exists', fs.existsSync(summaryPath));
if (fs.existsSync(summaryPath)) {
  const s = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert('Has total_users field', typeof s.total_users === 'number');
  assert('Has mrr field', typeof s.mrr === 'number');
  assert('Has financial_gates array', Array.isArray(s.financial_gates));
}

// Test 3: /revenue in bot
console.log('\nTest 3: Telegram bot');
const cmdSrc = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts'), 'utf-8');
const idxSrc = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'index.ts'), 'utf-8');
assert('handleRevenue exported', cmdSrc.includes('export async function handleRevenue('));
assert('Help mentions /revenue', cmdSrc.includes('/revenue'));
assert('index.ts imports handleRevenue', idxSrc.includes('handleRevenue'));
assert('index.ts routes /revenue', idxSrc.includes("case '/revenue'"));

// Test 4: TypeScript compile
console.log('\nTest 4: TypeScript compile');
try {
  const { execSync } = require('child_process');
  execSync('npx tsc --noEmit --esModuleInterop --skipLibCheck agents/telegram-bot/index.ts 2>&1', {
    cwd: ROOT, timeout: 30000, encoding: 'utf-8'
  });
  assert('Bot compiles', true);
} catch (e: any) {
  assert('Bot compile', false, (e.stdout || e.message).slice(0, 200));
}

console.log('\n──────────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`  Overall: ${failed === 0 ? '✅ PASS' : '❌ FAIL'}`);
console.log('══════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
