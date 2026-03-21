#!/usr/bin/env npx ts-node
/**
 * validate-lora-corpus.ts — Sprint 690
 * Validates LoRA training corpus from AMD-15 data pipeline.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const ROOT = path.join(__dirname, '..', '..');
const CORPUS_PATH = path.join(ROOT, 'vault', 'training', 'corpus-r1.jsonl');
const META_PATH = path.join(ROOT, 'vault', 'training', 'corpus-r1-meta.json');

let pass = 0;
let fail = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) { console.log(`  ✅ ${name}`); pass++; }
    else { console.log(`  ❌ ${name}`); fail++; }
  } catch (err: any) { console.log(`  ❌ ${name} — ${err.message}`); fail++; }
}

console.log('\n=== Sprint 690 — LoRA Corpus Validation ===\n');

// File existence
test('corpus file exists', () => fs.existsSync(CORPUS_PATH));
test('meta file exists', () => fs.existsSync(META_PATH));

// Parse corpus
const lines = fs.readFileSync(CORPUS_PATH, 'utf-8').split('\n').filter(l => l.trim());
const entries = lines.map(l => JSON.parse(l));

test('corpus has >= 100 entries', () => entries.length >= 100);
test('corpus has <= 5000 entries (sanity)', () => entries.length <= 5000);

// Entry structure
test('each entry has instruction field', () => entries.every((e: any) => typeof e.instruction === 'string' && e.instruction.length > 10));
test('each entry has response field', () => entries.every((e: any) => typeof e.response === 'string' && e.response.length > 5));
test('each entry has metadata', () => entries.every((e: any) => e.metadata && e.metadata.sprint_id && e.metadata.task_id));

// Constitutional filter validation
const EXCLUDED = ['credential', 'secret', 'password', 'api_key', 'private_key', 'ssh_key', 'wallet_key'];
test('no credential-related tasks in corpus', () => {
  for (const e of entries) {
    const text = (e.instruction + ' ' + e.response).toLowerCase();
    for (const kw of EXCLUDED) {
      if (text.includes(kw) && !text.includes('exclude') && !text.includes('filter')) return false;
    }
  }
  return true;
});

test('no failure-library tasks in corpus', () =>
  entries.every((e: any) => e.metadata.task_type !== 'failure-library' && e.metadata.task_type !== 'failure_library')
);

// SHA-256 verification
const content = fs.readFileSync(CORPUS_PATH, 'utf-8');
const sha = crypto.createHash('sha256').update(content).digest('hex');
const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf-8'));
test('SHA-256 matches meta', () => sha === meta.sha256);

// Meta fields
test('meta has total_entries matching corpus', () => meta.total_entries === entries.length);
test('meta has amd15_version', () => meta.amd15_version === 'r1');
test('meta has generated_at timestamp', () => !!meta.generated_at);
test('meta has type_distribution', () => !!meta.type_distribution && Object.keys(meta.type_distribution).length > 0);

// Task type diversity (should have at least 3 different types)
const types = new Set(entries.map((e: any) => e.metadata.task_type));
test('corpus has >= 3 task types', () => types.size >= 3);

// Sprint diversity (should span many sprints)
const sprints = new Set(entries.map((e: any) => e.metadata.sprint_id));
test('corpus spans >= 10 sprints', () => sprints.size >= 10);

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
console.log(`   Corpus: ${entries.length} entries across ${sprints.size} sprints, ${types.size} task types`);
if (fail > 0) { console.log('\n❌ FAIL'); process.exit(1); }
else { console.log('\n✅ ALL PASS'); }
