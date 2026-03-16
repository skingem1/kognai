#!/usr/bin/env ts-node
// SCS-001 Content Flywheel + Failure Library — Sprint 088 Integration Test
// Runs full orchestrator and validates stages 11-12 (flywheel + failure library)

import { SCS001Orchestrator, PipelineRunReport } from '../../agents/scs001-orchestrator/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  \u2717 FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  \u2713 PASS: ' + msg); }
}

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83d\udd04  SCS-001 Flywheel + Failure Library \u2014 Sprint 088 Test');
  console.log('');

  const orchestrator = new SCS001Orchestrator('mock');
  const report: PipelineRunReport = await orchestrator.run();

  console.log('');
  console.log('--- Sprint 088 Validation ---');
  console.log('');

  // Stage count: should now be 12 (10 base + flywheel + possibly failure library)
  const stageNames = report.stages.map(s => s.stage);
  assert(report.stages.length >= 11, 'At least 11 stages executed (' + report.stages.length + ')');
  assert(stageNames.includes('11-flywheel'), 'Stage 11 (Flywheel) executed');

  // No errors
  const errors = report.stages.filter(s => s.status === 'error');
  assert(errors.length === 0, 'No stage errors');

  // Flywheel validation
  const s = report.summary;
  assert(s.viral >= 1, 'At least 1 viral signal (' + s.viral + ')');
  assert(s.flywheel_derivatives >= 4, 'At least 4 flywheel derivatives (' + s.flywheel_derivatives + ')');
  assert(s.flywheel_derivatives === s.viral * 4,
    'Exactly 4 derivatives per viral (' + s.flywheel_derivatives + ' = ' + s.viral + ' x 4)');

  // Flywheel stage output count matches
  const flywheelStage = report.stages.find(st => st.stage === '11-flywheel');
  if (flywheelStage) {
    assert(flywheelStage.count === s.flywheel_derivatives,
      'Flywheel stage count matches summary (' + flywheelStage.count + ')');
    assert(flywheelStage.status === 'ok', 'Flywheel stage status is ok');
  }

  // Failure library (mock data has 1 viral + 1 performing, so 0 failures)
  // But the mock profile [0]=78%, [1]=55% — both above 40%, so no failures expected
  console.log('');
  console.log('Failure Library check:');
  console.log('  failure_library signals: ' + s.failure_library);
  console.log('  failure_entries filed: ' + s.failure_entries);
  // In mock mode with 2 videos: 78% viral + 55% performing = 0 failures
  // This is correct behavior — failure library stage should be skipped
  if (s.failure_library === 0) {
    assert(!stageNames.includes('12-failure-library'),
      'Stage 12 correctly skipped (no failures)');
    assert(s.failure_entries === 0, 'No failure entries filed');
  } else {
    assert(stageNames.includes('12-failure-library'), 'Stage 12 executed');
    assert(s.failure_entries === s.failure_library,
      'One entry per failure signal');
  }

  // Pipeline integrity: existing stages unchanged
  console.log('');
  assert(s.topics_found >= 1, 'Existing: topics_found >= 1');
  assert(s.published >= 1, 'Existing: published >= 1');
  assert(s.published <= s.qc_passed, 'Existing: published <= qc_passed');

  const code = process.exitCode === 1 ? 1 : 0;
  console.log('');
  console.log(code === 0
    ? '\u2705 Sprint 088 Test: PASS — Flywheel + Failure Library validated'
    : '\u274c Sprint 088 Test: FAIL');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
