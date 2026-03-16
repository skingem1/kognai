// validate-phase1-5-gate.ts — Sprint 132
// Validates Phase 1.5 gate review infrastructure
// Run: npx ts-node scripts/scs001/validate-phase1-5-gate.ts

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean): void {
  try {
    const ok = fn();
    if (ok) {
      console.log('  PASS  ' + name);
      passed++;
    } else {
      console.log('  FAIL  ' + name);
      failed++;
    }
  } catch (err) {
    console.log('  FAIL  ' + name + ' — ' + (err as Error).message);
    failed++;
  }
}

console.log('\n=== Sprint 132: Phase 1.5 Gate Review Validation ===\n');

// Test 1: generate-phase1-5-gate.ts exists
const gateScriptPath = join(ROOT, 'scripts', 'scs001', 'generate-phase1-5-gate.ts');
test('generate-phase1-5-gate.ts exists', () => existsSync(gateScriptPath));

// Test 2: gate script runs and writes JSON (0 posts → FAIL but still writes JSON)
const gateOutputPath = join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json');
test('gate script runs and writes gate JSON', () => {
  try {
    execSync(`npx ts-node ${gateScriptPath}`, { cwd: ROOT, stdio: 'pipe' });
  } catch { /* expected to fail (exit 1) with 0 posts — still writes JSON */ }
  return existsSync(gateOutputPath);
});

// Test 3: gate JSON has expected fields
test('gate JSON has gate/date/criteria/overall_pass/recommendation fields', () => {
  if (!existsSync(gateOutputPath)) throw new Error('gate JSON not found');
  const data = JSON.parse(readFileSync(gateOutputPath, 'utf-8'));
  return (
    typeof data.gate === 'string' &&
    typeof data.date === 'string' &&
    Array.isArray(data.criteria) &&
    typeof data.overall_pass === 'boolean' &&
    typeof data.recommendation === 'string'
  );
});

// Test 4: handleGate export exists in commands.ts
const commandsSrc = existsSync(join(ROOT, 'agents', 'telegram-bot', 'commands.ts'))
  ? readFileSync(join(ROOT, 'agents', 'telegram-bot', 'commands.ts'), 'utf-8')
  : '';
test('handleGate exported from commands.ts', () => commandsSrc.includes('export async function handleGate'));

// Test 5: /gate case in index.ts
const indexSrc = existsSync(join(ROOT, 'agents', 'telegram-bot', 'index.ts'))
  ? readFileSync(join(ROOT, 'agents', 'telegram-bot', 'index.ts'), 'utf-8')
  : '';
test("'/gate' case in index.ts dispatch switch", () => indexSrc.includes("'/gate'") && indexSrc.includes('handleGate'));

console.log('\n─────────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
  console.log('STATUS: PASS');
  process.exit(0);
} else {
  console.log('STATUS: FAIL');
  process.exit(1);
}
