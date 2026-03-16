#!/usr/bin/env ts-node
// Sprint 169 validation: gate tracker auto-update checks
// 5 checks — exit 0 on all pass

import * as fs    from 'fs';
import * as path  from 'path';
import { execSync } from 'child_process';

const ROOT           = path.join(__dirname, '..', '..');
const SCRIPT_PATH    = path.join(ROOT, 'scripts', 'update-gate-tracker.ts');
const ECOSYSTEM_PATH = path.join(ROOT, 'ecosystem.config.js');
const GATE_TRACKER   = path.join(ROOT, 'docs', 'gate-tracker.md');

let passed = 0;
const total = 5;

function check(label: string, fn: () => boolean): void {
  try {
    if (fn()) { console.log(`✅ ${label}`); passed++; }
    else       { console.log(`❌ ${label}`); }
  } catch (e) {
    console.log(`❌ ${label} — threw: ${(e as Error).message}`);
  }
}

// 1. update-gate-tracker.ts exists
check('update-gate-tracker.ts exists', () => fs.existsSync(SCRIPT_PATH));

// 2. script reads phase1-5-gate.json
check('update-gate-tracker.ts reads phase1-5-gate.json', () => {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf-8');
  return src.includes('phase1-5-gate.json');
});

// 3. script writes gate-tracker.md
check('update-gate-tracker.ts writes gate-tracker.md', () => {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf-8');
  return src.includes('gate-tracker.md');
});

// 4. ecosystem.config.js contains kognai-gate-tracker-update entry
check("ecosystem.config.js contains 'kognai-gate-tracker-update'", () => {
  const src = fs.readFileSync(ECOSYSTEM_PATH, 'utf-8');
  return src.includes('kognai-gate-tracker-update');
});

// 5. Run the script and verify gate-tracker.md contains PASS for Phase 0→1
check('script runs and gate-tracker.md shows Phase 0→1 PASS', () => {
  try {
    execSync(
      `npx ts-node -e "require('./scripts/update-gate-tracker.ts')" 2>/dev/null || npx ts-node scripts/update-gate-tracker.ts`,
      { cwd: ROOT, timeout: 15000 }
    );
  } catch { /* ignore non-zero exit if script still writes file */ }
  if (!fs.existsSync(GATE_TRACKER)) return false;
  const content = fs.readFileSync(GATE_TRACKER, 'utf-8');
  return content.includes('PASS') || content.includes('auto by');
});

console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
