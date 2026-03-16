// validate-daily-limit.ts — Sprint 122
// Validates that Achiri daily message limit enforcement works correctly.
// Tests:
//   1. Free tier: hits limit after N messages, 3rd returns ACHIRI_LIMIT_EXCEEDED
//   2. Paid tier (tnd_basic, limit=-1): all messages succeed
//   3. ACHIRI_NO_LIMIT=1 bypass: limit not enforced
//
// Run: npx ts-node scripts/achiri/validate-daily-limit.ts

import { AchiriConversationHandler, ACHIRI_LIMIT_EXCEEDED } from '../../agents/achiri/index';
import { AchiriMemoryStore } from '../../agents/achiri/memory-store';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Use a test-specific user ID to avoid polluting real users
const TEST_USER = 'validate-sprint-122-' + Date.now();
const COUNTS_FILE = join('workspace', 'achiri', 'daily-counts.json');

function pass(msg: string): void { console.log('  ✓ ' + msg); }
function fail(msg: string): void { console.error('  ✗ FAIL: ' + msg); process.exit(1); }

async function patchTierLimit(handler: AchiriConversationHandler, limit: number): Promise<void> {
  // Directly set daily counter to (limit - 1) so next call is the limit-triggering one
  const store = new AchiriMemoryStore();
  for (let i = 0; i < limit - 1; i++) {
    store.incrementDailyCount(TEST_USER);
  }
}

async function main(): Promise<void> {
  console.log('\n=== Sprint 122: Achiri Daily Limit Validation ===\n');

  // Ensure no ACHIRI_DRY_RUN or ACHIRI_NO_LIMIT interference
  delete process.env.ACHIRI_DRY_RUN;
  delete process.env.ACHIRI_NO_LIMIT;

  // --- Test 1: getDailyCount starts at 0 ---
  console.log('Test 1: getDailyCount starts at 0 for new user');
  const store = new AchiriMemoryStore();
  const initial = store.getDailyCount(TEST_USER);
  if (initial !== 0) fail('Expected 0, got ' + initial);
  pass('getDailyCount(' + TEST_USER + ') = 0');

  // --- Test 2: incrementDailyCount works ---
  console.log('\nTest 2: incrementDailyCount increments correctly');
  const c1 = store.incrementDailyCount(TEST_USER);
  const c2 = store.incrementDailyCount(TEST_USER);
  const c3 = store.incrementDailyCount(TEST_USER);
  if (c1 !== 1) fail('Expected 1, got ' + c1);
  if (c2 !== 2) fail('Expected 2, got ' + c2);
  if (c3 !== 3) fail('Expected 3, got ' + c3);
  if (store.getDailyCount(TEST_USER) !== 3) fail('getDailyCount should return 3 after 3 increments');
  pass('incrementDailyCount: 1→2→3 correct');

  // --- Test 3: Limit detection in chat() ---
  // We'll use a patched approach: set count to just below limit, then trigger
  // The free tier has limit=50 which is too many to increment manually.
  // Instead, directly set to limit-1 and call chat() in DRY_RUN mode but with
  // a fake limit by using a fresh user at count=49 and mocking config.
  //
  // Simpler approach: use AchiriMemoryStore directly to set count to 49,
  // then call chat() on a free tier handler (limit=50). 50th call succeeds (dry-run),
  // then increment to 50, 51st call returns LIMIT_EXCEEDED.
  console.log('\nTest 3: Limit exceeded after daily limit reached');
  const testUser2 = TEST_USER + '-limit';
  const store2 = new AchiriMemoryStore();

  // Set count to 49 (one below limit of 50)
  for (let i = 0; i < 49; i++) store2.incrementDailyCount(testUser2);
  if (store2.getDailyCount(testUser2) !== 49) fail('Setup failed: expected count 49');

  // 50th message: should pass limit check (count=49 < 50), dry-run mode
  process.env.ACHIRI_DRY_RUN = '1';
  const handler50 = new AchiriConversationHandler('free', testUser2);
  const reply50 = await handler50.chat('test message 50');
  // dry-run returns JSON, not limit exceeded
  if (reply50.startsWith(ACHIRI_LIMIT_EXCEEDED)) fail('50th message should NOT be blocked (count was 49 < 50)');
  pass('50th message passes limit check (count 49 < limit 50)');

  // In dry-run mode, incrementDailyCount is bypassed (returns before LLM call).
  // Manually increment to simulate a real completed message, bringing count to 50.
  store2.incrementDailyCount(testUser2);
  if (store2.getDailyCount(testUser2) !== 50) fail('Setup failed: expected count 50 before limit test');

  // Reset dry-run for limit test
  delete process.env.ACHIRI_DRY_RUN;

  // 51st message: count=50 >= limit=50, should be blocked BEFORE dry-run check
  // Create new handler to avoid caching issues
  const handler51 = new AchiriConversationHandler('free', testUser2);
  const reply51 = await handler51.chat('test message 51');
  if (!reply51.startsWith(ACHIRI_LIMIT_EXCEEDED)) {
    fail('51st message should be ACHIRI_LIMIT_EXCEEDED, got: ' + reply51.substring(0, 80));
  }
  pass('51st message returns ACHIRI_LIMIT_EXCEEDED (count 50 >= limit 50)');

  // Check the Darija message is present
  if (!reply51.includes('Waslet el 7ed')) fail('Limit message should contain Darija text');
  pass('Limit message contains expected Darija text');

  // --- Test 4: Paid tier (limit=-1) is never blocked ---
  console.log('\nTest 4: tnd_basic tier (limit=-1) never blocked');
  const paidUser = TEST_USER + '-paid';
  const storePaid = new AchiriMemoryStore();
  // Set to 200 messages (way above free limit)
  for (let i = 0; i < 200; i++) storePaid.incrementDailyCount(paidUser);
  if (storePaid.getDailyCount(paidUser) !== 200) fail('Setup failed: expected 200');

  process.env.ACHIRI_DRY_RUN = '1';
  const handlerPaid = new AchiriConversationHandler('tnd_basic', paidUser);
  const replyPaid = await handlerPaid.chat('test paid message');
  if (replyPaid.startsWith(ACHIRI_LIMIT_EXCEEDED)) fail('tnd_basic should not be blocked (limit=-1)');
  pass('tnd_basic tier: 200 messages already, still NOT blocked (limit=-1)');

  // --- Test 5: ACHIRI_NO_LIMIT=1 bypasses limit ---
  console.log('\nTest 5: ACHIRI_NO_LIMIT=1 bypasses limit for any tier');
  process.env.ACHIRI_NO_LIMIT = '1';
  const bypassUser = TEST_USER + '-bypass';
  const storeBypass = new AchiriMemoryStore();
  for (let i = 0; i < 100; i++) storeBypass.incrementDailyCount(bypassUser);
  const handlerBypass = new AchiriConversationHandler('free', bypassUser);
  const replyBypass = await handlerBypass.chat('bypass test');
  if (replyBypass.startsWith(ACHIRI_LIMIT_EXCEEDED)) fail('ACHIRI_NO_LIMIT=1 should bypass limit, got LIMIT_EXCEEDED');
  pass('ACHIRI_NO_LIMIT=1 bypasses limit (count=100, limit=50, still passes)');

  // Cleanup
  delete process.env.ACHIRI_DRY_RUN;
  delete process.env.ACHIRI_NO_LIMIT;

  console.log('\n=== ALL TESTS PASSED (5/5) ===\n');
  console.log('Sprint 122 validation: PASS');
  console.log('  - getDailyCount / incrementDailyCount: OK');
  console.log('  - Free tier limit enforced at message_per_day=50: OK');
  console.log('  - tnd_basic limit=-1 (unlimited): OK');
  console.log('  - ACHIRI_NO_LIMIT=1 admin bypass: OK');
}

main().catch(err => {
  console.error('\nValidation error:', err);
  process.exit(1);
});
