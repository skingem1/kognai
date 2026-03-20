// Sprint 331 — validate-posting-schedule.ts
// Validates the posting schedule generator and /postplan command integration.

import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('=== Sprint 331 — Posting Schedule Validation ===\n');

// Test 1: Generator script exists and exports generateSchedule
console.log('Test 1: Generator module');
const genPath = path.join(ROOT, 'scripts', 'scs001', 'generate-posting-schedule.ts');
assert('Generator file exists', existsSync(genPath));

const genSrc = readFileSync(genPath, 'utf-8');
assert('Exports generateSchedule', genSrc.includes('export function generateSchedule'));
assert('Reads experiments.jsonl', genSrc.includes('experiments.jsonl'));
assert('Reads manual-posts.jsonl', genSrc.includes('manual-posts.jsonl'));
assert('Outputs posting-schedule.json', genSrc.includes('posting-schedule.json'));
assert('Has posting time slots', genSrc.includes('POSTING_SLOTS'));
assert('Calculates gate metrics', genSrc.includes('gate_date') && genSrc.includes('pace_needed'));

// Test 2: /postplan in commands.ts
console.log('\nTest 2: Bot command');
const cmdPath = path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const cmdSrc = readFileSync(cmdPath, 'utf-8');
assert('handlePostPlan exported', cmdSrc.includes('export async function handlePostPlan'));
assert('Calls generateSchedule', cmdSrc.includes('generateSchedule'));
assert('Shows gate info', cmdSrc.includes('posts_needed') && cmdSrc.includes('days_to_gate'));
assert('Shows schedule slots', cmdSrc.includes('slot.video_id'));

// Test 3: /postplan routed in index.ts
console.log('\nTest 3: Bot routing');
const idxPath = path.join(ROOT, 'agents', 'telegram-bot', 'index.ts');
const idxSrc = readFileSync(idxPath, 'utf-8');
assert('Imports handlePostPlan', idxSrc.includes('handlePostPlan'));
assert('Routes /postplan case', idxSrc.includes("case '/postplan'"));

// Test 4: Run generator (functional test)
console.log('\nTest 4: Functional test');
try {
  const { generateSchedule } = require(path.join(ROOT, 'scripts', 'scs001', 'generate-posting-schedule'));
  const schedule = generateSchedule();
  assert('Schedule has generated_at', typeof schedule.generated_at === 'string');
  assert('Schedule has slots array', Array.isArray(schedule.slots));
  assert('Schedule has gate_target', schedule.gate_target === 30);
  assert('Schedule has gate_date', schedule.gate_date === '2026-04-07');
  assert('Schedule has posts_needed', typeof schedule.posts_needed === 'number');
  assert('Schedule has pace_needed', typeof schedule.pace_needed === 'number');
  assert('Schedule days = 7', schedule.schedule_days === 7);

  if (schedule.slots.length > 0) {
    const slot = schedule.slots[0];
    assert('Slot has date', typeof slot.date === 'string' && slot.date.length === 10);
    assert('Slot has video_id', typeof slot.video_id === 'string');
    assert('Slot has viral_score', typeof slot.viral_score === 'number');
    assert('Slot has slot_label', typeof slot.slot_label === 'string');
  } else {
    console.log('  SKIP  No slots generated (empty queue)');
  }

  // Verify output file was written
  const outputPath = path.join(ROOT, 'reports', 'posting-schedule.json');
  assert('Output file written', existsSync(outputPath));
} catch (err) {
  assert('Generator runs without error', false, (err as Error).message);
}

// Test 5: TypeScript compile check
console.log('\nTest 5: TypeScript compilation');
try {
  const { execSync } = require('child_process');
  execSync(`npx tsc --noEmit --esModuleInterop --skipLibCheck ${genPath} 2>&1`, {
    cwd: ROOT,
    timeout: 30000,
  });
  assert('Generator compiles', true);
} catch (err) {
  const msg = (err as any).stdout?.toString() ?? (err as Error).message;
  assert('Generator compiles', false, msg.slice(0, 200));
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
