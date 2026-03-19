#!/usr/bin/env ts-node
// Sprint 256 — EVAL-002 Cognee Evaluation Validation

import { runEval002 } from './eval-002-cognee';
import { validateReport, computeVerdict } from './cto-eval-framework';
import { runEval001 } from './eval-001-openviking';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  ✗ FAIL: ' + msg); failed++; process.exitCode = 1; }
  else            { console.log('  ✓ PASS: ' + msg); passed++; }
}

function main(): void {
  console.log('');
  console.log('🔬  Sprint 256 — EVAL-002 Cognee Evaluation Validation');
  console.log('');

  // --- Test 1: Run evaluation ---
  console.log('Test 1: Run EVAL-002');
  const report = runEval002();
  assert(!!report, 'Report generated');
  assert(report.eval_id === 'EVAL-002', 'Eval ID: ' + report.eval_id);
  assert(report.library_name === 'topoteretes/cognee', 'Library: ' + report.library_name);

  // --- Test 2: Criteria validation ---
  console.log('\nTest 2: Criteria');
  assert(report.criteria.length === 5, '5 criteria: ' + report.criteria.length);

  const totalWeight = report.criteria.reduce((sum, c) => sum + c.weight, 0);
  assert(Math.abs(totalWeight - 1.0) < 0.01, 'Weights sum to 1.0: ' + totalWeight.toFixed(2));

  for (const c of report.criteria) {
    assert(c.score >= 1 && c.score <= 5, c.id + ' score in range: ' + c.score);
    assert(!!c.evidence, c.id + ' has evidence');
  }

  // --- Test 3: Verdict computation ---
  console.log('\nTest 3: Verdict');
  const { weighted_score, verdict } = computeVerdict(report.criteria);
  assert(weighted_score > 0 && weighted_score <= 5, 'Score in range: ' + weighted_score.toFixed(2));
  assert(['ADOPT', 'PARTIAL', 'REJECT'].includes(verdict), 'Valid verdict: ' + verdict);
  assert(report.weighted_score === weighted_score, 'Report score matches: ' + report.weighted_score);
  assert(report.verdict === verdict, 'Verdict matches: ' + report.verdict);

  // --- Test 4: Report validation ---
  console.log('\nTest 4: Report structure');
  const { valid, errors } = validateReport(report);
  assert(valid, 'Report passes validation' + (errors.length > 0 ? ': ' + errors.join(', ') : ''));
  assert(!!report.verdict_reasoning, 'Has verdict reasoning');
  assert(report.next_steps.length >= 1, 'Has next steps: ' + report.next_steps.length);
  assert(report.library_license === 'Apache-2.0', 'License: Apache-2.0');

  // --- Test 5: Compare with EVAL-001 ---
  console.log('\nTest 5: Cross-evaluation comparison');
  const eval001 = runEval001();
  assert(report.weighted_score > eval001.weighted_score,
    'EVAL-002 scores higher than EVAL-001: ' + report.weighted_score.toFixed(2) + ' vs ' + eval001.weighted_score.toFixed(2));
  assert(report.eval_id !== eval001.eval_id, 'Different eval IDs');

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) {
    console.log('✅ Sprint 256 — EVAL-002 Cognee — ALL PASS');
  } else {
    console.log('❌ Sprint 256 — ' + failed + ' tests FAILED');
  }
}

main();
