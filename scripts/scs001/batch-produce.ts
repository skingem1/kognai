/**
 * SCS-001 — Batch Video Production
 *
 * Runs the multiformat pipeline multiple times to stockpile content
 * for manual TikTok posting. Tracks unique topics across runs and
 * refreshes inventory after completion.
 *
 * Usage:
 *   npx ts-node scripts/scs001/batch-produce.ts [--runs N] [--dry-run]
 *
 * Sprint 604 — GATE-PUSH content acceleration
 */

import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');

function parseArgs(): { runs: number; dryRun: boolean } {
  let runs = 3;
  let dryRun = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--runs' && process.argv[i + 1]) {
      runs = Math.min(Math.max(parseInt(process.argv[i + 1]) || 3, 1), 20);
      i++;
    }
    if (process.argv[i] === '--dry-run') dryRun = true;
  }
  return { runs, dryRun };
}

async function main(): Promise<void> {
  const { runs, dryRun } = parseArgs();

  console.log(`=== Batch Video Production ===`);
  console.log(`Runs planned: ${runs}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  const results: Array<{ run: number; success: boolean; videos: number; error?: string }> = [];

  for (let i = 1; i <= runs; i++) {
    console.log(`--- Run ${i}/${runs} ---`);
    const startTime = Date.now();

    try {
      const cmd = `npx ts-node --transpile-only scripts/scs001/run-multiformat-pipeline.ts${dryRun ? ' --dry-run' : ''}`;
      const output = execSync(cmd, {
        cwd: ROOT,
        timeout: 120000, // 2 min per run
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      // Parse output for video count
      const videoMatch = output.match(/videos_composited.*?(\d+)/);
      const videoCount = videoMatch ? parseInt(videoMatch[1]) : 0;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`  Completed in ${elapsed}s — ${videoCount} videos`);
      results.push({ run: i, success: true, videos: videoCount });

    } catch (err: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const msg = err.message?.slice(0, 200) ?? 'unknown error';
      console.log(`  Failed in ${elapsed}s: ${msg}`);
      results.push({ run: i, success: false, videos: 0, error: msg });

      // If 3 consecutive failures, abort
      const recentFailures = results.slice(-3).filter(r => !r.success).length;
      if (recentFailures >= 3) {
        console.log('\n3 consecutive failures — aborting batch.');
        break;
      }
    }

    // Brief pause between runs to avoid API rate limits
    if (i < runs) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Refresh inventory
  console.log('\n--- Refreshing video inventory ---');
  try {
    const inventoryOutput = execSync(
      'npx ts-node --transpile-only scripts/scs001/scan-video-inventory.ts',
      { cwd: ROOT, timeout: 30000, stdio: 'pipe', encoding: 'utf-8' }
    );
    console.log(inventoryOutput);
  } catch (err: any) {
    console.log(`Inventory scan failed: ${err.message?.slice(0, 200)}`);
  }

  // Summary
  const totalVideos = results.reduce((sum, r) => sum + r.videos, 0);
  const successRuns = results.filter(r => r.success).length;

  console.log('\n=== Batch Summary ===');
  console.log(`Runs: ${successRuns}/${runs} successful`);
  console.log(`New videos: ${totalVideos}`);

  // Read updated inventory for gate status
  const invPath = join(ROOT, 'reports', 'video-inventory.json');
  if (existsSync(invPath)) {
    try {
      const inv = JSON.parse(readFileSync(invPath, 'utf-8'));
      console.log(`Total unique videos: ${inv.unique_topics ?? '?'}`);
      console.log(`Gate: ${inv.gate_status?.posted ?? 0}/30 posts (${inv.gate_status?.gap ?? '?'} to go)`);
    } catch { /* skip */ }
  }

  // Save batch report
  const report = {
    batch_at: new Date().toISOString(),
    runs_planned: runs,
    runs_completed: successRuns,
    total_new_videos: totalVideos,
    dry_run: dryRun,
    results,
  };
  const reportPath = join(ROOT, 'reports', 'batch-produce-latest.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);
}

main().catch(err => {
  console.error('Batch production failed:', err.message);
  process.exit(1);
});
