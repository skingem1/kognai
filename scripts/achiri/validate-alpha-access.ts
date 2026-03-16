// validate-alpha-access.ts — Sprint 131
// Validates that commands.ts has tier wiring + alpha whitelist gate
// Run: npx ts-node scripts/achiri/validate-alpha-access.ts

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const COMMANDS_PATH = join(ROOT, 'agents', 'telegram-bot', 'commands.ts');

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

console.log('\n=== Sprint 131: Achiri Alpha Access Gate Validation ===\n');

const commandsSrc = existsSync(COMMANDS_PATH) ? readFileSync(COMMANDS_PATH, 'utf-8') : '';

// Test 1: ACHIRI_ALPHA_WHITELIST env var referenced
test('ACHIRI_ALPHA_WHITELIST env var used in commands.ts', () => {
  if (!commandsSrc) throw new Error('commands.ts not found at ' + COMMANDS_PATH);
  return commandsSrc.includes('ACHIRI_ALPHA_WHITELIST');
});

// Test 2: ACHIRI_ALPHA_ONLY env var referenced
test('ACHIRI_ALPHA_ONLY env var used in commands.ts', () => {
  if (!commandsSrc) throw new Error('commands.ts not found');
  return commandsSrc.includes('ACHIRI_ALPHA_ONLY');
});

// Test 3: TelegramDB.get() called for tier lookup
test('TelegramDB.get(chatId) called in handleAchiri for tier lookup', () => {
  if (!commandsSrc) throw new Error('commands.ts not found');
  return commandsSrc.includes('TelegramDB.get(chatId)');
});

// Test 4: Tier mapping present (growth → tnd_basic)
test('TelegramDB tier→Achiri tier mapping present (ACHIRI_TIER_MAP)', () => {
  if (!commandsSrc) throw new Error('commands.ts not found');
  return commandsSrc.includes('tnd_basic') && commandsSrc.includes('tnd_premium') && commandsSrc.includes('ACHIRI_TIER_MAP');
});

// Test 5: .env.example has ACHIRI_ALPHA_WHITELIST
const envExamplePath = join(ROOT, '.env.example');
test('ACHIRI_ALPHA_WHITELIST documented in .env.example', () => {
  const envSrc = existsSync(envExamplePath) ? readFileSync(envExamplePath, 'utf-8') : '';
  return envSrc.includes('ACHIRI_ALPHA_WHITELIST');
});

// Test 6: sprint-131.json exists
const sprintPath = join(ROOT, 'workspace', 'sprints', 'sprint-131.json');
test('sprint-131.json exists', () => existsSync(sprintPath));

console.log('\n─────────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
  console.log('STATUS: PASS');
  process.exit(0);
} else {
  console.log('STATUS: FAIL');
  process.exit(1);
}
