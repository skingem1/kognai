#!/usr/bin/env ts-node
// Sprint 255 — EVAL-001 OpenViking Evaluation Validation

import { runEval001 } from './eval-001-openviking';
import { validateReport, computeVerdict, printEvalReport } from './cto-eval-framework';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  ✗ FAIL: ' + msg); failed++; process.exitCode = 1; }
  else            { console.log('  ✓ PASS: ' + msg); passed++; }
}

function main(): void {
  console.log('');
  console.log('🔬  Sprint 255 — EVAL-001 OpenViking Evaluation Validation');
  console.log('');

  // --- Test 1: Run evaluation ---
  console.log('Test 1: Run EVAL-001');
  const report = runEval001();
  assert(!!report, 'Report generated');
  assert(report.eval_id === 'EVAL-001', 'Eval ID: ' + report.eval_id);
  assert(report.library_name === 'volcengine/OpenViking', 'Library: ' + report.library_name);

  // --- Test 2: Criteria validation ---
  console.log('\nTest 2: Criteria');
  assert(report.criteria.length === 5, '5 criteria: ' + report.criteria.length);

  const totalWeight = report.criteria.reduce((sum, c) => sum + c.weight, 0);
  assert(Math.abs(totalWeight - 1.0) < 0.01, 'Weights sum to 1.0: ' + totalWeight.toFixed(2));

  for (const c of report.criteria) {
    assert(c.score >= 1 && c.score <= 5, c.id + ' score in range: ' + c.score);
    assert(!!c.evidence, c.id + ' has evidence');
    assert(!!c.name, c.id + ' has name');
    assert(c.weight > 0, c.id + ' has weight: ' + c.weight);
  }

  // --- Test 3: Verdict computation ---
  console.log('\nTest 3: Verdict');
  const { weighted_score, verdict } = computeVerdict(report.criteria);
  assert(weighted_score > 0 && weighted_score <= 5, 'Score in range: ' + weighted_score.toFixed(2));
  assert(['ADOPT', 'PARTIAL', 'REJECT'].includes(verdict), 'Valid verdict: ' + verdict);
  assert(report.weighted_score === weighted_score, 'Report score matches computed: ' + report.weighted_score);
  assert(report.verdict === verdict, 'Report verdict matches computed: ' + report.verdict);

  // --- Test 4: Report validation ---
  console.log('\nTest 4: Report structure');
  const { valid, errors } = validateReport(report);
  assert(valid, 'Report passes validation' + (errors.length > 0 ? ': ' + errors.join(', ') : ''));
  assert(!!report.verdict_reasoning, 'Has verdict reasoning');
  assert(report.next_steps.length >= 1, 'Has next steps: ' + report.next_steps.length);
  assert(!!report.evaluated_at, 'Has evaluated_at');
  assert(report.library_license === 'Apache-2.0', 'License: ' + report.library_license);

  // --- Test 5: Framework reusability ---
  console.log('\nTest 5: Framework reusability');
  // Verify computeVerdict works with edge cases
  const adoptCriteria = [
    { id: 'T1', name: 'Test', description: '', weight: 0.5, score: 5 as number, evidence: 'e', risks: [], mitigations: [] },
    { id: 'T2', name: 'Test', description: '', weight: 0.5, score: 5 as number, evidence: 'e', risks: [], mitigations: [] },
  ];
  const { verdict: adoptV } = computeVerdict(adoptCriteria);
  assert(adoptV === 'ADOPT', 'Perfect scores → ADOPT: ' + adoptV);

  const rejectCriteria = [
    { id: 'T1', name: 'Test', description: '', weight: 0.5, score: 1 as number, evidence: 'e', risks: [], mitigations: [] },
    { id: 'T2', name: 'Test', description: '', weight: 0.5, score: 1 as number, evidence: 'e', risks: [], mitigations: [] },
  ];
  const { verdict: rejectV } = computeVerdict(rejectCriteria);
  assert(rejectV === 'REJECT', 'Low scores → REJECT: ' + rejectV);

  // --- Print report ---
  printEvalReport(report);

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) {
    console.log('✅ Sprint 255 — EVAL-001 OpenViking — ALL PASS');
  } else {
    console.log('❌ Sprint 255 — ' + failed + ' tests FAILED');
  }
}

main();
