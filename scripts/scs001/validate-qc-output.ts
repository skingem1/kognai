#!/usr/bin/env ts-node
// SCS-001 QC Agent — Full Pipeline Integration Test
// Chains: MockBriefs → Script → Editing → Caption → QC → validate QualityControlGate[]
// This validates the COMPLETE production pipeline (Blocks B + C)

import { existsSync } from 'fs';
import { getMockInsightBriefs } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../../agents/scs001-script/index';
import { EditingAgent, EditedVideo } from '../../agents/scs001-editing/index';
import { CaptionAgent, CaptionedVideo } from '../../agents/scs001-caption/index';
import { QCAgent, QualityControlGate } from '../../agents/scs001-qc/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  \u2717 FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  \u2713 PASS: ' + msg); }
}

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83d\udee1\ufe0f  SCS-001 QC Agent \u2014 Full Pipeline Integration Test');
  console.log('');

  // --- Stage 1: Full upstream pipeline ---
  console.log('Stage 1: Full upstream pipeline');
  const briefs = getMockInsightBriefs();
  const scriptAgent = new ScriptAgent();
  const bundles: ScriptBundle[] = scriptAgent.run(briefs);
  assert(bundles.length >= 1, 'ScriptAgent: ' + bundles.length + ' bundles');

  const testDir = 'workspace/scs001/qc-test-' + Date.now();
  const editingAgent = new EditingAgent(testDir + '/editing');
  const videos: EditedVideo[] = editingAgent.run(bundles);
  assert(videos.length >= 1, 'EditingAgent: ' + videos.length + ' videos');

  const captionAgent = new CaptionAgent(testDir + '/caption');
  const captioned: CaptionedVideo[] = captionAgent.run(videos, bundles);
  assert(captioned.length >= 1, 'CaptionAgent: ' + captioned.length + ' captioned');
  console.log('');

  // --- Stage 2: QC Agent ---
  console.log('Stage 2: QC Agent review');
  const qcAgent = new QCAgent();
  const gates: QualityControlGate[] = qcAgent.run(captioned, bundles, videos);

  assert(Array.isArray(gates), 'Output is an array');
  assert(gates.length >= 1, 'At least 1 QualityControlGate (' + gates.length + ')');
  assert(gates.length === captioned.length, 'One gate per CaptionedVideo');
  console.log('');

  // --- Stage 3: Gate validation ---
  console.log('Stage 3: QualityControlGate validation');
  const videoIds = new Set(captioned.map(cv => cv.video_id));

  gates.forEach((g, idx) => {
    const label = 'gate[' + idx + ']';

    // ID check
    assert(videoIds.has(g.video_id), label + ' video_id links to CaptionedVideo');

    // Gate items structure
    const gi = g.gate_items;
    assert(typeof gi === 'object', label + ' gate_items is object');
    assert(typeof gi.why_does_this_matter === 'boolean', label + ' why_does_this_matter is boolean');
    assert(typeof gi.hook_timing === 'boolean', label + ' hook_timing is boolean');
    assert(typeof gi.visual_change_cadence === 'boolean', label + ' visual_change_cadence is boolean');
    assert(typeof gi.caption_readability === 'boolean', label + ' caption_readability is boolean');
    assert(typeof gi.audio_balance === 'boolean', label + ' audio_balance is boolean');
    assert(typeof gi.constitutional_filter === 'boolean', label + ' constitutional_filter is boolean');
    assert(typeof gi.clip_understandable === 'boolean', label + ' clip_understandable is boolean');

    // Overall pass consistency
    const allTrue = Object.values(gi).every(v => v === true);
    assert(g.overall_pass === allTrue,
      label + ' overall_pass consistent with gate_items');

    // Reviewed timestamp
    assert(typeof g.reviewed_at === 'string' && g.reviewed_at.length > 0,
      label + ' reviewed_at is non-empty string');

    // If passed: no failure info
    if (g.overall_pass) {
      assert(g.failure_reason === null, label + ' PASS: no failure_reason');
      assert(g.return_to_agent === null, label + ' PASS: no return_to_agent');
    } else {
      // If failed: must have failure info
      assert(typeof g.failure_reason === 'string' && g.failure_reason.length > 0,
        label + ' FAIL: has failure_reason');
      assert(typeof g.return_to_agent === 'number' && g.return_to_agent >= 1 && g.return_to_agent <= 6,
        label + ' FAIL: return_to_agent is 1-6');
    }

    // Report individual gate items
    console.log('  ' + label + ' items: ' +
      (gi.why_does_this_matter ? '\u2713' : '\u2717') + 'why ' +
      (gi.hook_timing ? '\u2713' : '\u2717') + 'hook ' +
      (gi.visual_change_cadence ? '\u2713' : '\u2717') + 'cadence ' +
      (gi.caption_readability ? '\u2713' : '\u2717') + 'caption ' +
      (gi.audio_balance ? '\u2713' : '\u2717') + 'audio ' +
      (gi.constitutional_filter ? '\u2713' : '\u2717') + 'const ' +
      (gi.clip_understandable ? '\u2713' : '\u2717') + 'understand');
  });

  // --- Full Pipeline Gate ---
  console.log('');
  console.log('Full Pipeline Gate (Blocks B + C):');
  assert(bundles.length > 0, 'Block B: Script Agent produced output');
  assert(videos.length === bundles.length, 'Block C: Editing Agent processed all');
  assert(captioned.length === videos.length, 'Block C: Caption Agent processed all');
  assert(gates.length === captioned.length, 'Gate: QC Agent reviewed all');

  const passedCount = gates.filter(g => g.overall_pass).length;
  const passRate = (passedCount / gates.length * 100).toFixed(0);
  console.log('  QC pass rate: ' + passedCount + '/' + gates.length + ' (' + passRate + '%)');
  assert(passedCount === gates.length, 'All videos passed QC gate');

  // Constitutional chain verification
  const constitutionalOk = gates.every(g => g.gate_items.why_does_this_matter && g.gate_items.constitutional_filter);
  assert(constitutionalOk, 'Constitutional items (why_does_this_matter + filter) all PASS');

  const code = process.exitCode === 1 ? 1 : 0;
  console.log('');
  console.log(code === 0 ? '\u2705 Full Pipeline Integration Test: PASS' : '\u274c Full Pipeline Integration Test: FAIL');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
