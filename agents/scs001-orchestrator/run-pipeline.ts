#!/usr/bin/env ts-node
// SCS-001 Pipeline Runner — Executes orchestrator, saves report, notifies via Telegram
// Usage: npx ts-node agents/scs001-orchestrator/run-pipeline.ts [mock|live]

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { SCS001Orchestrator } from './index';
import { notifyPipelineComplete, notifyPipelineError } from './notifier';
import { logPipelineMetric } from './metrics-logger';
import { DedupLedger } from './dedup-ledger';

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

  // Log metrics for dashboard trends (non-fatal)
  try {
    logPipelineMetric(report);
  } catch (err) {
    console.error('[Runner] Metrics logging failed (non-fatal):', (err as Error).message);
  }

  // Notify subscribers via Telegram (non-fatal)
  try {
    await notifyPipelineComplete(report);
  } catch (err) {
    console.error('[Runner] Notification failed (non-fatal):', (err as Error).message);
  }

  // Sprint 300: Auto-compact ledger to prevent duplicate accumulation
  try {
    const ledger = new DedupLedger();
    const { before, after } = ledger.compact();
    if (before > after) {
      console.log(`[Runner] Ledger compacted: ${before} → ${after}`);
    }
  } catch (err) {
    console.error('[Runner] Ledger compact failed (non-fatal):', (err as Error).message);
  }
}

main().catch(async err => {
  console.error('Pipeline run failed:', err);
  try { await notifyPipelineError(err.message ?? String(err)); } catch {}
  process.exit(1);
});
