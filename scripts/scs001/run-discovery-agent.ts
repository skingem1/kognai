#!/usr/bin/env ts-node
// SCS-001 Block A — Discovery Agent Runner
// Chains: Trend Agent → Discovery Agent
// Usage: npx ts-node scripts/scs001/run-discovery-agent.ts [--trend-output <path>] [--dry-run]

import { TrendAgent, saveBatch } from '../../agents/scs001-trend/index';
import { DiscoveryAgent, DiscoveryOutput } from '../../agents/scs001-discovery/index';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const getArg = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const TREND_OUTPUT = getArg('--trend-output', '');
const DRY_RUN     = args.includes('--dry-run');
const ROOT        = join(__dirname, '..', '..');
const OUT_DIR     = join(ROOT, 'workspace', 'scs001', 'discovery-outputs');

async function main(): Promise<void> {
  console.log('\n🔍 SCS-001 Discovery Agent — Starting...\n');

  // Step 1: Get trend batch (from file or run fresh)
  let trendBatch;
  if (TREND_OUTPUT) {
    console.log(`Loading trend batch from: ${TREND_OUTPUT}`);
    trendBatch = JSON.parse(readFileSync(TREND_OUTPUT, 'utf8'));
  } else {
    console.log('Running Trend Agent first...');
    const trendAgent = new TrendAgent();
    trendBatch = await trendAgent.run();
    if (!DRY_RUN) {
      const trendDir = join(ROOT, 'workspace', 'scs001', 'trend-outputs');
      saveBatch(trendBatch, trendDir);
    }
  }

  console.log(`Trend batch: ${trendBatch.batch_id} (${trendBatch.topics.length} topics)\n`);

  // Step 2: Run Discovery Agent
  const discovery = new DiscoveryAgent();
  const outputs: DiscoveryOutput[] = await discovery.run(trendBatch);

  console.log(`\n📋 Discovery Results (${outputs.length} candidates):`);
  outputs.forEach(o => {
    console.log(`  [score:${o.source_score}] ${o.speaker} | ${o.timestamps.length} timestamps | ${o.url.substring(0, 60)}`);
  });

  if (!DRY_RUN) {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    const outFile = join(OUT_DIR, `discovery-${trendBatch.batch_id}.json`);
    writeFileSync(outFile, JSON.stringify({ source_batch: trendBatch.batch_id, generated_at: new Date().toISOString(), candidates: outputs }, null, 2));
    console.log(`\n✅ Saved → ${outFile}`);
  } else {
    console.log('\n[DRY RUN] Output not saved.');
  }
}

main().catch(err => { console.error('Discovery Agent failed:', err); process.exit(1); });
