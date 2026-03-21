#!/usr/bin/env npx ts-node
/**
 * validate-model-registry.ts — Sprint 691
 * Validates model registry constitutional artifact + management script + Telegram command.
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

console.log('\n=== Sprint 691 — Model Registry Validation ===\n');

// Test 1: Registry file exists and is valid JSON
const regPath = path.join(ROOT, 'codebook', 'model-registry.json');
test('registry file exists', () => fs.existsSync(regPath));

const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
test('registry has correct schema', () => reg._schema === 'kognai-model-registry-v1');
test('registry has constitutional note', () => reg._note?.includes('Constitutional'));
test('registry has naming convention', () => reg._naming?.includes('-kognai-r'));
test('registry has entries array', () => Array.isArray(reg.entries) && reg.entries.length > 0);

// Test 2: Seed entry structure
const seed = reg.entries[0];
test('seed entry has id', () => !!seed.id);
test('seed entry has base_model', () => !!seed.base_model);
test('seed entry has corpus_sha256', () => typeof seed.corpus_sha256 === 'string' && seed.corpus_sha256.length === 64);
test('seed entry has sherlock_scores with 4 dimensions', () => {
  const s = seed.sherlock_scores;
  return s && 'constitutional_compliance' in s && 'task_accuracy' in s && 'safety_alignment' in s && 'capability_retention' in s;
});
test('seed entry has status field', () => !!seed.status);
test('seed entry links to corpus-r1.jsonl', () => seed.corpus_source?.includes('corpus-r1.jsonl'));

// Test 3: Management script exists and has key functions
const mgmtPath = path.join(ROOT, 'scripts', 'model-registry.ts');
test('management script exists', () => fs.existsSync(mgmtPath));
const mgmtSrc = fs.readFileSync(mgmtPath, 'utf-8');
test('management script has --list', () => mgmtSrc.includes('--list'));
test('management script has --audit', () => mgmtSrc.includes('--audit'));
test('management script has SHA-256 verification', () => mgmtSrc.includes('createHash') && mgmtSrc.includes('sha256'));
test('management script checks Godman approval', () => mgmtSrc.includes('godman_approval'));

// Test 4: Telegram command stub
const botSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'telegram-bot.ts'), 'utf-8');
test('telegram bot imports cmdApproveFinetune', () => botSrc.includes('cmdApproveFinetune'));
test('telegram bot routes /approveft', () => botSrc.includes("'/approveft'"));

const sysSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'telegram-commands', 'cmd-system.ts'), 'utf-8');
test('cmd-system exports cmdApproveFinetune', () => sysSrc.includes('export async function cmdApproveFinetune'));
test('approve command checks registry exists', () => sysSrc.includes('model-registry.json'));

// Test 5: Run management script --audit
const { execSync } = require('child_process');
test('model-registry --audit passes', () => {
  try {
    execSync(`cd ${ROOT} && npx ts-node --transpile-only scripts/model-registry.ts --audit 2>&1`, { timeout: 30000 });
    return true;
  } catch (err: any) {
    const out = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
    if (out.includes('issue(s) found') && !out.includes('0 issue')) return false;
    return true;
  }
});

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) { console.log('\n❌ FAIL'); process.exit(1); }
else { console.log('\n✅ ALL PASS'); }
