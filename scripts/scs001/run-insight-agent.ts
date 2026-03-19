#!/usr/bin/env ts-node
// SCS-001 Block B — Insight Agent Runner
// Chains: Trend → Discovery → Clip Detection → Insight Agent
// Usage: npx ts-node scripts/scs001/run-insight-agent.ts [--mock] [--clip-output <path>] [--dry-run]
//   --mock            Use pre-qualified mock clips (skips Block A entirely)
//   --clip-output     Load ClipQualityScore[] JSON from file
//   (no flags)        Run full Block A pipeline first

import { TrendAgent } from '../../agents/scs001-trend/index';
import { DiscoveryAgent } from '../../agents/scs001-discovery/index';
import { ClipDetectionAgent } from '../../agents/scs001-clip-detection/index';
import { InsightAgent, getMockQualifiedClips, InsightBrief } from '../../agents/scs001-insight/index';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const args    = process.argv.slice(2);
const getArg  = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const MOCK_MODE   = args.includes('--mock');
const CLIP_OUTPUT = getArg('--clip-output', '');
const DRY_RUN     = args.includes('--dry-run');
const ROOT        = join(__dirname, '..', '..');
const OUT_DIR     = join(ROOT, 'workspace', 'scs001', 'insight-outputs');

async function main(): Promise<void> {
  console.log('');
  console.log('💡 SCS-001 Insight Agent — Starting...');
  console.log('');

  let qualifiedClips;

  if (MOCK_MODE) {
    console.log('Mode: MOCK — using pre-qualified clips (Block A skipped)');
    qualifiedClips = getMockQualifiedClips();
  } else if (CLIP_OUTPUT) {
    console.log('Mode: FILE — loading clips from: ' + CLIP_OUTPUT);
    const raw = JSON.parse(readFileSync(CLIP_OUTPUT, 'utf8'));
    const allClips = Array.isArray(raw) ? raw : (raw.clips ?? []);
    qualifiedClips = allClips.filter((c: any) => c.qualified === true);
    console.log('Loaded: ' + allClips.length + ' clips → ' + qualifiedClips.length + ' qualified');
  } else {
    console.log('Mode: FULL PIPELINE — running Block A first...');
    const trendBatch  = await new TrendAgent().run();
    const discoveries = await new DiscoveryAgent().run(trendBatch);
    const allClips    = await new ClipDetectionAgent().run(discoveries);
    qualifiedClips    = allClips.filter(c => c.qualified);
    console.log('Block A: ' + allClips.length + ' clips → ' + qualifiedClips.length + ' qualified');
  }

  if (qualifiedClips.length === 0) {
    console.log('No qualified clips to process. Use --mock to test with sample data.');
    process.exit(0);
  }

  const agent  = new InsightAgent();
  const briefs: InsightBrief[] = await agent.run(qualifiedClips);

  const totalCost = briefs.reduce((sum, b) => sum + b.cloud_cost_usd, 0);
  console.log('');
  console.log('📋 Insight Results (' + briefs.length + ' briefs, $' + totalCost.toFixed(4) + ' total):');
  briefs.forEach(b => {
    console.log('  [' + b.hook.formula + '] ' + b.hook.text.substring(0, 70));
  });

  if (!DRY_RUN) {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    const ts      = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 19);
    const outFile = join(OUT_DIR, 'insights-' + ts + '.json');
    writeFileSync(outFile, JSON.stringify({
      generated_at:   new Date().toISOString(),
      total_cost_usd: totalCost,
      brief_count:    briefs.length,
      briefs,
    }, null, 2));
    console.log('');
    console.log('✅ Saved → ' + outFile);
  } else {
    console.log('');
    console.log('[DRY RUN] Output not saved.');
  }
}

main().catch(err => { console.error('Insight Agent failed:', err); process.exit(1); });