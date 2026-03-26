/**
 * validate-check-ready.ts — Sprint 1457
 * Tests check-ready.ts under both warmup states.
 */

import { execSync } from 'child_process';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'scs001', 'check-ready.ts');

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}

function run(overrideDays: number): { exitCode: number; output: string } {
  try {
    const out = execSync(
      `WARMUP_OVERRIDE_DAYS=${overrideDays} npx ts-node ${SCRIPT}`,
      { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    return { exitCode: 0, output: out };
  } catch (err: any) {
    return { exitCode: err.status ?? 1, output: (err.stdout || '') + (err.stderr || '') };
  }
}

console.log('[validate-check-ready] Running...\n');

// Scenario 1: warmup pending (2 days < 3)
const r1 = run(2);
check('WARMUP PENDING: exit code 1', r1.exitCode === 1, `got ${r1.exitCode}`);
check('WARMUP PENDING: output contains WARMUP PENDING', r1.output.includes('WARMUP PENDING'), r1.output.slice(0, 120));

// Scenario 2: warmup complete (3 days >= 3)
const r2 = run(3);
check('READY TO POST: exit code 0', r2.exitCode === 0, `got ${r2.exitCode}`);
check('READY TO POST: output contains READY TO POST', r2.output.includes('READY TO POST'), r2.output.slice(0, 120));

// Scenario 3: more than min days
const r3 = run(5);
check('5 days: exit code 0', r3.exitCode === 0, `got ${r3.exitCode}`);

console.log(`\n[validate-check-ready] ${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.error('[validate-check-ready] FAIL');
  process.exit(1);
}
console.log('[validate-check-ready] PASS');
