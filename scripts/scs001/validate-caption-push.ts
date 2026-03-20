// Sprint 334 — validate-caption-push.ts
// Validates morning caption push cron and /help update.

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

console.log('=== Sprint 334 — Morning Caption Push Validation ===\n');

// Test 1: Script exists
console.log('Test 1: Caption push script');
const scriptPath = path.join(ROOT, 'scripts', 'scs001', 'morning-caption-push.ts');
assert('Script file exists', existsSync(scriptPath));

const src = readFileSync(scriptPath, 'utf-8');
assert('Uses generateSchedule', src.includes('generateSchedule'));
assert('Filters today slots', src.includes("s.date === today"));
assert('Sends via Telegram API', src.includes('api.telegram.org'));
assert('Reads BOT_TOKEN', src.includes('TELEGRAM_BOT_TOKEN'));
assert('Reads CHAT_ID', src.includes('OWNER_TELEGRAM_CHAT_ID'));
assert('Includes hashtags', src.includes('viral-topics.json'));
assert('Shows gate metrics', src.includes('posts_needed'));

// Test 2: PM2 config
console.log('\nTest 2: PM2 ecosystem config');
const ecoPath = path.join(ROOT, 'ecosystem.config.js');
const ecoSrc = readFileSync(ecoPath, 'utf-8');
assert('kognai-caption-push entry', ecoSrc.includes('kognai-caption-push'));
assert('Cron at 07:30', ecoSrc.includes('"30 7 * * *"'));
assert('Points to morning-caption-push.ts', ecoSrc.includes('morning-caption-push.ts'));

// Test 3: /help updated
console.log('\nTest 3: /help command');
const cmdPath = path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const cmdSrc = readFileSync(cmdPath, 'utf-8');
assert('Help mentions /postplan', cmdSrc.includes('/postplan'));
assert('Help mentions /todaycaptions', cmdSrc.includes('/todaycaptions'));
assert('Help mentions /leaderboard', cmdSrc.includes('/leaderboard'));

// Test 4: TypeScript compile
console.log('\nTest 4: TypeScript compilation');
try {
  const { execSync } = require('child_process');
  execSync(`npx tsc --noEmit --esModuleInterop --skipLibCheck ${scriptPath} 2>&1`, {
    cwd: ROOT,
    timeout: 30000,
  });
  assert('Script compiles', true);
} catch (err) {
  const msg = (err as any).stdout?.toString() ?? (err as Error).message;
  assert('Script compiles', false, msg.slice(0, 200));
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
