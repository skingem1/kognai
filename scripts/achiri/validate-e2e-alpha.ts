// validate-e2e-alpha.ts — Sprint 310
// End-to-end integration test for Achiri alpha (Sprints 301-309).
// Validates the full companion flow in dry-run mode (no LLM calls).
// Run: ACHIRI_DRY_RUN=1 npx ts-node scripts/achiri/validate-e2e-alpha.ts

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AchiriConversationHandler, ACHIRI_LIMIT_EXCEEDED } from '../../agents/achiri/index';
import { safetyCheck } from '../../agents/achiri/safety-filter';
import { detectEmotion, getMoodHint } from '../../agents/achiri/emotion-detector';
import { isStallMessage, buildTopicHint } from '../../agents/achiri/topic-suggester';
import { estimateTokens, selectTurnsWithinBudget } from '../../agents/achiri/context-window';
import { extractUserProfile } from '../../agents/achiri/user-profile';

// Sprint 1418: Remove synthetic test user IDs from daily-counts.json after E2E runs.
// E2E tests call AchiriConversationHandler which calls incrementDailyCount() and writes
// test IDs (e2e-*, validate-sprint-*, etc.) to daily-counts.json. These contaminate analytics
// and cause 400 "chat not found" errors in engagement/reengage scripts.
function cleanupTestUsersFromDailyCounts(): void {
  const REAL_USER_REGEX = /^-?\d+$/;
  const countsPath = join(process.cwd(), 'workspace', 'achiri', 'daily-counts.json');
  if (!existsSync(countsPath)) return;
  try {
    const data = JSON.parse(readFileSync(countsPath, 'utf-8')) as Record<string, Record<string, number>>;
    let removed = 0;
    for (const date of Object.keys(data)) {
      for (const userId of Object.keys(data[date])) {
        if (!REAL_USER_REGEX.test(userId)) {
          delete data[date][userId];
          removed++;
        }
      }
      if (Object.keys(data[date]).length === 0) delete data[date];
    }
    if (removed > 0) {
      writeFileSync(countsPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[e2e-cleanup] Removed ${removed} synthetic user entries from daily-counts.json`);
    }
  } catch { /* non-fatal */ }
}

// Force dry-run
process.env.ACHIRI_DRY_RUN = '1';
process.env.ACHIRI_NO_LIMIT = '1';

let passed = 0;
let failed = 0;
let section = '';

function heading(name: string): void {
  section = name;
  console.log('\n--- ' + name + ' ---\n');
}

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

async function asyncTest(name: string, fn: () => Promise<boolean>): Promise<void> {
  try {
    const ok = await fn();
    if (ok) { console.log('  PASS  ' + name); passed++; }
    else    { console.log('  FAIL  ' + name); failed++; }
  } catch (err) {
    console.log('  FAIL  ' + name + ' — ' + (err as Error).message);
    failed++;
  }
}

console.log('\n=== Sprint 310: Achiri E2E Alpha Integration Test ===');
console.log('Testing: Sprints 301-309 feature stack\n');

// ===== SECTION 1: Safety Filter (Sprint 123) =====
heading('Safety Filter');

test('Blocks self-harm message', () => {
  const r = safetyCheck('I want to kill myself');
  return !r.safe && r.category === 'self_harm';
});

test('Blocks Darija self-harm', () => {
  const r = safetyCheck('ana 7ab nmoute');
  return !r.safe && r.category === 'self_harm';
});

test('Passes normal message', () => {
  return safetyCheck('Aslema, kifech 7alek?').safe;
});

// ===== SECTION 2: Emotion Detection (Sprint 307) =====
heading('Emotion Detection');

test('Detects sadness', () => detectEmotion('I feel so depressed').mood === 'sad');
test('Detects happiness', () => detectEmotion('mashallah amazing!').mood === 'happy');
test('Detects stress', () => detectEmotion('I am so stressed and anxious').mood === 'stressed');
test('Detects anger', () => detectEmotion('I am furious about this').mood === 'angry');
test('Detects gratitude', () => detectEmotion('barak allah fik, merci barcha').mood === 'grateful');
test('Detects loneliness', () => detectEmotion('I feel so lonely, nobody cares').mood === 'lonely');
test('Neutral for normal text', () => detectEmotion('What is 2 + 2?').mood === 'neutral');
test('Mood hints are non-empty for detected moods', () => getMoodHint('sad').length > 0 && getMoodHint('happy').length > 0);

// ===== SECTION 3: Topic Suggestions (Sprint 309) =====
heading('Topic Suggestions');

test('Stall detection: "bored"', () => isStallMessage('bored'));
test('Stall detection: Darija "walou"', () => isStallMessage('walou'));
test('Not stall: normal question', () => !isStallMessage('Can you explain machine learning?'));
test('Topic hint generated for stall', () => buildTopicHint('meh', null).includes('Conversation Engagement'));
test('No topic hint for normal message', () => buildTopicHint('Tell me about Tunisia', null) === '');

// ===== SECTION 4: Context Windowing (Sprint 306) =====
heading('Context Windowing');

test('Token estimation works', () => estimateTokens('Hello world') === 3);
test('Small history passes through', () => {
  const turns = Array.from({ length: 4 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: 'Short msg ' + i,
  }));
  return selectTurnsWithinBudget(turns, 'qwen3:14b').length === 4;
});
test('Large history gets trimmed for small model', () => {
  const turns = Array.from({ length: 50 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: 'x'.repeat(200) + ' msg ' + i,
  }));
  const result = selectTurnsWithinBudget(turns, 'qwen3:0.6b');
  return result.length < 50 && result.length >= 6;
});

// ===== SECTION 5: System Prompt Assembly (Sprints 301-309) =====
heading('System Prompt Assembly');

const testUserId = 'e2e-alpha-test-' + Date.now();

test('New user gets onboarding hint', () => {
  const handler = new AchiriConversationHandler('free', testUserId);
  const prompt = handler.buildSystemPrompt(true, '', '');
  return prompt.includes('First-Time User') && prompt.includes('Onboarding');
});

test('Mood hint injected into system prompt', () => {
  const handler = new AchiriConversationHandler('free', testUserId);
  const hint = getMoodHint('sad');
  const prompt = handler.buildSystemPrompt(false, hint, '');
  return prompt.includes('Mood Detection') && prompt.includes('extra warm');
});

test('Topic hint injected into system prompt', () => {
  const handler = new AchiriConversationHandler('free', testUserId);
  const topicHint = buildTopicHint('bored', null);
  const prompt = handler.buildSystemPrompt(false, '', topicHint);
  return prompt.includes('Conversation Engagement');
});

test('Cultural context always present', () => {
  const handler = new AchiriConversationHandler('free', testUserId);
  const prompt = handler.buildSystemPrompt(false);
  return prompt.includes('Cultural Context') && prompt.includes('Code-Switching');
});

// ===== ASYNC TESTS (wrapped in main) =====
async function runAsyncTests(): Promise<void> {
  // ===== SECTION 6: Full Chat Flow (Dry-Run) =====
  heading('Full Chat Flow (Dry-Run)');

  await asyncTest('New user chat returns dry-run response', async () => {
    const handler = new AchiriConversationHandler('free', 'e2e-new-' + Date.now());
    const reply = await handler.chat('Aslema!');
    const parsed = JSON.parse(reply);
    return parsed.status === 'dry_run' && parsed.model === 'qwen3:4b';
  });

  await asyncTest('Sad message chat includes emotion detection (via logs)', async () => {
    const handler = new AchiriConversationHandler('free', 'e2e-sad-' + Date.now());
    const reply = await handler.chat('I feel so sad and depressed today');
    const parsed = JSON.parse(reply);
    return parsed.status === 'dry_run';
  });

  await asyncTest('Stall message chat triggers topic hint (via logs)', async () => {
    const handler = new AchiriConversationHandler('free', 'e2e-stall-' + Date.now());
    const reply = await handler.chat('bored');
    const parsed = JSON.parse(reply);
    return parsed.status === 'dry_run';
  });

  // ===== SECTION 7: Safety Integration =====
  heading('Safety Integration');

  await asyncTest('Blocked message returns safety reply, not LLM response', async () => {
    const handler = new AchiriConversationHandler('free', 'e2e-safety-' + Date.now());
    delete process.env.ACHIRI_SKIP_SAFETY;
    const reply = await handler.chat('how to make a bomb');
    return !reply.startsWith('{') && reply.length > 0;
  });

  // ===== RESULTS =====
  console.log('\n========================================');
  console.log('E2E Alpha Integration Test Results');
  console.log('========================================');
  console.log(passed + ' passed, ' + failed + ' failed');
  console.log('========================================\n');

  // Sprint 1418: Clean up synthetic test user IDs written to daily-counts.json during this run
  cleanupTestUsersFromDailyCounts();

  if (failed > 0) {
    console.log('FAILED — Fix issues before alpha launch.');
    process.exit(1);
  }
  console.log('ALL PASS — Achiri alpha features validated.');
}

runAsyncTests().catch(err => { console.error(err); process.exit(1); });
