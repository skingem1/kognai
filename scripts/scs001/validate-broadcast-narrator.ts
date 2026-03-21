#!/usr/bin/env npx ts-node
/**
 * validate-broadcast-narrator.ts — Sprint 693
 * Validates broadcast narrator agent config + script.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
let pass = 0;
let fail = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) { console.log(`  ✅ ${name}`); pass++; }
    else { console.log(`  ❌ ${name}`); fail++; }
  } catch (err: any) { console.log(`  ❌ ${name} — ${err.message}`); fail++; }
}

console.log('\n=== Sprint 693 — Broadcast Narrator Validation ===\n');

// Agent config
const promptPath = path.join(ROOT, 'agents', 'scs001-broadcast', 'prompt.md');
test('agent prompt.md exists', () => fs.existsSync(promptPath));
const prompt = fs.readFileSync(promptPath, 'utf-8');
test('prompt: Constitutional Mandate', () => prompt.includes('Constitutional Mandate'));
test('prompt: Five Principles Mandate', () => prompt.includes('Five Principles Mandate'));
test('prompt: BROADCAST_AWARE=true', () => prompt.includes('BROADCAST_AWARE=true'));
test('prompt: T1 model (qwen3:4b)', () => prompt.includes('qwen3:4b'));
test('prompt: ACP filter section', () => prompt.includes('ACP Filter'));
test('prompt: no marketing rule', () => prompt.includes('No marketing'));
test('prompt: 280 char limit', () => prompt.includes('280'));
test('prompt: example narrations', () => prompt.includes('Example Narrations'));
test('prompt: never reveal tokens', () => prompt.includes('API keys') || prompt.includes('tokens'));

// Narrator script
const scriptPath = path.join(ROOT, 'scripts', 'scs001', 'broadcast-narrator.ts');
test('narrator script exists', () => fs.existsSync(scriptPath));
const src = fs.readFileSync(scriptPath, 'utf-8');
test('script: ACP filter function', () => src.includes('function acpFilter'));
test('script: strips file paths', () => src.includes('Strip file paths'));
test('script: strips API keys', () => src.includes('[redacted]'));
test('script: 60-second delay buffer', () => src.includes('BROADCAST_DELAY'));
test('script: dry-run mode', () => src.includes('--dry-run'));
test('script: Telegram send function', () => src.includes('sendBroadcast'));
test('script: sprint narration', () => src.includes('narrateSprint'));
test('script: gate narration', () => src.includes('getGateNarration'));
test('script: broadcast log', () => src.includes('broadcast.jsonl'));

// Dry run test
const { execSync } = require('child_process');
test('narrator --dry-run executes without error', () => {
  try {
    const out = execSync(`cd ${ROOT} && npx ts-node --transpile-only scripts/scs001/broadcast-narrator.ts --dry-run 2>&1`, { timeout: 30000 }).toString();
    return out.includes('[broadcast]');
  } catch (err: any) {
    console.log('    ' + (err.stdout?.toString() || err.message).slice(0, 200));
    return false;
  }
});

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) { console.log('\n❌ FAIL'); process.exit(1); }
else { console.log('\n✅ ALL PASS'); }
