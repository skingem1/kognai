#!/usr/bin/env ts-node
// SCS-001 Block A — Clip Detection Agent Runner
// Chains: Trend Agent → Discovery Agent → Clip Detection Agent
// Usage: npx ts-node scripts/scs001/run-clip-detection.ts [--discovery-output <path>] [--dry-run]

import { TrendAgent, saveBatch } from '../../agents/scs001-trend/index';
import { DiscoveryAgent } from '../../agents/scs001-discovery/index';
import { ClipDetectionAgent, ClipQualityScore } from '../../agents/scs001-clip-detection/index';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const getArg = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const DISCOVERY_OUTPUT = getArg('--discovery-output', '');
const DRY_RUN          = args.includes('--dry-run');
const ROOT             = join(__dirname, '..', '..');
const OUT_DIR          = join(ROOT, 'workspace', 'scs001', 'clip-scores');

async function main(): Promise<void> {
  console.log('\n🎬 SCS-001 Clip Detection Agent — Starting...\n');

  let discoveries;
  let batchId = 'unknown';

  if (DISCOVERY_OUTPUT) {
    console.log(`Loading discovery output from: ${DISCOVERY_OUTPUT}`);
    const data = JSON.parse(readFileSync(DISCOVERY_OUTPUT, 'utf8')) as { source_batch: string; candidates: typeof discoveries };
    discoveries = data.candidates;
    batchId = data.source_batch;
  } else {
    console.log('Running full Block A pipeline (Trend → Discovery → ClipDetection)...');
    const trendAgent = new TrendAgent();
    const batch = await trendAgent.run();
    batchId = batch.batch_id;
    if (!DRY_RUN) saveBatch(batch, join(ROOT, 'workspace', 'scs001', 'trend-outputs'));

    const discoveryAgent = new DiscoveryAgent();
    discoveries = await discoveryAgent.run(batch);
    if (!DRY_RUN) {
      const discDir = join(ROOT, 'workspace', 'scs001', 'discovery-outputs');
      if (!existsSync(discDir)) mkdirSync(discDir, { recursive: true });
      writeFileSync(join(discDir, `discovery-${batchId}.json`), JSON.stringify({ source_batch: batchId, generated_at: new Date().toISOString(), candidates: discoveries }, null, 2));
    }
  }

  console.log(`Discovery candidates: ${discoveries?.length ?? 0}\n`);

  const clipAgent = new ClipDetectionAgent();
  const scores: ClipQualityScore[] = await clipAgent.run(discoveries ?? []);

  const qualified  = scores.filter(s => s.qualified);
  const rejected   = scores.filter(s => !s.qualified);

  console.log(`\n📊 Block A Results:`);
  console.log(`  Total clips scored:  ${scores.length}`);
  console.log(`  Qualified (≥20/25):  ${qualified.length}`);
  console.log(`  Rejected (<20/25):   ${rejected.length}`);
  if (qualified.length > 0) {
    console.log(`\n  Top clips:`);
    qualified
      .sort((a, b) => b.quality_score - a.quality_score)
      .slice(0, 3)
      .forEach(c => console.log(`    [${c.quality_score}/25] ${c.speaker} | ${c.start_seconds}s-${c.end_seconds}s`));
  }

  if (!DRY_RUN) {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    const outFile = join(OUT_DIR, `clip-scores-${batchId}.json`);
    writeFileSync(outFile, JSON.stringify({ source_batch: batchId, generated_at: new Date().toISOString(), scores }, null, 2));
    console.log(`\n✅ Saved → ${outFile}`);
  } else {
    console.log('\n[DRY RUN] Output not saved.');
  }
}

main().catch(err => { console.error('Clip Detection failed:', err); process.exit(1); });
