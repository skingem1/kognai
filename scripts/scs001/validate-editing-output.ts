#!/usr/bin/env ts-node
// SCS-001 Editing Agent — Block C Integration Test
// Chains: getMockInsightBriefs() → ScriptAgent → EditingAgent → validate EditedVideo[]
// Block C gate: Production Layer validation (real FFmpeg output)

import { existsSync, unlinkSync } from 'fs';
import { getMockInsightBriefs } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../../agents/scs001-script/index';
import { EditingAgent, EditedVideo } from '../../agents/scs001-editing/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  \u2717 FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  \u2713 PASS: ' + msg); }
}

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83c\udfa5 SCS-001 Editing Agent \u2014 Block C Integration Test');
  console.log('');

  // --- Stage 1: Pipeline upstream (Insight → Script) ---
  console.log('Stage 1: Upstream pipeline');
  const briefs = getMockInsightBriefs();
  assert(briefs.length >= 1, 'Mock InsightBriefs available (' + briefs.length + ')');

  const scriptAgent = new ScriptAgent();
  const bundles: ScriptBundle[] = scriptAgent.run(briefs);
  assert(bundles.length >= 1, 'ScriptAgent produced bundles (' + bundles.length + ')');
  console.log('');

  // --- Stage 2: Editing Agent ---
  console.log('Stage 2: Editing Agent (FFmpeg assembly)');
  const testOutputDir = 'workspace/scs001/editing-outputs/test-' + Date.now();
  const editingAgent = new EditingAgent(testOutputDir);
  const videos: EditedVideo[] = editingAgent.run(bundles);

  assert(Array.isArray(videos), 'Output is an array');
  assert(videos.length >= 1, 'At least 1 EditedVideo produced (' + videos.length + ')');
  assert(videos.length === bundles.length, 'One EditedVideo per ScriptBundle (' + videos.length + ')');
  console.log('');

  // --- Stage 3: EditedVideo validation ---
  console.log('Stage 3: EditedVideo validation');
  const bundleInsightIds = new Set(bundles.map(b => b.insight_id));
  const bundleClipIds    = new Set(bundles.map(b => b.clip_id));

  videos.forEach((v, idx) => {
    const label = 'video[' + idx + ']';

    // ID checks
    assert(typeof v.video_id === 'string' && v.video_id.startsWith('video-'),
      label + ' video_id starts with video-');
    assert(bundleInsightIds.has(v.insight_id),
      label + ' insight_id links to valid ScriptBundle');
    assert(bundleClipIds.has(v.clip_id),
      label + ' clip_id links to valid input clip');

    // File existence
    assert(existsSync(v.file_path),
      label + ' video file exists at ' + v.file_path);

    // Duration
    assert(v.duration_seconds >= 24 && v.duration_seconds <= 30,
      label + ' duration 24-30s (' + v.duration_seconds + 's)');

    // Aspect ratio
    assert(v.aspect_ratio === '9:16',
      label + ' aspect_ratio is 9:16');

    // Editing structure
    const es = v.editing_structure;
    assert(typeof es === 'object', label + ' editing_structure is object');
    assert(es.hook_end_s <= 2, label + ' hook_end_s <= 2 (' + es.hook_end_s + ')');
    assert(es.context_end_s <= 5, label + ' context_end_s <= 5 (' + es.context_end_s + ')');
    assert(es.clip_end_s <= 12, label + ' clip_end_s <= 12 (' + es.clip_end_s + ')');
    assert(es.commentary_end_s <= 18, label + ' commentary_end_s <= 18 (' + es.commentary_end_s + ')');
    assert(es.insight_end_s <= 24, label + ' insight_end_s <= 24 (' + es.insight_end_s + ')');
    assert(typeof es.loop_ending === 'boolean', label + ' loop_ending is boolean');

    // Pattern interrupts
    assert(v.pattern_interrupt_count >= 8,
      label + ' pattern_interrupt_count >= 8 (' + v.pattern_interrupt_count + ')');

    // FFmpeg processing time
    assert(typeof v.ffmpeg_processing_seconds === 'number' && v.ffmpeg_processing_seconds > 0,
      label + ' ffmpeg_processing_seconds > 0 (' + v.ffmpeg_processing_seconds.toFixed(1) + 's)');
    assert(v.ffmpeg_processing_seconds <= 120,
      label + ' ffmpeg_processing_seconds <= 120s target');
  });

  // --- Stage 4: Cross-pipeline validation ---
  console.log('');
  console.log('Stage 4: Cross-pipeline validation');

  // Constitutional passthrough — verify why_does_this_matter reached the video
  // (In mock mode, we verify the insight segment exists and the duration covers it)
  bundles.forEach((b, i) => {
    const video = videos[i];
    if (video) {
      assert(video.editing_structure.insight_end_s >= 18,
        'bundle[' + i + '] insight segment reaches 18s+ (why_does_this_matter visible)');
    }
  });

  // Block C Gate
  console.log('');
  console.log('Block C Gate Assessment:');
  assert(bundles.length > 0, 'Script Agent produced output');
  assert(videos.length === bundles.length, 'Editing Agent processed all bundles');
  const allFilesExist = videos.every(v => existsSync(v.file_path));
  assert(allFilesExist, 'All video files exist on disk');
  const allWithinDuration = videos.every(v => v.duration_seconds >= 24 && v.duration_seconds <= 30);
  assert(allWithinDuration, 'All videos within 24-30s duration target');
  const allHaveInterrupts = videos.every(v => v.pattern_interrupt_count >= 8);
  assert(allHaveInterrupts, 'All videos have >= 8 pattern interrupts');

  // Cleanup test files (optional — comment out to keep for inspection)
  // videos.forEach(v => { if (existsSync(v.file_path)) unlinkSync(v.file_path); });

  const code = process.exitCode === 1 ? 1 : 0;
  console.log('');
  console.log(code === 0 ? '\u2705 Block C Integration Test: PASS' : '\u274c Block C Integration Test: FAIL');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
