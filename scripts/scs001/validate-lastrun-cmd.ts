#!/usr/bin/env ts-node
/**
 * validate-lastrun-cmd.ts — Sprint 267
 * Validates /lastrun command integration in the active Telegram bot.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('\n══════════════════════════════════════════════');
console.log('  Sprint 267 — /lastrun Command Validation');
console.log('══════════════════════════════════════════════\n');

// Test 1: commands.ts has handleLastRun
console.log('Test 1: commands.ts structure');
const cmdPath = path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const cmdSrc = fs.readFileSync(cmdPath, 'utf-8');
assert('handleLastRun exported', cmdSrc.includes('export async function handleLastRun('));
assert('Reads latest.json', cmdSrc.includes('pipeline-runs/latest.json'));
assert('Shows run_id', cmdSrc.includes('run.run_id'));
assert('Shows total time', cmdSrc.includes('totalMin'));
assert('Shows stages', cmdSrc.includes('run.stages'));
assert('Shows summary stats', cmdSrc.includes('run.summary'));
assert('Shows error count', cmdSrc.includes('error_count'));
assert('Owner-only check', cmdSrc.includes("'🔒 Owner only.'") || cmdSrc.includes('Owner only'));
assert('Help mentions /lastrun', cmdSrc.includes('/lastrun'));

// Test 2: index.ts routes /lastrun
console.log('\nTest 2: index.ts routing');
const idxPath = path.join(ROOT, 'agents', 'telegram-bot', 'index.ts');
const idxSrc = fs.readFileSync(idxPath, 'utf-8');
assert('Imports handleLastRun', idxSrc.includes('handleLastRun'));
assert('Routes /lastrun case', idxSrc.includes("case '/lastrun'"));

// Test 3: latest.json can be parsed
console.log('\nTest 3: Pipeline run data');
const latestPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
if (fs.existsSync(latestPath)) {
  try {
    const run = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
    assert('latest.json parses as JSON', true);
    assert('Has run_id', Boolean(run.run_id));
    assert('Has stages array', Array.isArray(run.stages));
    assert('Has started_at', Boolean(run.started_at));
    assert('Stages have status field', run.stages.length > 0 && run.stages[0].status);
  } catch (e: any) {
    assert('latest.json parse', false, e.message);
  }
} else {
  console.log('  ⏭️ latest.json not found (pipeline may not have run)');
}

// Test 4: TypeScript compile check
console.log('\nTest 4: TypeScript compile');
try {
  const { execSync } = require('child_process');
  execSync('npx tsc --noEmit --esModuleInterop --skipLibCheck agents/telegram-bot/index.ts 2>&1', {
    cwd: ROOT, timeout: 30000, encoding: 'utf-8'
  });
  assert('TypeScript compiles without errors', true);
} catch (e: any) {
  assert('TypeScript compile', false, (e.stdout || e.message).slice(0, 200));
}

// Summary
console.log('\n──────────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`  Overall: ${failed === 0 ? '✅ PASS' : '❌ FAIL'}`);
console.log('══════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
