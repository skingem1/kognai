#!/usr/bin/env ts-node
// SCS-001 Block B — Script Agent Integration Test
// Chains: getMockQualifiedClips() → InsightAgent → ScriptAgent → validate ScriptBundle[]
// Block B gate: full Content Intelligence pipeline validation

import { InsightAgent, getMockQualifiedClips } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle, ScriptSegment, PatternInterrupt } from '../../agents/scs001-script/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  \u2717 FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  \u2713 PASS: ' + msg); }
}

const VALID_SEGMENTS: ScriptSegment['segment_name'][] = ['hook', 'context', 'clip', 'commentary', 'insight', 'loop'];
const VALID_INTERRUPTS: PatternInterrupt['type'][] = ['cut', 'zoom', 'text_pop', 'color_shift', 'motion', 'overlay'];

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83e\uddea SCS-001 Script Agent \u2014 Block B Integration Test');
  console.log('');

  // --- Stage 1: Insight Agent ---
  console.log('Stage 1: Insight Agent');
  const mockClips = getMockQualifiedClips();
  assert(mockClips.length >= 1, 'Mock clips available (' + mockClips.length + ')');

  const insightAgent = new InsightAgent();
  const briefs = await insightAgent.run(mockClips);
  assert(briefs.length >= 1, 'InsightAgent produced briefs (' + briefs.length + ')');
  console.log('');

  // --- Stage 2: Script Agent ---
  console.log('Stage 2: Script Agent');
  const scriptAgent = new ScriptAgent();
  const bundles: ScriptBundle[] = scriptAgent.run(briefs);

  assert(Array.isArray(bundles), 'Output is an array');
  assert(bundles.length >= 1, 'At least 1 ScriptBundle generated (' + bundles.length + ')');
  assert(bundles.length === briefs.length, 'One ScriptBundle per InsightBrief (' + bundles.length + ')');
  console.log('');

  // --- Stage 3: ScriptBundle validation ---
  console.log('Stage 3: ScriptBundle validation');
  const insightIds = new Set(briefs.map(b => b.insight_id));
  const clipIds    = new Set(briefs.map(b => b.clip_id));

  bundles.forEach((b, idx) => {
    const label = 'bundle[' + idx + ']';

    // ID checks
    assert(typeof b.script_id === 'string' && b.script_id.startsWith('script-'),
      label + ' script_id starts with script-');
    assert(insightIds.has(b.insight_id),
      label + ' insight_id links to valid InsightBrief');
    assert(clipIds.has(b.clip_id),
      label + ' clip_id links to valid input clip');

    // Segment checks
    assert(Array.isArray(b.segments) && b.segments.length >= 5,
      label + ' has >= 5 segments (' + b.segments.length + ')');
    assert(b.segments.length <= 6,
      label + ' has <= 6 segments');

    // Segment names and order
    const expectedOrder = ['hook', 'context', 'clip', 'commentary', 'insight'];
    for (let i = 0; i < expectedOrder.length; i++) {
      assert(b.segments[i]?.segment_name === expectedOrder[i],
        label + ' segment[' + i + '] is ' + expectedOrder[i] + ' (got ' + b.segments[i]?.segment_name + ')');
    }

    // All segment names valid
    b.segments.forEach((seg, si) => {
      assert(VALID_SEGMENTS.includes(seg.segment_name),
        label + ' segment[' + si + '] name valid');
      assert(typeof seg.start_s === 'number' && seg.start_s >= 0,
        label + ' segment[' + si + '] start_s valid');
      assert(typeof seg.end_s === 'number' && seg.end_s > seg.start_s,
        label + ' segment[' + si + '] end_s > start_s');
      assert(typeof seg.voiceover_text === 'string',
        label + ' segment[' + si + '] voiceover_text is string');
      assert(typeof seg.visual_directive === 'string' && seg.visual_directive.length > 0,
        label + ' segment[' + si + '] visual_directive non-empty');
    });

    // Hook segment timing
    assert(b.segments[0].end_s <= 2,
      label + ' hook ends at <= 2s');
    assert(b.segments[0].voiceover_text.length > 0,
      label + ' hook has voiceover text');

    // Clip segment has no voiceover (original audio)
    assert(b.segments[2].voiceover_text === '',
      label + ' clip segment has empty voiceover (original audio)');

    // Pattern interrupts
    assert(Array.isArray(b.pattern_interrupts) && b.pattern_interrupts.length >= 8,
      label + ' has >= 8 pattern interrupts (' + b.pattern_interrupts.length + ')');
    b.pattern_interrupts.forEach((pi, pii) => {
      assert(VALID_INTERRUPTS.includes(pi.type),
        label + ' interrupt[' + pii + '] type valid (' + pi.type + ')');
      assert(typeof pi.time_s === 'number' && pi.time_s > 0,
        label + ' interrupt[' + pii + '] time_s > 0');
    });

    // No 3-second gap between interrupts
    const sortedTimes = b.pattern_interrupts.map(pi => pi.time_s).sort((a, b2) => a - b2);
    let maxGap = sortedTimes[0]; // gap from 0 to first interrupt
    for (let i = 1; i < sortedTimes.length; i++) {
      const gap = sortedTimes[i] - sortedTimes[i - 1];
      if (gap > maxGap) maxGap = gap;
    }
    assert(maxGap <= 3.1,
      label + ' no gap > 3s between interrupts (max gap: ' + maxGap.toFixed(1) + 's)');

    // Duration
    assert(b.total_duration_seconds >= 24 && b.total_duration_seconds <= 30,
      label + ' total_duration 24-30s (' + b.total_duration_seconds + 's)');

    // Loop ending
    assert(typeof b.loop_ending === 'boolean',
      label + ' loop_ending is boolean');
    if (b.loop_ending) {
      assert(b.segments[b.segments.length - 1].segment_name === 'loop',
        label + ' last segment is loop when loop_ending=true');
    }

    // Constitutional passthrough
    assert(typeof b.why_does_this_matter === 'string' && b.why_does_this_matter.length >= 20,
      label + ' why_does_this_matter >= 20 chars (constitutional passthrough)');

    // Other required fields
    assert(typeof b.speaker_name === 'string' && b.speaker_name.length > 0,
      label + ' speaker_name present');
    assert(typeof b.hook_formula_used === 'string' && b.hook_formula_used.length > 0,
      label + ' hook_formula_used present');
  });

  // --- Block B Gate ---
  console.log('');
  console.log('Block B Gate Assessment:');
  assert(briefs.length > 0, 'Insight Agent produced output');
  assert(bundles.length === briefs.length, 'Script Agent processed all briefs');
  const allPassthrough = bundles.every((b, i) => b.why_does_this_matter === briefs[i].why_does_this_matter);
  assert(allPassthrough, 'why_does_this_matter preserved through pipeline (constitutional)');

  const code = process.exitCode === 1 ? 1 : 0;
  console.log('');
  console.log(code === 0 ? '\u2705 Block B Integration Test: PASS' : '\u274c Block B Integration Test: FAIL');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
