#!/usr/bin/env ts-node
/**
 * validate-pipeline-metrics.ts — Sprint 268
 * Validates pipeline metrics aggregator + /metrics Telegram command.
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
console.log('  Sprint 268 — Pipeline Metrics Validation');
console.log('══════════════════════════════════════════════\n');

// Test 1: Aggregator script
console.log('Test 1: aggregate-pipeline-metrics.ts');
const aggPath = path.join(ROOT, 'scripts', 'scs001', 'aggregate-pipeline-metrics.ts');
const aggSrc = fs.readFileSync(aggPath, 'utf-8');
assert('Script exists', aggSrc.length > 0);
assert('Reads pipeline-runs dir', aggSrc.includes('pipeline-runs'));
assert('Writes pipeline-metrics.json', aggSrc.includes('pipeline-metrics.json'));
assert('Computes stage averages', aggSrc.includes('stageStats'));
assert('Computes QC pass rate', aggSrc.includes('qc_pass_rate'));

// Test 2: Generated metrics JSON
console.log('\nTest 2: Generated metrics');
const metricsPath = path.join(ROOT, 'reports', 'pipeline-metrics.json');
assert('pipeline-metrics.json exists', fs.existsSync(metricsPath));
if (fs.existsSync(metricsPath)) {
  const m = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
  assert('Has total_runs', typeof m.total_runs === 'number' && m.total_runs > 0);
  assert('Has stage_averages', typeof m.stage_averages === 'object');
  assert('Has cumulative stats', typeof m.cumulative === 'object');
  assert('Has daily_runs', typeof m.daily_runs === 'object');
  assert('QC pass rate >= 0', m.cumulative.qc_pass_rate_pct >= 0);
}

// Test 3: /metrics in bot
console.log('\nTest 3: Telegram bot integration');
const cmdSrc = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts'), 'utf-8');
const idxSrc = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'index.ts'), 'utf-8');
assert('handleMetrics exported', cmdSrc.includes('export async function handleMetrics('));
assert('Help mentions /metrics', cmdSrc.includes('/metrics'));
assert('Reads pipeline-metrics.json', cmdSrc.includes('pipeline-metrics.json'));
assert('index.ts imports handleMetrics', idxSrc.includes('handleMetrics'));
assert('index.ts routes /metrics', idxSrc.includes("case '/metrics'"));

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

// Summary
console.log('\n──────────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`  Overall: ${failed === 0 ? '✅ PASS' : '❌ FAIL'}`);
console.log('══════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
