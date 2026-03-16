#!/usr/bin/env ts-node
// SCS-001 Pipeline Runner — Executes orchestrator and saves report to JSON
// Usage: npx ts-node agents/scs001-orchestrator/run-pipeline.ts [mock|live]

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { SCS001Orchestrator } from './index';

async function main(): Promise<void> {
  const mode = (process.argv[2] === 'live' ? 'live' : 'mock') as 'mock' | 'live';
  const orchestrator = new SCS001Orchestrator(mode);
  const report = await orchestrator.run();

  // Save report to reports dir
  const reportsDir = 'reports/pipeline-runs';
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  const filename = reportsDir + '/' + report.run_id + '.json';
  writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log('[Runner] Report saved to ' + filename);

  // Also save as latest
  writeFileSync(reportsDir + '/latest.json', JSON.stringify(report, null, 2));
  console.log('[Runner] Latest report updated');
}

main().catch(err => { console.error('Pipeline run failed:', err); process.exit(1); });
