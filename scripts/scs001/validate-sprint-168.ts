#!/usr/bin/env ts-node
// Sprint 168 validation: daily-digest Achiri alpha stats checks
// 4 checks — exit 0 on all pass

import * as fs   from 'fs';
import * as path from 'path';

const ROOT        = path.join(__dirname, '..', '..');
const DIGEST_PATH = path.join(ROOT, 'scripts', 'daily-digest.ts');

let passed = 0;
const total = 4;

function check(label: string, fn: () => boolean): void {
  try {
    if (fn()) { console.log(`✅ ${label}`); passed++; }
    else       { console.log(`❌ ${label}`); }
  } catch (e) {
    console.log(`❌ ${label} — threw: ${(e as Error).message}`);
  }
}

const src = fs.readFileSync(DIGEST_PATH, 'utf-8');

// 1. getAchiriAlphaStats function exists
check('daily-digest.ts contains getAchiriAlphaStats function', () =>
  src.includes('function getAchiriAlphaStats'));

// 2. reads waitlist.jsonl
check('daily-digest.ts reads waitlist.jsonl', () =>
  src.includes('waitlist.jsonl'));

// 3. reads alpha-whitelist.jsonl
check('daily-digest.ts reads alpha-whitelist.jsonl', () =>
  src.includes('alpha-whitelist.jsonl'));

// 4. digest contains Achiri Alpha section text
check("daily-digest.ts contains 'Achiri Alpha' digest section", () =>
  src.includes('Achiri Alpha'));

console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
