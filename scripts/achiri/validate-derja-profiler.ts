// validate-derja-profiler.ts — Sprint 125
// Validates Achiri derja-profiler T3 skill.
// Tests:
//   1. Tunisian Darija detected (barsha, walakin, kifeh)
//   2. Moroccan Darija detected (zwina, bzzaf, sahbi)
//   3. French/English = unknown dialect
//   4. Darija numerals (7, 3) = informal formality
//   5. MSA vocabulary = formal formality
//
// Run: npx ts-node scripts/achiri/validate-derja-profiler.ts

import { profileMessage } from '../../agents/achiri/derja-profiler';

function pass(msg: string): void { console.log('  ✓ ' + msg); }
function fail(msg: string): void { console.error('  ✗ FAIL: ' + msg); process.exit(1); }

function main(): void {
  console.log('\n=== Sprint 125: Achiri Derja Profiler Validation ===\n');

  // --- Test 1: Tunisian Darija detected ---
  console.log('Test 1: Tunisian Darija markers detected');
  const r1 = profileMessage('Aslema! Chnahwelek? Barsha walakin kifeh el youm?');
  console.log('  dialect=' + r1.dialect + ' confidence=' + r1.confidence + ' features=' + r1.features.join(', '));
  if (r1.dialect !== 'tunisian') fail('Expected tunisian, got ' + r1.dialect + '. Features: ' + r1.features.join(', '));
  if (r1.confidence < 0.5) fail('Expected confidence >= 0.5, got ' + r1.confidence);
  pass('Tunisian detected: dialect=' + r1.dialect + ' confidence=' + r1.confidence);

  // --- Test 2: Moroccan Darija detected ---
  console.log('\nTest 2: Moroccan Darija markers detected');
  const r2 = profileMessage('Labas! Zwina sahbi, bzzaf daba mazal?');
  console.log('  dialect=' + r2.dialect + ' confidence=' + r2.confidence + ' features=' + r2.features.join(', '));
  if (r2.dialect !== 'moroccan') fail('Expected moroccan, got ' + r2.dialect + '. Features: ' + r2.features.join(', '));
  if (r2.confidence < 0.5) fail('Expected confidence >= 0.5, got ' + r2.confidence);
  pass('Moroccan detected: dialect=' + r2.dialect + ' confidence=' + r2.confidence);

  // --- Test 3: French/English = unknown dialect ---
  console.log('\nTest 3: French/English text = unknown dialect');
  const r3 = profileMessage('Hello, how are you today? I would like to know more about this topic.');
  console.log('  dialect=' + r3.dialect + ' confidence=' + r3.confidence);
  if (r3.dialect !== 'unknown') fail('Expected unknown, got ' + r3.dialect);
  pass('No Darija markers: dialect=unknown (confidence=' + r3.confidence + ')');

  // --- Test 4: Darija numerals = informal ---
  console.log('\nTest 4: Darija numerals (7, 3, 9) = informal formality');
  const r4 = profileMessage('Chnou 7ket? Rani m3ak wlakin 3andek mochkla?');
  console.log('  formality=' + r4.formality + ' features=' + r4.features.filter(f => f.includes('informal')).join(', '));
  if (r4.formality !== 'informal') fail('Expected informal, got ' + r4.formality);
  pass('Darija numerals detected as informal: formality=' + r4.formality);

  // --- Test 5: MSA vocabulary = formal/neutral ---
  console.log('\nTest 5: MSA/formal vocabulary = formal formality');
  const r5 = profileMessage('السيد المحترم، أنا أرغب في الاستفسار عن الموضوع التالي بكل أدب واحترام.');
  console.log('  formality=' + r5.formality + ' features=' + r5.features.filter(f => f.includes('formal')).join(', '));
  if (r5.formality !== 'formal') fail('Expected formal, got ' + r5.formality + '. Features: ' + r5.features.join(', '));
  pass('MSA text = formal: formality=' + r5.formality);

  console.log('\n=== ALL TESTS PASSED (5/5) ===\n');
  console.log('Sprint 125 validation: PASS');
  console.log('  - Tunisian Darija detection: OK');
  console.log('  - Moroccan Darija detection: OK');
  console.log('  - Unknown for French/English: OK');
  console.log('  - Informal formality via Darija numerals: OK');
  console.log('  - Formal formality via MSA markers: OK');
}

main();
