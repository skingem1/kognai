/**
 * SCS-001 — Batch Video Production (v2 — Pipeline Registry)
 *
 * Produces videos through the pipeline registry. Supports all 3 pipelines:
 *   --pipeline educational   (P1: avatar + B-roll)
 *   --pipeline code-demo     (P2: syntax-highlighted code walkthrough)
 *   --pipeline entertainment (P3: AI-generated trending video)
 *   --pipeline all           (round-robin across all registered pipelines)
 *
 * Usage:
 *   npx ts-node scripts/scs001/batch-produce.ts --pipeline educational --runs 3
 *   npx ts-node scripts/scs001/batch-produce.ts --pipeline all --runs 6
 *   npx ts-node scripts/scs001/batch-produce.ts --pipeline code-demo --code "print('hello')"
 *   npx ts-node scripts/scs001/batch-produce.ts --pipeline entertainment --topic "AI agents"
 *
 * Sprint 899 — Pipeline restructuring
 */

import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { initRegistry, runPipeline, listPipelines } from './pipeline-registry';
import type { PipelineName, PipelineInput, PipelineRunResult } from './pipeline-registry';

const ROOT = join(__dirname, '..', '..');

function parseArgs(): {
  pipeline: PipelineName | 'all';
  runs: number;
  dryRun: boolean;
  topics: string[];
  code: string | undefined;
  withVoiceover: boolean;
  withMusic: boolean;
  mode: 'avatar' | 'tts';
} {
  let pipeline: PipelineName | 'all' = 'educational';
  let runs = 3;
  let dryRun = false;
  const topics: string[] = [];
  let code: string | undefined;
  let withVoiceover = true;
  let withMusic = false;
  let mode: 'avatar' | 'tts' = 'avatar';

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--pipeline' && process.argv[i + 1]) {
      pipeline = process.argv[++i] as PipelineName | 'all';
    } else if (arg === '--runs' && process.argv[i + 1]) {
      runs = Math.min(Math.max(parseInt(process.argv[++i]) || 3, 1), 20);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--topic' && process.argv[i + 1]) {
      topics.push(process.argv[++i]);
    } else if (arg.startsWith('--topic=')) {
      topics.push(arg.split('=').slice(1).join('='));
    } else if (arg === '--code' && process.argv[i + 1]) {
      code = process.argv[++i];
    } else if (arg === '--no-voice') {
      withVoiceover = false;
    } else if (arg === '--music') {
      withMusic = true;
    } else if (arg === '--mode' && process.argv[i + 1]) {
      mode = process.argv[++i] as 'avatar' | 'tts';
    } else if (arg.startsWith('--mode=')) {
      mode = arg.split('=')[1] as 'avatar' | 'tts';
    }
  }

  return { pipeline, runs, dryRun, topics, code, withVoiceover, withMusic, mode };
}

async function main(): Promise<void> {
  await initRegistry();
  const { pipeline, runs, dryRun, topics, code, withVoiceover, withMusic, mode } = parseArgs();

  const available = listPipelines();
  console.log(`\n=== SCS-001 Batch Production (v2) ===`);
  console.log(`Pipeline: ${pipeline}`);
  console.log(`Runs: ${runs}`);
  console.log(`Mode: ${mode}`);
  console.log(`Available: ${available.map(p => p.name).join(', ')}`);
  if (dryRun) console.log('DRY RUN');
  console.log('');

  const results: PipelineRunResult[] = [];
  const errors: Array<{ run: number; error: string }> = [];

  // Build pipeline rotation
  const pipelineNames: PipelineName[] = pipeline === 'all'
    ? available.map(p => p.name)
    : [pipeline as PipelineName];

  for (let i = 0; i < runs; i++) {
    const pName = pipelineNames[i % pipelineNames.length];
    const runNum = i + 1;

    console.log(`--- Run ${runNum}/${runs} (${pName}) ---`);
    const startTime = Date.now();

    const input: PipelineInput = {
      pipeline: pName,
      topic: topics[i % Math.max(topics.length, 1)] || undefined,
      code: pName === 'code-demo' ? code : undefined,
      options: { withVoiceover, withMusic, dryRun, mode },
    };

    try {
      if (dryRun) {
        console.log(`  [DRY RUN] Would run ${pName} with input: ${JSON.stringify(input).slice(0, 100)}`);
        continue;
      }

      const result = await runPipeline(input);
      results.push(result);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Completed in ${elapsed}s — ${result.title}`);
    } catch (err: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const msg = err.message?.slice(0, 200) ?? 'unknown';
      console.warn(`  Failed in ${elapsed}s: ${msg}`);
      errors.push({ run: runNum, error: msg });

      // 3 consecutive failures → abort
      if (errors.length >= 3 && errors.slice(-3).every((_, j) => j >= errors.length - 3)) {
        console.log('\n3 consecutive failures — aborting batch.');
        break;
      }
    }

    if (i < runs - 1) await new Promise(r => setTimeout(r, 2000));
  }

  // Summary
  console.log('\n=== Batch Summary ===');
  console.log(`Runs: ${results.length}/${runs} successful, ${errors.length} failed`);
  console.log(`Total cost: $${results.reduce((s, r) => s + r.cost_usd, 0).toFixed(2)}`);
  for (const r of results) {
    console.log(`  [${r.pipeline}] ${r.title} — ${r.videoPath}`);
  }

  // Save report
  const report = {
    batch_at: new Date().toISOString(),
    pipeline_filter: pipeline,
    runs_planned: runs,
    runs_completed: results.length,
    results: results.map(r => ({ pipeline: r.pipeline, runId: r.runId, title: r.title, cost: r.cost_usd })),
    errors,
  };
  const reportPath = join(ROOT, 'reports', 'batch-produce-latest.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);

  // Sprint 1317: Auto-deliver freshly produced videos to Telegram immediately
  if (!dryRun && results.length > 0) {
    console.log(`\n[batch-produce] Auto-delivering ${results.length} video(s) to Telegram...`);
    try {
      execSync(
        `npx ts-node --transpile-only scripts/scs001/posting-auto-deliver.ts --batch ${results.length}`,
        { cwd: ROOT, stdio: 'inherit', timeout: 120000 }
      );
    } catch (e: any) {
      console.warn(`[batch-produce] Auto-deliver failed (non-fatal): ${e.message?.slice(0, 100)}`);
    }
  }
}

main().catch(err => {
  console.error('Batch production failed:', err.message);
  process.exit(1);
});
