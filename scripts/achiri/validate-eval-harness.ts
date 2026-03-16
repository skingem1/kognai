// validate-eval-harness.ts — Sprint 124
// Validates Achiri eval-harness T3 skill.
// Tests:
//   1. Ideal Darija response scores >= 70 (passed=true)
//   2. Empty/too-short response scores < 70 (passed=false)
//   3. English-only response scores lower than Darija response
//   4. batchEval aggregates correctly (pass_rate, avg_score)
//   5. Tunisian cultural markers boost score vs generic response
//
// Run: npx ts-node scripts/achiri/validate-eval-harness.ts

import { evalResponse, batchEval } from '../../agents/achiri/eval-harness';

function pass(msg: string): void { console.log('  ✓ ' + msg); }
function fail(msg: string): void { console.error('  ✗ FAIL: ' + msg); process.exit(1); }

function main(): void {
  console.log('\n=== Sprint 124: Achiri Eval Harness Validation ===\n');

  // --- Test 1: Ideal Darija response scores >= 70 ---
  console.log('Test 1: Ideal Darija response scores >= 70');
  const idealReply =
    'Aslema! Barsha marhba bik 😊 Rani hna n3awnek — chnou el mochkla? ' +
    "Nkammlo ensembles insha'allah. Wakha?";
  const r1 = evalResponse('Aslema!', idealReply);
  console.log('  Score: ' + r1.score + ' | breakdown: warmth=' + r1.breakdown.warmth +
    ' cultural=' + r1.breakdown.cultural + ' code_switch=' + r1.breakdown.code_switch +
    ' length=' + r1.breakdown.length + ' safety=' + r1.breakdown.safety);
  if (!r1.passed) fail('Ideal Darija response should pass (score=' + r1.score + ' < 70). Flags: ' + r1.flags.join(', '));
  if (r1.score < 70) fail('Expected score >= 70, got ' + r1.score);
  pass('Ideal response: score=' + r1.score + ', passed=true');

  // --- Test 2: Empty response scores < 70 (failed) ---
  console.log('\nTest 2: Empty response scores < 70');
  const r2 = evalResponse('test', '');
  if (r2.passed) fail('Empty response should not pass');
  if (r2.score >= 70) fail('Empty response should score < 70, got ' + r2.score);
  pass('Empty response: score=' + r2.score + ', passed=false');

  // Test 2b: Too short (< 30 chars)
  const r2b = evalResponse('hi', 'ok');
  if (r2b.passed) fail('2-char response should not pass');
  pass('2-char response: score=' + r2b.score + ', passed=false');

  // --- Test 3: English-only response scores lower than Darija response ---
  console.log('\nTest 3: English-only vs Darija response scoring');
  const englishReply = 'Hello! I am here to help you with any questions you might have. Please let me know what you need assistance with today. I will do my best to provide useful information.';
  const darijaReply = 'Marhba bik! 😄 Rani hna walakin 3andek ay sou\'al, n3awnek nshoufou ensembles insha\'allah. Kifeh nchouf n3awnek lyoum?';

  const rEng = evalResponse('hello', englishReply);
  const rDar = evalResponse('hello', darijaReply);
  console.log('  English score: ' + rEng.score + ' | Darija score: ' + rDar.score);
  if (rDar.score <= rEng.score) {
    fail('Darija response (' + rDar.score + ') should score higher than English-only (' + rEng.score + ')');
  }
  pass('Darija response (' + rDar.score + ') scores higher than English-only (' + rEng.score + ')');

  // --- Test 4: batchEval aggregates correctly ---
  console.log('\nTest 4: batchEval aggregates pass_rate and avg_score');
  const pairs = [
    { user: 'Aslema!', reply: idealReply },          // passes
    { user: 'hi', reply: darijaReply },              // passes
    { user: 'test', reply: '' },                     // fails
    { user: 'hello', reply: 'ok' },                  // fails
  ];
  const batch = batchEval(pairs);
  console.log('  Total: ' + batch.total + ' | Passed: ' + batch.passed + ' | Pass rate: ' + batch.pass_rate_pct + '% | Avg: ' + batch.avg_score);
  if (batch.total !== 4) fail('Expected total=4, got ' + batch.total);
  if (batch.passed !== 2) fail('Expected passed=2 (first two), got ' + batch.passed);
  if (batch.pass_rate_pct !== 50) fail('Expected pass_rate_pct=50, got ' + batch.pass_rate_pct);
  if (batch.avg_score < 1) fail('avg_score should be > 0');
  pass('batchEval: total=4, passed=2, pass_rate=50%, avg=' + batch.avg_score);

  // --- Test 5: Cultural markers boost score ---
  console.log('\nTest 5: Tunisian cultural markers boost score');
  const genericReply = 'Marhba bik! 😄 N3awnek rani hna walakin ay sou\'al. Nkammel ensembles insha\'allah wakha?';
  const culturalReply = 'Marhba bik! 😄 Tounes 3andha barsha 7waya — Espérance, brik, harissa, insha\'allah n7kou. N3awnek rani hna walakin ay sou\'al lyoum?';
  const rGen = evalResponse('tell me about Tunisia', genericReply);
  const rCul = evalResponse('tell me about Tunisia', culturalReply);
  console.log('  Generic score: ' + rGen.score + ' | Cultural score: ' + rCul.score);
  if (rCul.score <= rGen.score) {
    fail('Cultural reply (' + rCul.score + ') should score higher than generic (' + rGen.score + ')');
  }
  pass('Cultural markers boost: ' + rGen.score + ' → ' + rCul.score + ' (+' + (rCul.score - rGen.score) + ')');

  console.log('\n=== ALL TESTS PASSED (5/5) ===\n');
  console.log('Sprint 124 validation: PASS');
  console.log('  - evalResponse() scoring: warmth/cultural/code_switch/length/safety: OK');
  console.log('  - Ideal response passes (score >= 70): OK');
  console.log('  - Darija outscores English-only: OK');
  console.log('  - batchEval aggregation: OK');
  console.log('  - Cultural markers boost score: OK');
}

main();
