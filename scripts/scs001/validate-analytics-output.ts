#!/usr/bin/env ts-node
// SCS-001 Analytics Agent — Block E Completion Integration Test
// Chains: MockBriefs → Script → Editing → Caption → QC → Publishing → Analytics
// Validates the COMPLETE SCS-001 pipeline end-to-end (Blocks B + C + E)

import { getMockInsightBriefs } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../../agents/scs001-script/index';
import { EditingAgent, EditedVideo } from '../../agents/scs001-editing/index';
import { CaptionAgent, CaptionedVideo } from '../../agents/scs001-caption/index';
import { QCAgent, QualityControlGate } from '../../agents/scs001-qc/index';
import { PublishingAgent, PublishedVideo } from '../../agents/scs001-publishing/index';
import { AnalyticsAgent, PerformanceSignal } from '../../agents/scs001-analytics/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  \u2717 FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  \u2713 PASS: ' + msg); }
}

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83d\udcca  SCS-001 Analytics Agent \u2014 Block E Completion Test');
  console.log('');

  // --- Stage 1: Full upstream pipeline ---
  console.log('Stage 1: Upstream pipeline (Blocks B + C + Publishing)');
  const briefs = getMockInsightBriefs();
  const bundles: ScriptBundle[] = new ScriptAgent().run(briefs);
  assert(bundles.length >= 1, 'ScriptAgent: ' + bundles.length + ' bundles');

  const testDir = 'workspace/scs001/analytics-test-' + Date.now();
  const videos: EditedVideo[] = new EditingAgent(testDir + '/editing').run(bundles);
  const captioned: CaptionedVideo[] = new CaptionAgent(testDir + '/caption').run(videos, bundles);
  const gates: QualityControlGate[] = new QCAgent().run(captioned, bundles, videos);
  const published: PublishedVideo[] = await new PublishingAgent().run(gates, captioned, bundles);

  assert(published.length >= 1, 'Publishing: ' + published.length + ' videos published');
  console.log('');

  // --- Stage 2: Analytics Agent ---
  console.log('Stage 2: Analytics Agent');
  const analyticsAgent = new AnalyticsAgent();
  const signals: PerformanceSignal[] = analyticsAgent.run(published);

  assert(Array.isArray(signals), 'Output is an array');
  assert(signals.length >= 1, 'At least 1 PerformanceSignal (' + signals.length + ')');
  assert(signals.length === published.length, 'One signal per PublishedVideo');
  console.log('');

  // --- Stage 3: PerformanceSignal contract validation ---
  console.log('Stage 3: PerformanceSignal contract validation');
  // Sprint 1433: All 9 Blotato platforms (was 3-platform TikTok-era list)
  const validPlatforms = ['instagram', 'youtube', 'tiktok', 'facebook', 'linkedin', 'threads', 'x', 'pinterest', 'bluesky'];
  const validStatuses = ['viral', 'performing', 'underperforming', 'failure'];
  const publishedIds = new Set(published.map(p => p.video_id));

  signals.forEach((sig, idx) => {
    const label = 'signal[' + idx + ']';

    // Required top-level fields
    assert(typeof sig.signal_id === 'string' && sig.signal_id.length > 0,
      label + ' signal_id is non-empty');
    assert(typeof sig.video_id === 'string' && publishedIds.has(sig.video_id),
      label + ' video_id links to PublishedVideo');
    assert(validPlatforms.includes(sig.platform),
      label + ' platform is valid enum');
    assert(validStatuses.includes(sig.viral_status),
      label + ' viral_status is valid enum (' + sig.viral_status + ')');
    assert(typeof sig.measured_at === 'string' && sig.measured_at.length > 0,
      label + ' measured_at is non-empty');

    // KPIs structure
    const k = sig.kpis;
    assert(typeof k === 'object', label + ' kpis is object');
    assert(typeof k.completion_rate === 'number' && k.completion_rate >= 0 && k.completion_rate <= 100,
      label + ' completion_rate in [0,100] (' + k.completion_rate + ')');
    assert(typeof k.avg_watch_time_seconds === 'number' && k.avg_watch_time_seconds >= 0,
      label + ' avg_watch_time_seconds >= 0');
    assert(typeof k.rewatch_rate === 'number' && k.rewatch_rate >= 0 && k.rewatch_rate <= 100,
      label + ' rewatch_rate in [0,100]');
    assert(typeof k.comments === 'number' && k.comments >= 0, label + ' comments >= 0');
    assert(typeof k.shares === 'number' && k.shares >= 0, label + ' shares >= 0');
    assert(typeof k.views === 'number' && k.views >= 0, label + ' views >= 0');
    assert(typeof k.likes === 'number' && k.likes >= 0, label + ' likes >= 0');
    assert(typeof k.followers_gained === 'number' && k.followers_gained >= 0,
      label + ' followers_gained >= 0');

    // Viral status consistency with completion rate
    if (k.completion_rate >= 70) {
      assert(sig.viral_status === 'viral', label + ' viral at ' + k.completion_rate + '%');
    } else if (k.completion_rate >= 40) {
      assert(sig.viral_status === 'performing', label + ' performing at ' + k.completion_rate + '%');
    } else if (k.completion_rate >= 20) {
      assert(sig.viral_status === 'underperforming', label + ' underperforming at ' + k.completion_rate + '%');
    } else {
      assert(sig.viral_status === 'failure', label + ' failure at ' + k.completion_rate + '%');
    }

    // Flywheel + failure library consistency
    assert(sig.flywheel_triggered === (k.completion_rate >= 70),
      label + ' flywheel_triggered consistent with completion_rate');
    assert(sig.failure_library_entry === (k.completion_rate < 40),
      label + ' failure_library_entry consistent with completion_rate');

    // Feedback loop objects
    assert(typeof sig.topic_performance === 'object', label + ' topic_performance is object');
    assert(Array.isArray(sig.topic_performance.topic_tags), label + ' topic_tags is array');
    assert(typeof sig.topic_performance.topic_avg_completion === 'number',
      label + ' topic_avg_completion is number');

    assert(typeof sig.speaker_performance === 'object', label + ' speaker_performance is object');
    assert(typeof sig.speaker_performance.speaker_name === 'string',
      label + ' speaker_name is string');

    assert(typeof sig.posting_slot_performance === 'object', label + ' posting_slot_performance is object');
    assert(typeof sig.posting_slot_performance.slot === 'string',
      label + ' posting slot is string');

    assert(typeof sig.hook_formula_performance === 'object', label + ' hook_formula_performance is object');
    assert(typeof sig.hook_formula_performance.formula === 'string',
      label + ' hook formula is string');
    assert(typeof sig.hook_formula_performance.uses_count === 'number',
      label + ' uses_count is number');
  });

  // --- Stage 4: Full pipeline integrity ---
  console.log('');
  console.log('Stage 4: Full SCS-001 Pipeline Integrity');
  assert(bundles.length > 0, 'Block B: Script output present');
  assert(videos.length === bundles.length, 'Block C: Editing processed all');
  assert(captioned.length === videos.length, 'Block C: Caption processed all');
  assert(gates.length === captioned.length, 'QC Gate: reviewed all');
  assert(published.length > 0, 'Block E: Publishing produced output');
  assert(signals.length === published.length, 'Block E: Analytics measured all');

  // At least one viral signal (mock data designed for this)
  const viralCount = signals.filter(s => s.viral_status === 'viral').length;
  assert(viralCount >= 1, 'At least 1 viral signal for flywheel testing');

  // Flywheel triggered on viral
  const flywheelCount = signals.filter(s => s.flywheel_triggered).length;
  assert(flywheelCount === viralCount, 'Flywheel triggered on all viral videos');

  const code = process.exitCode === 1 ? 1 : 0;
  console.log('');
  console.log(code === 0
    ? '\u2705 Block E Completion Test: PASS — Full pipeline validated'
    : '\u274c Block E Completion Test: FAIL');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
