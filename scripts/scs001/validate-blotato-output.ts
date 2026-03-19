#!/usr/bin/env ts-node
// Sprint 253 — Blotato Multi-Platform Publishing Validation
// Tests: BlotatoClient dry-run, PublishingAgent multi-platform output, platform coverage

import { BlotatoClient, ALL_PLATFORMS } from './blotato-client';
import { getMockInsightBriefs } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../../agents/scs001-script/index';
import { EditingAgent, EditedVideo } from '../../agents/scs001-editing/index';
import { CaptionAgent, CaptionedVideo } from '../../agents/scs001-caption/index';
import { QCAgent, QualityControlGate } from '../../agents/scs001-qc/index';
import { PublishingAgent, PublishedVideo } from '../../agents/scs001-publishing/index';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  ✗ FAIL: ' + msg); failed++; process.exitCode = 1; }
  else            { console.log('  ✓ PASS: ' + msg); passed++; }
}

async function main(): Promise<void> {
  console.log('');
  console.log('🌐  Sprint 253 — Blotato Multi-Platform Publishing Validation');
  console.log('');

  // --- Test 1: BlotatoClient dry-run ---
  console.log('Test 1: BlotatoClient dry-run');
  const client = new BlotatoClient();
  const response = await client.post({
    caption: 'Test post from Kognai pipeline',
    mediaUrl: '/tmp/test-video.mp4',
    mediaType: 'video',
    platforms: [...ALL_PLATFORMS],
    hashtags: ['ai', 'test'],
  });

  assert(response.id.startsWith('blotato-dry-'), 'Dry-run ID: ' + response.id);
  assert(response.status === 'published', 'Status: ' + response.status);
  assert(response.platforms.length === 9, 'All 9 platforms returned: ' + response.platforms.length);
  assert(response.platforms.every(p => p.success), 'All platforms succeeded in dry-run');

  // Check each platform has a URL
  for (const p of response.platforms) {
    assert(!!p.postUrl && p.postUrl.length > 10, p.platform + ' has URL: ' + (p.postUrl || 'MISSING'));
  }
  assert(!!response.createdAt, 'Has createdAt: ' + response.createdAt);

  // --- Test 2: BlotatoClient.isConfigured() ---
  console.log('\nTest 2: BlotatoClient.isConfigured()');
  // Without BLOTATO_API_KEY, should be false
  assert(!BlotatoClient.isConfigured(), 'isConfigured() = false (no API key)');

  // --- Test 3: ALL_PLATFORMS constant ---
  console.log('\nTest 3: ALL_PLATFORMS');
  assert(ALL_PLATFORMS.length === 9, '9 platforms defined');
  assert(ALL_PLATFORMS.includes('tiktok'), 'Includes tiktok');
  assert(ALL_PLATFORMS.includes('instagram'), 'Includes instagram');
  assert(ALL_PLATFORMS.includes('youtube'), 'Includes youtube');
  assert(ALL_PLATFORMS.includes('bluesky'), 'Includes bluesky');
  assert(ALL_PLATFORMS.includes('x'), 'Includes x');

  // --- Test 4: Full pipeline through PublishingAgent ---
  console.log('\nTest 4: PublishingAgent multi-platform integration');
  const briefs = getMockInsightBriefs();
  const scriptAgent = new ScriptAgent();
  const bundles: ScriptBundle[] = scriptAgent.run(briefs);
  assert(bundles.length >= 1, 'ScriptAgent: ' + bundles.length + ' bundles');

  const editingAgent = new EditingAgent('mock');
  const editedVideos: EditedVideo[] = editingAgent.run(bundles);
  assert(editedVideos.length >= 1, 'EditingAgent: ' + editedVideos.length + ' videos');

  const captionAgent = new CaptionAgent();
  const captionedVideos: CaptionedVideo[] = captionAgent.run(editedVideos, bundles);
  assert(captionedVideos.length >= 1, 'CaptionAgent: ' + captionedVideos.length + ' captioned');

  const qcAgent = new QCAgent();
  const gates: QualityControlGate[] = qcAgent.run(captionedVideos, bundles, editedVideos);
  const passedGates = gates.filter(g => g.overall_pass);
  assert(passedGates.length >= 1, 'QCAgent: ' + passedGates.length + '/' + gates.length + ' passed');

  const publishingAgent = new PublishingAgent('mock');
  const published: PublishedVideo[] = await publishingAgent.run(gates, captionedVideos, bundles);
  assert(published.length >= 1, 'PublishingAgent: ' + published.length + ' results');

  // Each video should produce 9 platform results (multi-platform)
  const uniqueVideos = new Set(published.map(p => p.video_id));
  for (const vid of uniqueVideos) {
    const perVideo = published.filter(p => p.video_id === vid);
    assert(perVideo.length === 9, 'Video ' + vid.substring(0, 8) + ': ' + perVideo.length + '/9 platforms');
  }

  // Check publish_method field
  assert(published.every(p => p.publish_method === 'blotato'), 'All use blotato method');

  // Check required fields on each result
  for (const p of published.slice(0, 3)) {
    assert(!!p.publish_id, 'Has publish_id');
    assert(!!p.video_id, 'Has video_id');
    assert(!!p.platform, 'Has platform: ' + p.platform);
    assert(!!p.post_url, 'Has post_url');
    assert(!!p.posted_at, 'Has posted_at');
    assert(!!p.posting_slot, 'Has posting_slot');
    assert(!!p.caption_text, 'Has caption_text');
    assert(p.hashtags.length >= 3, 'Has ' + p.hashtags.length + ' hashtags');
  }

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) {
    console.log('✅ Sprint 253 — Blotato Multi-Platform Publishing — ALL PASS');
  } else {
    console.log('❌ Sprint 253 — ' + failed + ' tests FAILED');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exitCode = 1;
});
