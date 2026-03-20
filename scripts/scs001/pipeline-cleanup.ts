// Sprint 442: Pipeline Cleanup — archive old runs to free disk space
// Keeps the latest N run directories, removes older ones.
// Videos in kept runs remain available for /deliver and /publish.
//
// Usage: npx ts-node scripts/scs001/pipeline-cleanup.ts [--dry-run] [--keep N]
// PM2 cron: kognai-pipeline-cleanup (weekly, Sunday 03:00)

import { readdirSync, statSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const SCS_DIR = join(ROOT, 'workspace', 'scs001');
const KEEP_RUNS = parseInt(process.argv.find(a => a.startsWith('--keep='))?.split('=')[1] || '5', 10);
const DRY_RUN = process.argv.includes('--dry-run');

interface RunDir {
  name: string;
  path: string;
  timestamp: number;
  sizeMB: number;
}

function getDirSizeMB(dirPath: string): number {
  let total = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isFile()) {
        total += statSync(fullPath).size;
      } else if (entry.isDirectory()) {
        total += getDirSizeMB(fullPath) * 1024 * 1024; // recursive, but convert back
      }
    }
  } catch { /* skip inaccessible */ }
  return total / (1024 * 1024);
}

function main(): void {
  console.log(`\n🧹 Pipeline Cleanup${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`   Keep: ${KEEP_RUNS} most recent runs\n`);

  if (!existsSync(SCS_DIR)) {
    console.log('No SCS-001 directory found.');
    return;
  }

  // Find all run-* directories
  const runDirs: RunDir[] = readdirSync(SCS_DIR)
    .filter(d => d.startsWith('run-'))
    .map(name => {
      const p = join(SCS_DIR, name);
      const timestamp = parseInt(name.replace('run-', ''), 10) || 0;
      return { name, path: p, timestamp, sizeMB: 0 };
    })
    .sort((a, b) => b.timestamp - a.timestamp); // newest first

  console.log(`   Found: ${runDirs.length} run directories`);

  if (runDirs.length <= KEEP_RUNS) {
    console.log(`   Nothing to clean — all ${runDirs.length} runs within keep limit.`);
    return;
  }

  const keep = runDirs.slice(0, KEEP_RUNS);
  const remove = runDirs.slice(KEEP_RUNS);

  // Calculate sizes for removal candidates
  let totalFreedMB = 0;
  for (const dir of remove) {
    dir.sizeMB = getDirSizeMB(dir.path);
    totalFreedMB += dir.sizeMB;
  }

  console.log(`   Keep: ${keep.length} runs (latest)`);
  console.log(`   Remove: ${remove.length} runs (${totalFreedMB.toFixed(0)} MB)\n`);

  for (const dir of remove) {
    const date = new Date(dir.timestamp).toISOString().slice(0, 16);
    console.log(`   ${DRY_RUN ? 'Would remove' : 'Removing'}: ${dir.name} (${dir.sizeMB.toFixed(0)} MB, ${date})`);
    if (!DRY_RUN) {
      try {
        rmSync(dir.path, { recursive: true, force: true });
      } catch (err: any) {
        console.error(`   ⚠️ Failed to remove ${dir.name}: ${err.message}`);
      }
    }
  }

  console.log(`\n   ${DRY_RUN ? 'Would free' : 'Freed'}: ${totalFreedMB.toFixed(0)} MB`);
  console.log(`   Remaining: ${keep.length} runs\n`);

  // Output JSON summary for Telegram integration
  const summary = {
    timestamp: new Date().toISOString(),
    dry_run: DRY_RUN,
    total_runs: runDirs.length,
    kept: keep.length,
    removed: remove.length,
    freed_mb: Math.round(totalFreedMB),
    remaining_runs: keep.map(r => r.name),
  };
  console.log(JSON.stringify(summary));
}

main();
