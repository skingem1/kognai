#!/usr/bin/env ts-node
// SCS-001 Block A — Full Integration Test
// Pipeline: TrendAgent → DiscoveryAgent → ClipDetectionAgent → validation

import { TrendAgent } from '../../agents/scs001-trend/index';
import { DiscoveryAgent } from '../../agents/scs001-discovery/index';
import { ClipDetectionAgent, ClipQualityScore } from '../../agents/scs001-clip-detection/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error(`  ✗ FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`  ✓ PASS: ${msg}`); }
}

async function main(): Promise<void> {
  console.log('\n🧪 SCS-001 Block A — Full Integration Test\n');

  // Run full pipeline
  console.log('Step 1: Trend Agent...');
  const trendAgent = new TrendAgent();
  const batch = trendAgent.run();
  assert(batch.topics.length >= 3, `Trend: >= 3 topics (got ${batch.topics.length})`);

  console.log('\nStep 2: Discovery Agent...');
  const discoveryAgent = new DiscoveryAgent();
  const discoveries = discoveryAgent.run(batch);
  assert(discoveries.length >= batch.topics.length, `Discovery: >= 1 candidate per topic (got ${discoveries.length})`);

  console.log('\nStep 3: Clip Detection Agent...');
  const clipAgent = new ClipDetectionAgent();
  const scores: ClipQualityScore[] = await clipAgent.run(discoveries);

  // Block A Gate Criteria
  console.log('\n--- Block A Gate Checks ---');

  assert(scores.length > 0, `At least 1 clip scored (got ${scores.length})`);

  // Schema compliance per clip
  scores.forEach((s, idx) => {
    assert(typeof s.clip_id === 'string' && s.clip_id.length > 0, `clip[${idx}] clip_id present`);
    assert(typeof s.discovery_id === 'string', `clip[${idx}] discovery_id present`);
    assert(typeof s.url === 'string' && s.url.startsWith('http'), `clip[${idx}] url valid`);
    assert(typeof s.duration_seconds === 'number', `clip[${idx}] duration_seconds present`);
    assert(typeof s.quality_score === 'number' && s.quality_score >= 0 && s.quality_score <= 25, `clip[${idx}] quality_score 0-25`);
    assert(typeof s.score_breakdown === 'object', `clip[${idx}] score_breakdown present`);
    assert(typeof s.score_breakdown.curiosity === 'number', `clip[${idx}] score_breakdown.curiosity present`);
    assert(typeof s.score_breakdown.emotion === 'number', `clip[${idx}] score_breakdown.emotion present`);
    assert(typeof s.score_breakdown.clarity === 'number', `clip[${idx}] score_breakdown.clarity present`);
    assert(typeof s.score_breakdown.insight === 'number', `clip[${idx}] score_breakdown.insight present`);
    assert(typeof s.score_breakdown.controversy === 'number', `clip[${idx}] score_breakdown.controversy present`);
    assert(Array.isArray(s.phrase_triggers_matched), `clip[${idx}] phrase_triggers_matched is array`);
    assert(typeof s.qualified === 'boolean', `clip[${idx}] qualified is boolean`);
    // Verify total matches breakdown
    const computedTotal = s.score_breakdown.curiosity + s.score_breakdown.emotion + s.score_breakdown.clarity + s.score_breakdown.insight + s.score_breakdown.controversy;
    assert(s.quality_score === computedTotal, `clip[${idx}] quality_score matches breakdown sum (${s.quality_score} == ${computedTotal})`);
    // Verify qualified flag
    assert(s.qualified === (s.quality_score >= 20), `clip[${idx}] qualified flag matches gate (score=${s.quality_score})`);
  });

  // Aggregate metrics
  const qualified = scores.filter(s => s.qualified);
  console.log(`\n--- Aggregate ---`);
  console.log(`  Total clips:  ${scores.length}`);
  console.log(`  Qualified:    ${qualified.length}`);
  console.log(`  Avg score:    ${(scores.reduce((a, b) => a + b.quality_score, 0) / scores.length).toFixed(1)}/25`);

  const code = process.exitCode === 1 ? 1 : 0;
  console.log(`\n${code === 0 ? '✅ Block A gate PASSED' : '❌ Block A gate FAILED'}`);
  process.exit(code);
}

main().catch(err => { console.error('Block A test failed:', err); process.exit(1); });
