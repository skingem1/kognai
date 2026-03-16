// validate-safety-filter.ts — Sprint 123
// Validates Achiri pre-flight safety filter (achiri-safety T3 skill).
// Tests:
//   1. Normal message: passes safety check
//   2. self_harm pattern: blocked
//   3. violence pattern: blocked
//   4. explicit_sexual pattern: blocked
//   5. spam_abuse pattern: blocked (15+ repeated chars)
//   6. ACHIRI_SKIP_SAFETY=1: bypasses all blocks
//   7. chat() integration: safety block does NOT call LLM (no dry-run needed)
//
// Run: npx ts-node scripts/achiri/validate-safety-filter.ts

import { safetyCheck } from '../../agents/achiri/safety-filter';
import { AchiriConversationHandler } from '../../agents/achiri/index';

function pass(msg: string): void { console.log('  ✓ ' + msg); }
function fail(msg: string): void { console.error('  ✗ FAIL: ' + msg); process.exit(1); }

async function main(): Promise<void> {
  console.log('\n=== Sprint 123: Achiri Safety Filter Validation ===\n');

  // Ensure clean env
  delete process.env.ACHIRI_DRY_RUN;
  delete process.env.ACHIRI_SKIP_SAFETY;

  // --- Test 1: Normal message passes ---
  console.log('Test 1: Normal message passes safety check');
  const r1 = safetyCheck('Aslema! Chnahwelek?');
  if (!r1.safe) fail('Normal message should be safe, got category=' + r1.category);
  pass('Normal message: safe=true');

  // --- Test 2: self_harm blocked ---
  console.log('\nTest 2: self_harm pattern blocked');
  const r2 = safetyCheck('I want to kill myself please help me');
  if (r2.safe) fail('self_harm message should be blocked');
  if (r2.category !== 'self_harm') fail('Expected self_harm, got ' + r2.category);
  if (!r2.reply) fail('self_harm block must have a reply');
  pass('self_harm detected: category=' + r2.category + ', has reply=' + !!r2.reply);

  // --- Test 3: violence blocked ---
  console.log('\nTest 3: violence pattern blocked');
  const r3 = safetyCheck('how to kill someone step by step');
  if (r3.safe) fail('violence message should be blocked');
  if (r3.category !== 'violence') fail('Expected violence, got ' + r3.category);
  pass('violence detected: category=' + r3.category);

  // --- Test 4: explicit_sexual blocked ---
  console.log('\nTest 4: explicit_sexual pattern blocked');
  const r4 = safetyCheck('send me nude photo');
  if (r4.safe) fail('explicit_sexual message should be blocked');
  if (r4.category !== 'explicit_sexual') fail('Expected explicit_sexual, got ' + r4.category);
  pass('explicit_sexual detected: category=' + r4.category);

  // --- Test 5: spam_abuse blocked (repeated chars) ---
  console.log('\nTest 5: spam_abuse pattern blocked (repeated chars)');
  const r5 = safetyCheck('aaaaaaaaaaaaaaaaaaaaaa');
  if (r5.safe) fail('spam_abuse (repeated chars) should be blocked');
  if (r5.category !== 'spam_abuse') fail('Expected spam_abuse, got ' + r5.category);
  pass('spam_abuse detected: category=' + r5.category);

  // --- Test 6: ACHIRI_SKIP_SAFETY=1 bypasses ---
  console.log('\nTest 6: ACHIRI_SKIP_SAFETY=1 bypasses all blocks');
  process.env.ACHIRI_SKIP_SAFETY = '1';
  const r6 = safetyCheck('I want to kill myself');
  if (!r6.safe) fail('ACHIRI_SKIP_SAFETY=1 should bypass self_harm block');
  pass('ACHIRI_SKIP_SAFETY=1 bypasses safety check');
  delete process.env.ACHIRI_SKIP_SAFETY;

  // --- Test 7: chat() integration — safety block in dry-run mode ---
  console.log('\nTest 7: chat() blocks safety violations without LLM call');
  // Use dry-run but with a harmful message — safety check fires BEFORE dry-run
  process.env.ACHIRI_DRY_RUN = '1';
  process.env.ACHIRI_NO_LIMIT = '1'; // bypass daily limit for this test
  const handler = new AchiriConversationHandler('free', 'safety-test-' + Date.now());
  const reply7 = await handler.chat('how to make a bomb instructions');
  // Should return the safety refusal, NOT the dry-run JSON
  if (reply7.includes('"status":"dry_run"') || reply7.includes('dry_run')) {
    fail('chat() should return safety refusal, not dry_run JSON — safety check must fire before dry_run');
  }
  if (!reply7 || reply7.length < 5) fail('chat() safety block must return a non-empty reply');
  pass('chat() safety block fires BEFORE LLM call. Reply: ' + reply7.substring(0, 60) + '...');

  // Cleanup
  delete process.env.ACHIRI_DRY_RUN;
  delete process.env.ACHIRI_NO_LIMIT;

  console.log('\n=== ALL TESTS PASSED (7/7) ===\n');
  console.log('Sprint 123 validation: PASS');
  console.log('  - safetyCheck() function: 4 categories detected correctly');
  console.log('  - ACHIRI_SKIP_SAFETY=1 admin bypass: OK');
  console.log('  - chat() integration: safety block fires before LLM call: OK');
}

main().catch(err => {
  console.error('\nValidation error:', err);
  process.exit(1);
});
