// validate-alpha-access.ts — Sprint 131 (updated Sprint 618)
// Validates Achiri alpha access gate: whitelist, tier routing, access check
// Post-split: checks agents/achiri/telegram-bot.ts (not old agents/telegram-bot/commands.ts)
// Run: npx ts-node scripts/achiri/validate-alpha-access.ts

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const ACHIRI_BOT_PATH = join(ROOT, 'agents', 'achiri', 'telegram-bot.ts');
const ACHIRI_INDEX_PATH = join(ROOT, 'agents', 'achiri', 'index.ts');

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

console.log('\n=== Sprint 131/618: Achiri Alpha Access Gate Validation ===\n');

const botSrc = existsSync(ACHIRI_BOT_PATH) ? readFileSync(ACHIRI_BOT_PATH, 'utf-8') : '';
const indexSrc = existsSync(ACHIRI_INDEX_PATH) ? readFileSync(ACHIRI_INDEX_PATH, 'utf-8') : '';

// Test 1: Achiri Telegram bot file exists
test('Achiri Telegram bot exists', () => botSrc.length > 0);

// Test 2: ACHIRI_ALLOWED_CHAT_IDS env var used for whitelist
test('ACHIRI_ALLOWED_CHAT_IDS used for access control', () => {
  return botSrc.includes('ACHIRI_ALLOWED_CHAT_IDS');
});

// Test 3: hasAccess function exists
test('hasAccess() function for alpha gating', () => {
  return botSrc.includes('hasAccess');
});

// Test 4: Waitlist mechanism exists
test('Waitlist mechanism (addToWaitlist)', () => {
  return botSrc.includes('addToWaitlist') && botSrc.includes('waitlist');
});

// Test 5: Tier system in index.ts (free, tnd_basic, tnd_premium)
test('Tier system in AchiriConversationHandler', () => {
  return indexSrc.includes('free') && indexSrc.includes('tnd_basic') && indexSrc.includes('tnd_premium');
});

// Test 6: .env.example has ACHIRI config
const envExamplePath = join(ROOT, '.env.example');
test('ACHIRI env vars documented in .env.example', () => {
  const envSrc = existsSync(envExamplePath) ? readFileSync(envExamplePath, 'utf-8') : '';
  return envSrc.includes('ACHIRI');
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
