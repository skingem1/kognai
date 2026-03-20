// Sprint 332 — validate-today-captions.ts
// Validates the /todaycaptions command integration.

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

console.log('=== Sprint 332 — Today Captions Validation ===\n');

// Test 1: /todaycaptions in commands.ts
console.log('Test 1: Bot command');
const cmdPath = path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const cmdSrc = readFileSync(cmdPath, 'utf-8');
assert('handleTodayCaptions exported', cmdSrc.includes('export async function handleTodayCaptions'));
assert('Calls generateSchedule', cmdSrc.includes('generateSchedule'));
assert('Filters today slots', cmdSrc.includes("s.date === today"));
assert('Loads viral-topics.json', cmdSrc.includes('viral-topics.json'));
assert('Sends caption as code block', cmdSrc.includes("'```\\n' + caption"));
assert('Includes /record instruction', cmdSrc.includes('/record'));
assert('Shows gate progress', cmdSrc.includes('posts_needed'));

// Test 2: /todaycaptions routed in index.ts
console.log('\nTest 2: Bot routing');
const idxPath = path.join(ROOT, 'agents', 'telegram-bot', 'index.ts');
const idxSrc = readFileSync(idxPath, 'utf-8');
assert('Imports handleTodayCaptions', idxSrc.includes('handleTodayCaptions'));
assert('Routes /todaycaptions case', idxSrc.includes("case '/todaycaptions'"));

// Test 3: Schedule generator still works (dependency)
console.log('\nTest 3: Schedule generator dependency');
try {
  const { generateSchedule } = require(path.join(ROOT, 'scripts', 'scs001', 'generate-posting-schedule'));
  const schedule = generateSchedule();
  assert('Schedule generates successfully', typeof schedule.slots === 'object');
  assert('Schedule has today filter data', typeof schedule.slots[0]?.date === 'string' || schedule.slots.length === 0);

  const today = new Date().toISOString().slice(0, 10);
  const todaySlots = schedule.slots.filter((s: any) => s.date === today);
  console.log(`  INFO  Today (${today}): ${todaySlots.length} slot(s) in schedule`);
} catch (err) {
  assert('Schedule generator works', false, (err as Error).message);
}

// Test 4: TypeScript type check
console.log('\nTest 4: TypeScript compilation');
try {
  const { execSync } = require('child_process');
  execSync(`npx tsc --noEmit --esModuleInterop --skipLibCheck ${cmdPath} 2>&1`, {
    cwd: ROOT,
    timeout: 30000,
  });
  assert('commands.ts compiles', true);
} catch (err) {
  const msg = (err as any).stdout?.toString() ?? (err as Error).message;
  assert('commands.ts compiles', false, msg.slice(0, 200));
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
