#!/usr/bin/env ts-node
// SCS-001 Publishing Agent — Block E Integration Test
// Chains: MockBriefs → Script → Editing → Caption → QC → Publishing → validate PublishedVideo[]
// This validates the COMPLETE pipeline through distribution (Blocks B + C + E)

import { getMockInsightBriefs } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../../agents/scs001-script/index';
import { EditingAgent, EditedVideo } from '../../agents/scs001-editing/index';
import { CaptionAgent, CaptionedVideo } from '../../agents/scs001-caption/index';
import { QCAgent, QualityControlGate } from '../../agents/scs001-qc/index';
import { PublishingAgent, PublishedVideo } from '../../agents/scs001-publishing/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  \u2717 FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  \u2713 PASS: ' + msg); }
}

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83d\udce1  SCS-001 Publishing Agent \u2014 Block E Integration Test');
  console.log('');

  // --- Stage 1: Full upstream pipeline (Blocks B + C) ---
  console.log('Stage 1: Upstream pipeline (Blocks B + C)');
  const briefs = getMockInsightBriefs();
  const scriptAgent = new ScriptAgent();
  const bundles: ScriptBundle[] = scriptAgent.run(briefs);
  assert(bundles.length >= 1, 'ScriptAgent: ' + bundles.length + ' bundles');

  const testDir = 'workspace/scs001/publishing-test-' + Date.now();
  const editingAgent = new EditingAgent(testDir + '/editing');
  const videos: EditedVideo[] = editingAgent.run(bundles);
  assert(videos.length >= 1, 'EditingAgent: ' + videos.length + ' videos');

  const captionAgent = new CaptionAgent(testDir + '/caption');
  const captioned: CaptionedVideo[] = captionAgent.run(videos, bundles);
  assert(captioned.length >= 1, 'CaptionAgent: ' + captioned.length + ' captioned');
  console.log('');

  // --- Stage 2: QC Gate ---
  console.log('Stage 2: QC Gate');
  const qcAgent = new QCAgent();
  const gates: QualityControlGate[] = qcAgent.run(captioned, bundles, videos);
  const passedGates = gates.filter(g => g.overall_pass);
  assert(passedGates.length >= 1, 'QC: ' + passedGates.length + '/' + gates.length + ' passed');
  console.log('');

  // --- Stage 3: Publishing Agent ---
  console.log('Stage 3: Publishing Agent (dry-run mode)');
  const publishingAgent = new PublishingAgent();
  const published: PublishedVideo[] = await publishingAgent.run(gates, captioned, bundles);

  assert(Array.isArray(published), 'Output is an array');
  assert(published.length >= 1, 'At least 1 PublishedVideo (' + published.length + ')');
  assert(published.length === passedGates.length, 'Published count matches QC-passed count');
  console.log('');

  // --- Stage 4: PublishedVideo contract validation ---
  console.log('Stage 4: PublishedVideo contract validation');
  const validPlatforms = ['tiktok', 'instagram_reels', 'youtube_shorts'];
  const validSlots = ['morning_0700_0900', 'midday_1200_1300', 'evening_1800_2000', 'late_night_2100_2300'];
  const passedVideoIds = new Set(passedGates.map(g => g.video_id));

  published.forEach((pv, idx) => {
    const label = 'published[' + idx + ']';

    // Required fields
    assert(typeof pv.publish_id === 'string' && pv.publish_id.length > 0,
      label + ' publish_id is non-empty string');
    assert(typeof pv.video_id === 'string' && pv.video_id.length > 0,
      label + ' video_id is non-empty string');
    assert(passedVideoIds.has(pv.video_id),
      label + ' video_id links to QC-passed gate');
    assert(validPlatforms.includes(pv.platform),
      label + ' platform is valid enum (' + pv.platform + ')');
    assert(typeof pv.post_url === 'string' && pv.post_url.startsWith('https://'),
      label + ' post_url is valid URL');
    assert(typeof pv.posted_at === 'string' && pv.posted_at.length > 0,
      label + ' posted_at is non-empty timestamp');
    assert(validSlots.includes(pv.posting_slot),
      label + ' posting_slot is valid enum (' + pv.posting_slot + ')');
    assert(typeof pv.caption_text === 'string' && pv.caption_text.length > 0,
      label + ' caption_text is non-empty');
    assert(Array.isArray(pv.hashtags),
      label + ' hashtags is array');
    assert(pv.hashtags.length >= 3 && pv.hashtags.length <= 5,
      label + ' hashtags count ' + pv.hashtags.length + ' (need 3-5)');

    // All hashtags are strings
    assert(pv.hashtags.every(h => typeof h === 'string' && h.length > 0),
      label + ' all hashtags are non-empty strings');
  });

  // --- Stage 5: Pipeline integrity ---
  console.log('');
  console.log('Stage 5: Full Pipeline Integrity (Blocks B + C + E)');
  assert(bundles.length > 0, 'Block B: Script Agent produced output');
  assert(videos.length === bundles.length, 'Block C: Editing Agent processed all');
  assert(captioned.length === videos.length, 'Block C: Caption Agent processed all');
  assert(gates.length === captioned.length, 'QC Gate: reviewed all');
  assert(published.length === passedGates.length, 'Block E: Published all QC-passed');

  // Only QC-passed videos were published (no leakage)
  const publishedIds = new Set(published.map(p => p.video_id));
  const failedIds = gates.filter(g => !g.overall_pass).map(g => g.video_id);
  for (const fid of failedIds) {
    assert(!publishedIds.has(fid), 'QC-failed video ' + fid + ' was NOT published');
  }

  // Constitutional chain: all published videos have constitutional trace
  const constitutionalOk = published.every(pv => {
    const gate = gates.find(g => g.video_id === pv.video_id);
    return gate && gate.gate_items.why_does_this_matter && gate.gate_items.constitutional_filter;
  });
  assert(constitutionalOk, 'Constitutional chain intact on all published videos');

  const code = process.exitCode === 1 ? 1 : 0;
  console.log('');
  console.log(code === 0 ? '\u2705 Block E Integration Test: PASS' : '\u274c Block E Integration Test: FAIL');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
