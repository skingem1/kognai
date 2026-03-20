// validate-onboarding.ts — Sprint 308
// Validates the first-time user onboarding flow.
// Run: npx ts-node scripts/achiri/validate-onboarding.ts

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const INDEX_PATH = join(ROOT, 'agents', 'achiri', 'index.ts');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean): void {
  try {
    const ok = fn();
    if (ok) { console.log('  PASS  ' + name); passed++; }
    else    { console.log('  FAIL  ' + name); failed++; }
  } catch (err) {
    console.log('  FAIL  ' + name + ' — ' + (err as Error).message);
    failed++;
  }
}

console.log('\n=== Sprint 308: Onboarding Flow Validation ===\n');

const indexSrc = readFileSync(INDEX_PATH, 'utf8');

// Test 1: ONBOARDING_HINT constant exists
test('ONBOARDING_HINT constant defined in index.ts', () => {
  return indexSrc.includes('ONBOARDING_HINT');
});

// Test 2: Onboarding hint mentions introducing Achiri
test('Onboarding hint includes self-introduction instruction', () => {
  return indexSrc.includes('Introduce yourself') && indexSrc.includes('Achiri');
});

// Test 3: Onboarding hint asks for name
test('Onboarding hint includes name-asking instruction', () => {
  return indexSrc.includes('esmek') || indexSrc.includes("appelles");
});

// Test 4: Onboarding is gated on isNewSession + no summary + zero messages
test('Onboarding gated on isNewSession && !summaryCtx && message_count === 0', () => {
  return indexSrc.includes('isNewSession && !summaryCtx && profile.message_count === 0');
});

// Test 5: Dry-run test — new handler with fresh userId shows onboarding in system prompt
test('Dry-run: new user system prompt contains onboarding hint', () => {
  // Use dynamic require to get the handler class
  const { AchiriConversationHandler } = require(INDEX_PATH.replace('.ts', ''));
  const handler = new AchiriConversationHandler('free', 'test-onboard-' + Date.now());
  const prompt = handler.buildSystemPrompt(true, '');
  return prompt.includes('First-Time User') && prompt.includes('Onboarding');
});

// Test 6: Returning user does NOT get onboarding
test('Dry-run: returning user (isNewSession=false) does NOT get onboarding', () => {
  const { AchiriConversationHandler } = require(INDEX_PATH.replace('.ts', ''));
  const handler = new AchiriConversationHandler('free', 'test-return-' + Date.now());
  const prompt = handler.buildSystemPrompt(false, '');
  return !prompt.includes('First-Time User');
});

// Test 7: Onboarding hint tells model not to be robotic
test('Onboarding hint discourages product-tour style', () => {
  return indexSrc.includes('not a product tour') || indexSrc.includes('DO NOT list features');
});

console.log('\n--- Results: ' + passed + ' passed, ' + failed + ' failed ---');
if (failed > 0) { console.log('\nFAILED'); process.exit(1); }
console.log('\nALL PASS');
