#!/usr/bin/env ts-node
// SCS-001 Orchestrator — Block F Integration Test
// Runs the full automated pipeline via Orchestrator and validates the report

import { SCS001Orchestrator, PipelineRunReport } from '../../agents/scs001-orchestrator/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  \u2717 FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  \u2713 PASS: ' + msg); }
}

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83c\udfaf  SCS-001 Orchestrator \u2014 Block F Integration Test');
  console.log('');

  // --- Run the orchestrator in mock mode ---
  console.log('Running orchestrator (mock mode)...');
  console.log('');
  const orchestrator = new SCS001Orchestrator('mock');
  const report: PipelineRunReport = await orchestrator.run();

  console.log('');
  console.log('--- Report Validation ---');
  console.log('');

  // --- Validate report structure ---
  assert(typeof report.run_id === 'string' && report.run_id.length > 0,
    'run_id is non-empty');
  assert(report.mode === 'mock', 'mode is mock');
  assert(typeof report.started_at === 'string', 'started_at is ISO timestamp');
  assert(typeof report.completed_at === 'string', 'completed_at is ISO timestamp');
  assert(typeof report.total_elapsed_ms === 'number' && report.total_elapsed_ms > 0,
    'total_elapsed_ms > 0 (' + report.total_elapsed_ms + 'ms)');

  // --- Validate stages ---
  assert(Array.isArray(report.stages), 'stages is array');
  assert(report.stages.length >= 8, 'At least 8 stages executed (' + report.stages.length + ')');

  const stageNames = report.stages.map(s => s.stage);
  assert(stageNames.includes('1-trend'), 'Stage 1 (Trend) executed');
  assert(stageNames.includes('2-discovery'), 'Stage 2 (Discovery) executed');
  // Stage 3 is optional: RapidAPI path runs clip-detection; fallback path synthesises from discovery metadata
  if (stageNames.includes('3-clip-detection')) {
    assert(true, 'Stage 3 (Clip Detection) executed (RapidAPI path)');
  } else {
    console.log('  ℹ Stage 3 (Clip Detection) skipped — synthesised clips path (RapidAPI unavailable)');
  }
  assert(stageNames.includes('4-insight'), 'Stage 4 (Insight) executed');
  assert(stageNames.includes('5-script'), 'Stage 5 (Script) executed');
  assert(stageNames.includes('6-editing'), 'Stage 6 (Editing) executed');
  assert(stageNames.includes('7-caption'), 'Stage 7 (Caption) executed');
  assert(stageNames.includes('8-qc'), 'Stage 8 (QC) executed');
  assert(stageNames.includes('9-publishing'), 'Stage 9 (Publishing) executed');
  assert(stageNames.includes('10-analytics'), 'Stage 10 (Analytics) executed');

  // No stage errors
  const errors = report.stages.filter(s => s.status === 'error');
  assert(errors.length === 0, 'No stage errors (' + errors.length + ')');

  // All stages have timing
  for (const s of report.stages) {
    assert(typeof s.elapsed_ms === 'number' && s.elapsed_ms >= 0,
      s.stage + ' has valid timing (' + s.elapsed_ms + 'ms)');
  }

  // --- Validate summary ---
  console.log('');
  const s = report.summary;
  assert(s.topics_found >= 1, 'topics_found >= 1 (' + s.topics_found + ')');
  assert(s.clips_discovered >= 1, 'clips_discovered >= 1 (' + s.clips_discovered + ')');
  assert(s.insights_generated >= 1, 'insights_generated >= 1 (' + s.insights_generated + ')');
  assert(s.scripts_produced >= 1, 'scripts_produced >= 1 (' + s.scripts_produced + ')');
  assert(s.videos_edited >= 1, 'videos_edited >= 1 (' + s.videos_edited + ')');
  assert(s.videos_captioned >= 1, 'videos_captioned >= 1 (' + s.videos_captioned + ')');
  assert(s.qc_passed >= 1, 'qc_passed >= 1 (' + s.qc_passed + ')');
  assert(s.published >= 1, 'published >= 1 (' + s.published + ')');
  assert(s.viral + s.performing >= 1, 'at least 1 viral or performing');

  // Pipeline integrity: no count inflation
  // Sprint 1431: Blotato multi-platform publishes up to 9 posts per QC-passed video.
  // Old assertion was published <= qc_passed (written before Blotato). Now published = qc_passed × platforms.
  assert(s.published >= s.qc_passed, 'published >= qc_passed (each video on ≥1 platform)');
  assert(s.published <= s.qc_passed * 9, 'published <= qc_passed×9 (max 9 Blotato platforms)');
  assert(s.qc_passed + s.qc_failed <= s.videos_captioned,
    'qc total <= captioned');

  const code = process.exitCode === 1 ? 1 : 0;
  console.log('');
  console.log(code === 0
    ? '\u2705 Block F Orchestrator Test: PASS — Full autonomous pipeline validated'
    : '\u274c Block F Orchestrator Test: FAIL');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
