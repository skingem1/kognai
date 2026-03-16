#!/usr/bin/env ts-node
// SCS-001 Block B — Script Agent Runner
// Chains: InsightBrief[] → ScriptAgent → ScriptBundle[]
// Usage: npx ts-node scripts/scs001/run-script-agent.ts [--mock] [--insight-output <path>] [--dry-run]
//   --mock             Use mock InsightBriefs (runs Insight Agent with mock clips first)
//   --insight-output    Load InsightBrief[] JSON from file
//   --dry-run          Don't save output

import { InsightAgent, getMockQualifiedClips } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../../agents/scs001-script/index';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const args    = process.argv.slice(2);
const getArg  = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const MOCK_MODE      = args.includes('--mock');
const INSIGHT_OUTPUT = getArg('--insight-output', '');
const DRY_RUN        = args.includes('--dry-run');
const ROOT           = join(__dirname, '..', '..');
const OUT_DIR        = join(ROOT, 'workspace', 'scs001', 'script-outputs');

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83d\udcdd SCS-001 Script Agent \u2014 Starting...');
  console.log('');

  let briefs;

  if (INSIGHT_OUTPUT) {
    console.log('Mode: FILE \u2014 loading InsightBriefs from: ' + INSIGHT_OUTPUT);
    const raw = JSON.parse(readFileSync(INSIGHT_OUTPUT, 'utf8'));
    briefs = Array.isArray(raw) ? raw : (raw.briefs ?? []);
    console.log('Loaded: ' + briefs.length + ' InsightBriefs');
  } else if (MOCK_MODE) {
    console.log('Mode: MOCK \u2014 running Insight Agent with mock clips first...');
    const mockClips = getMockQualifiedClips();
    const insightAgent = new InsightAgent();
    briefs = await insightAgent.run(mockClips);
    console.log('Insight Agent produced: ' + briefs.length + ' briefs');
  } else {
    console.log('Error: Must specify --mock or --insight-output <path>');
    console.log('  --mock              Run Insight Agent with mock clips, then Script Agent');
    console.log('  --insight-output    Load InsightBrief[] from JSON file');
    process.exit(1);
  }

  if (briefs.length === 0) {
    console.log('No InsightBriefs to process.');
    process.exit(0);
  }

  const agent   = new ScriptAgent();
  const bundles: ScriptBundle[] = agent.run(briefs);

  console.log('');
  console.log('\ud83d\udcdd Script Results (' + bundles.length + ' bundles):');
  bundles.forEach(b => {
    console.log('  [' + b.hook_formula_used + '] ' + b.segments.length + ' segments, ' +
      b.pattern_interrupts.length + ' interrupts, ' + b.total_duration_seconds + 's, loop=' + b.loop_ending);
  });

  if (!DRY_RUN) {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    const ts      = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 19);
    const outFile = join(OUT_DIR, 'scripts-' + ts + '.json');
    writeFileSync(outFile, JSON.stringify({
      generated_at:  new Date().toISOString(),
      bundle_count:  bundles.length,
      bundles,
    }, null, 2));
    console.log('');
    console.log('\u2705 Saved \u2192 ' + outFile);
  } else {
    console.log('');
    console.log('[DRY RUN] Output not saved.');
  }
}

main().catch(err => { console.error('Script Agent failed:', err); process.exit(1); });
