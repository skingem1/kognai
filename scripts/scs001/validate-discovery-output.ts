#!/usr/bin/env ts-node
// SCS-001 Block A — Discovery Agent Integration Test
// Tests: Trend Agent → Discovery Agent → DiscoveryOutput[] validation

import { TrendAgent } from '../../agents/scs001-trend/index';
import { DiscoveryAgent, DiscoveryOutput } from '../../agents/scs001-discovery/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error(`  ✗ FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`  ✓ PASS: ${msg}`); }
}

async function main(): Promise<void> {
  console.log('\n🧪 SCS-001 Discovery Agent — Integration Test\n');

  // Run pipeline
  const trendAgent = new TrendAgent();
  const batch = await trendAgent.run();
  const discoveryAgent = new DiscoveryAgent();
  const outputs: DiscoveryOutput[] = await discoveryAgent.run(batch);

  // Output-level checks
  assert(Array.isArray(outputs), 'outputs is array');
  assert(outputs.length >= batch.topics.length, `At least one discovery per topic (${outputs.length} >= ${batch.topics.length})`);

  // Per-output checks
  outputs.forEach((o, idx) => {
    assert(typeof o.discovery_id === 'string' && o.discovery_id.length > 0, `output[${idx}] discovery_id present`);
    assert(typeof o.url === 'string' && o.url.startsWith('http'), `output[${idx}] url is valid`);
    assert(Array.isArray(o.timestamps) && o.timestamps.length >= 1 && o.timestamps.length <= 5, `output[${idx}] timestamps 1-5 entries`);
    assert(typeof o.speaker === 'string' && o.speaker.length > 0, `output[${idx}] speaker present`);
    assert(Array.isArray(o.topic_tags) && o.topic_tags.length >= 1, `output[${idx}] topic_tags present`);
    assert(Number.isInteger(o.source_score) && o.source_score >= 1 && o.source_score <= 5, `output[${idx}] source_score 1-5`);
    assert(typeof o.source_topic_id === 'string', `output[${idx}] source_topic_id present`);

    // Timestamp sub-checks
    o.timestamps.forEach((ts, ti) => {
      assert(typeof ts.start_seconds === 'number' && ts.start_seconds >= 0, `output[${idx}] timestamp[${ti}] start_seconds valid`);
      assert(typeof ts.end_seconds === 'number' && ts.end_seconds > ts.start_seconds, `output[${idx}] timestamp[${ti}] end > start`);
    });
  });

  // Back-link check: every source_topic_id exists in batch
  const topicIds = new Set(batch.topics.map(t => t.topic_id));
  outputs.forEach((o, idx) => {
    assert(topicIds.has(o.source_topic_id), `output[${idx}] source_topic_id links to valid trend topic`);
  });

  const code = process.exitCode === 1 ? 1 : 0;
  console.log(`\n${code === 0 ? '✅ All checks passed' : '❌ Some checks failed'}`);
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
