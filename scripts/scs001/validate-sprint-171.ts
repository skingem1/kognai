#!/usr/bin/env ts-node
// Sprint 171 validation: InsightAgent ClawRouter §17 compliance checks
// 4 checks — exit 0 on all pass

import * as fs   from 'fs';
import * as path from 'path';

const ROOT        = path.join(__dirname, '..', '..');
const INSIGHT_PATH = path.join(ROOT, 'agents', 'scs001-insight', 'index.ts');

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

const src = fs.readFileSync(INSIGHT_PATH, 'utf-8');

// 1. ANTHROPIC_API_URL removed (direct URL violation)
check('File does NOT contain ANTHROPIC_API_URL (direct URL removed)', () =>
  !src.includes('ANTHROPIC_API_URL'));

// 2. ANTHROPIC_API_KEY removed (direct key violation)
check('File does NOT contain ANTHROPIC_API_KEY (direct key removed)', () =>
  !src.includes('ANTHROPIC_API_KEY'));

// 3. routeCall import present (ClawRouter gateway wired)
check('File contains import { routeCall } (ClawRouter import present)', () =>
  src.includes('import { routeCall }'));

// 4. constitutional_flag: true enforced
check("File contains 'constitutional_flag: true' (constitutional tier enforced)", () =>
  src.includes('constitutional_flag: true'));

console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
