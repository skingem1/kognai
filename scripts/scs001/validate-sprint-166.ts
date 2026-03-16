#!/usr/bin/env ts-node
// Sprint 166 validation: Achiri smoke-test script checks
// 4 checks — exit 0 on all pass

import * as fs   from 'fs';
import * as path from 'path';

const ROOT        = path.join(__dirname, '..', '..');
const SMOKE_TEST  = path.join(ROOT, 'scripts', 'achiri', 'smoke-test.ts');

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

// 1. smoke-test.ts exists
check('smoke-test.ts exists at scripts/achiri/smoke-test.ts', () => fs.existsSync(SMOKE_TEST));

// 2. Contains localhost:3420 reference
check('smoke-test.ts references localhost:3420', () => {
  const src = fs.readFileSync(SMOKE_TEST, 'utf-8');
  return src.includes('3420');
});

// 3. Contains POST /chat or /chat reference
check('smoke-test.ts contains /chat endpoint check', () => {
  const src = fs.readFileSync(SMOKE_TEST, 'utf-8');
  return src.includes('/chat');
});

// 4. Contains process.exit for exit-code logic
check('smoke-test.ts uses process.exit for pass/fail', () => {
  const src = fs.readFileSync(SMOKE_TEST, 'utf-8');
  return src.includes('process.exit(0)') && src.includes('process.exit(1)');
});

console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
