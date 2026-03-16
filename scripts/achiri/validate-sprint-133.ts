// validate-sprint-133.ts — Sprint 133
// Validates gate-tracker T3 PASS update + /help command updates
// Run: npx ts-node scripts/achiri/validate-sprint-133.ts

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

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

console.log('\n=== Sprint 133: Gate-tracker T3 + /help Update Validation ===\n');

const gateTrackerPath = join(ROOT, 'docs', 'gate-tracker.md');
const gateTrackerSrc  = existsSync(gateTrackerPath) ? readFileSync(gateTrackerPath, 'utf-8') : '';

// Test 1: gate-tracker.md marks T3 Skills as [x] PASS
test('gate-tracker.md marks T3 Skills as [x] PASS', () => {
  return gateTrackerSrc.includes('[x] PASS') && gateTrackerSrc.includes('T3 Skills Installation');
});

// Test 2: gate-tracker.md mentions Sprints 123-128 range or 6/6 for T3
test('gate-tracker.md mentions 6/6 T3 skills completion (Sprints 123-128)', () => {
  return gateTrackerSrc.includes('6/6') || gateTrackerSrc.includes('123-128');
});

const commandsPath = join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const commandsSrc  = existsSync(commandsPath) ? readFileSync(commandsPath, 'utf-8') : '';

// Test 3: /achiri in handleHelp
test('/achiri command mentioned in handleHelp()', () => {
  // Check handleHelp function contains /achiri
  const helpStart = commandsSrc.indexOf('export async function handleHelp');
  const helpEnd   = commandsSrc.indexOf('\n}', helpStart) + 2;
  const helpBody  = commandsSrc.slice(helpStart, helpEnd);
  return helpBody.includes('/achiri');
});

// Test 4: /gate in handleHelp
test('/gate command mentioned in handleHelp()', () => {
  const helpStart = commandsSrc.indexOf('export async function handleHelp');
  const helpEnd   = commandsSrc.indexOf('\n}', helpStart) + 2;
  const helpBody  = commandsSrc.slice(helpStart, helpEnd);
  return helpBody.includes('/gate');
});

console.log('\n─────────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
  console.log('STATUS: PASS');
  process.exit(0);
} else {
  console.log('STATUS: FAIL');
  process.exit(1);
}
