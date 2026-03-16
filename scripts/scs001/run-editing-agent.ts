#!/usr/bin/env ts-node
// SCS-001 Editing Agent — CLI Runner
// Chains: ScriptBundle[] (from file or mock pipeline) → EditingAgent → EditedVideo[]
// Usage:
//   npx ts-node scripts/scs001/run-editing-agent.ts --mock
//   npx ts-node scripts/scs001/run-editing-agent.ts --script-output workspace/scs001/script-outputs/bundles-XXXX.json

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { getMockInsightBriefs } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../../agents/scs001-script/index';
import { EditingAgent } from '../../agents/scs001-editing/index';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useMock         = args.includes('--mock');
  const scriptOutputIdx = args.indexOf('--script-output');
  const scriptOutputPath = scriptOutputIdx >= 0 ? args[scriptOutputIdx + 1] : null;
  const dryRun          = args.includes('--dry-run');

  let bundles: ScriptBundle[];

  if (scriptOutputPath && existsSync(scriptOutputPath)) {
    // Load pre-computed ScriptBundles from file
    console.log('[Runner] Loading ScriptBundles from ' + scriptOutputPath);
    bundles = JSON.parse(readFileSync(scriptOutputPath, 'utf-8'));
    console.log('[Runner] Loaded ' + bundles.length + ' bundles');
  } else if (useMock) {
    // Run mock pipeline: mock InsightBriefs → ScriptAgent → ScriptBundles
    console.log('[Runner] Running mock pipeline: InsightBriefs → ScriptAgent');
    const briefs = getMockInsightBriefs();
    const scriptAgent = new ScriptAgent();
    bundles = scriptAgent.run(briefs);
    console.log('[Runner] ScriptAgent produced ' + bundles.length + ' bundles');
  } else {
    console.error('Usage: run-editing-agent.ts --mock | --script-output <path>');
    process.exit(1);
    return;
  }

  if (dryRun) {
    console.log('[Runner] DRY RUN — skipping FFmpeg execution');
    console.log('[Runner] Would process ' + bundles.length + ' ScriptBundles');
    bundles.forEach((b, i) => {
      console.log('  [' + i + '] ' + b.script_id + ' → ' + b.segments.length + ' segments, ' + b.total_duration_seconds + 's');
    });
    return;
  }

  // Run Editing Agent
  const editingAgent = new EditingAgent();
  const videos = editingAgent.run(bundles);

  // Save output metadata
  const outDir = 'workspace/scs001/editing-outputs';
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = outDir + '/videos-' + Date.now() + '.json';
  writeFileSync(outPath, JSON.stringify(videos, null, 2));
  console.log('[Runner] Output metadata saved to ' + outPath);

  // Summary
  console.log('');
  console.log('=== Editing Agent Summary ===');
  console.log('Input bundles:  ' + bundles.length);
  console.log('Videos produced: ' + videos.length);
  const totalRender = videos.reduce((sum, v) => sum + v.ffmpeg_processing_seconds, 0);
  console.log('Total render time: ' + totalRender.toFixed(1) + 's');
  videos.forEach((v, i) => {
    console.log('  [' + i + '] ' + v.video_id + ' → ' + v.file_path + ' (' + v.duration_seconds + 's, ' + v.pattern_interrupt_count + ' interrupts)');
  });
}

main().catch(err => { console.error('Editing Agent failed:', err); process.exit(1); });
