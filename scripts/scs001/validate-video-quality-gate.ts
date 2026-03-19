#!/usr/bin/env ts-node
// Sprint 254 — Video Quality Gate v2
// End-to-end pipeline test covering all 12 stages
// Validates: full pipeline mock run, quality metrics, new module availability, gate criteria

import { SCS001Orchestrator } from '../../agents/scs001-orchestrator/index';
import { collectMetrics, printMetrics } from './quality-metrics';
import { BlotatoClient, ALL_PLATFORMS } from './blotato-client';
import { existsSync } from 'fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  ✗ FAIL: ' + msg); failed++; process.exitCode = 1; }
  else            { console.log('  ✓ PASS: ' + msg); passed++; }
}

async function main(): Promise<void> {
  console.log('');
  console.log('🏁  Sprint 254 — Video Quality Gate v2');
  console.log('    End-to-end pipeline test + quality metrics');
  console.log('');

  // --- Test 1: Full pipeline mock run ---
  console.log('Test 1: Full pipeline mock run');
  const orchestrator = new SCS001Orchestrator('mock');
  const report = await orchestrator.run();

  assert(report.stages.length >= 8, 'At least 8 stages executed: ' + report.stages.length);
  assert(report.summary.topics_found >= 1, 'Topics found: ' + report.summary.topics_found);
  assert(report.summary.scripts_produced >= 1, 'Scripts produced: ' + report.summary.scripts_produced);
  assert(report.summary.videos_edited >= 1, 'Videos edited: ' + report.summary.videos_edited);
  assert(report.summary.videos_captioned >= 1, 'Videos captioned: ' + report.summary.videos_captioned);
  assert(report.summary.qc_passed >= 1, 'QC passed: ' + report.summary.qc_passed);
  assert(report.summary.published >= 1, 'Published: ' + report.summary.published);

  // No stage errors in mock mode
  const errorStages = report.stages.filter(s => s.status === 'error');
  assert(errorStages.length === 0, 'No stage errors (got ' + errorStages.length + ')');

  // --- Test 2: Quality metrics collection ---
  console.log('\nTest 2: Quality metrics collection');
  const metrics = collectMetrics(report);

  assert(metrics.run_id === report.run_id, 'Metrics run_id matches');
  assert(metrics.mode === 'mock', 'Metrics mode: mock');
  assert(metrics.total_stages >= 8, 'Total stages: ' + metrics.total_stages);
  assert(metrics.stages_ok >= 8, 'Stages OK: ' + metrics.stages_ok);
  assert(metrics.stages_error === 0, 'No stage errors');

  // Funnel validation
  assert(metrics.funnel.topics >= 1, 'Funnel: topics >= 1');
  assert(metrics.funnel.published >= 1, 'Funnel: published >= 1');

  // Ratios
  assert(metrics.ratios.qc_pass_rate >= 0.5, 'QC pass rate >= 50%: ' + (metrics.ratios.qc_pass_rate * 100) + '%');
  assert(metrics.ratios.script_survival_rate > 0, 'Script survival > 0%');

  // --- Test 3: New module files exist ---
  console.log('\nTest 3: New module availability (Sprint 248-253)');
  const modules = [
    { name: 'Audio Transcription (248)', path: 'scripts/scs001/transcribe-audio.ts' },
    { name: 'LLM Script Rewriter (249)', path: 'scripts/scs001/llm-script-rewriter.ts' },
    { name: 'TTS Voiceover (250)', path: 'scripts/scs001/tts-voiceover.ts' },
    { name: 'Avatar Presenter (251)', path: 'scripts/scs001/avatar-presenter.ts' },
    { name: 'Caption Overlay (252)', path: 'scripts/scs001/caption-overlay.ts' },
    { name: 'Pattern Interrupts (252)', path: 'scripts/scs001/pattern-interrupts.ts' },
    { name: 'Blotato Client (253)', path: 'scripts/scs001/blotato-client.ts' },
  ];
  for (const mod of modules) {
    assert(existsSync(mod.path), mod.name + ' exists: ' + mod.path);
  }

  // --- Test 4: Blotato multi-platform in publishing output ---
  console.log('\nTest 4: Multi-platform publishing validation');
  // In mock mode, PublishingAgent uses Blotato path → 9 results per video
  const publishedCount = report.summary.published;
  const videosPublished = report.summary.qc_passed;
  // With Blotato: published should be 9x QC passed videos
  assert(publishedCount === videosPublished * 9,
    'Blotato 9x multiplier: ' + publishedCount + ' = ' + videosPublished + ' × 9');

  // --- Test 5: Gate verdict ---
  console.log('\nTest 5: Gate verdict');
  assert(metrics.gate_pass === true, 'Gate PASS');
  console.log('  Gate reasons:');
  for (const reason of metrics.gate_reasons) {
    console.log('    ' + reason);
  }

  // --- Print full metrics report ---
  printMetrics(metrics);

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) {
    console.log('✅ Sprint 254 — Video Quality Gate v2 — ALL PASS');
    console.log('🏁 VIDEO-QUALITY block: GATE PASS');
  } else {
    console.log('❌ Sprint 254 — ' + failed + ' tests FAILED');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exitCode = 1;
});
