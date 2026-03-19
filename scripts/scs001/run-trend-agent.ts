#!/usr/bin/env ts-node
// SCS-001 Block A — Trend Agent Runner
// Usage: npx ts-node scripts/scs001/run-trend-agent.ts [--dry-run]

import { TrendAgent, saveBatch } from '../../agents/scs001-trend/index';
import { join } from 'path';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'workspace', 'scs001', 'trend-outputs');

async function main(): Promise<void> {
  console.log('\n📡 SCS-001 Trend Agent — Starting...\n');

  const agent = new TrendAgent();
  const batch = await agent.run();

  console.log(`Batch: ${batch.batch_id} (${batch.topics.length} topics)`);
  batch.topics.forEach(t => {
    console.log(`  [${t.confidence_score}] ${t.topic_name}`);
  });

  if (!DRY_RUN) {
    saveBatch(batch, OUT_DIR);
    console.log(`\n✅ Saved → ${OUT_DIR}`);
  } else {
    console.log('\n[DRY RUN] Output not saved.');
  }
}

main().catch(err => { console.error('Trend Agent failed:', err); process.exit(1); });
