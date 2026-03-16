// validate-telegram-http-bridge.ts — Sprint 130
// Validates that commands.ts uses HTTP bridge (not in-process AchiriConversationHandler)
// Run: npx ts-node scripts/achiri/validate-telegram-http-bridge.ts

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

console.log('\n=== Sprint 130: Telegram HTTP Bridge Validation ===\n');

const commandsSrc = existsSync(COMMANDS_PATH) ? readFileSync(COMMANDS_PATH, 'utf-8') : '';

// Test 1: AchiriConversationHandler import REMOVED
test('AchiriConversationHandler direct import removed from commands.ts', () => {
  if (!commandsSrc) throw new Error('commands.ts not found at ' + COMMANDS_PATH);
  return !commandsSrc.includes("from '../achiri/index'");
});

// Test 2: ACHIRI_BASE_URL env var is referenced
test('ACHIRI_BASE_URL env var is used in commands.ts', () => {
  if (!commandsSrc) throw new Error('commands.ts not found');
  return commandsSrc.includes('ACHIRI_BASE_URL');
});

// Test 3: HTTP fetch call to /chat is present
test('HTTP POST /chat fetch call is present in handleAchiri', () => {
  if (!commandsSrc) throw new Error('commands.ts not found');
  return commandsSrc.includes("'/chat'") && commandsSrc.includes("method: 'POST'");
});

// Test 4: limit_exceeded response is handled
test('limit_exceeded response handled in handleAchiri', () => {
  if (!commandsSrc) throw new Error('commands.ts not found');
  return commandsSrc.includes("data.error === 'limit_exceeded'");
});

// Test 5: upgrade_url injected into reply if present
test('upgrade_url is included in limit_exceeded reply message', () => {
  if (!commandsSrc) throw new Error('commands.ts not found');
  return commandsSrc.includes('upgrade_url');
});

// Test 6: env.example has ACHIRI_BASE_URL
const envExamplePath = join(ROOT, '.env.example');
test('ACHIRI_BASE_URL documented in .env.example', () => {
  const envSrc = existsSync(envExamplePath) ? readFileSync(envExamplePath, 'utf-8') : '';
  return envSrc.includes('ACHIRI_BASE_URL=');
});

// Test 7: sprint-130.json exists
const sprintPath = join(ROOT, 'workspace', 'sprints', 'sprint-130.json');
test('sprint-130.json exists', () => existsSync(sprintPath));

console.log('\n─────────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
  console.log('STATUS: PASS');
  process.exit(0);
} else {
  console.log('STATUS: FAIL');
  process.exit(1);
}
