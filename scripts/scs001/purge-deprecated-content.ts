/**
 * purge-deprecated-content.ts — One-time cleanup of deprecated SCS-001 content
 *
 * Deletes old multiformat pipeline output, legacy run dirs, and old vlog runs.
 * Preserves: ledger files, state files, latest vlog run, analytics.
 *
 * Usage: npx ts-node scripts/scs001/purge-deprecated-content.ts --confirm
 *        (without --confirm: dry-run showing what would be deleted)
 *
 * Sprint 870 — Pipeline restructuring cleanup
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const WORKSPACE = join(ROOT, 'workspace', 'scs001');
const confirm = process.argv.includes('--confirm');

interface PurgeTarget {
  path: string;
  reason: string;
  sizeBytes: number;
}

function getDirSize(dir: string): number {
  try {
    const raw = execSync(`du -sk "${dir}" 2>/dev/null`, { encoding: 'utf-8' }).trim();
    return (parseInt(raw.split('\t')[0]) || 0) * 1024;
  } catch { return 0; }
}

function formatSize(bytes: number): string {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function findTargets(): PurgeTarget[] {
  const targets: PurgeTarget[] = [];

  // 1. multiformat-runs/ — 2.2GB of deprecated 4-format output
  const mfDir = join(WORKSPACE, 'multiformat-runs');
  if (existsSync(mfDir)) {
    targets.push({ path: mfDir, reason: 'Deprecated multiformat pipeline output', sizeBytes: getDirSize(mfDir) });
  }

  // 2. Legacy run-1774* timestamp dirs
  if (existsSync(WORKSPACE)) {
    for (const name of readdirSync(WORKSPACE)) {
      if (name.startsWith('run-') && /^run-\d{10,}/.test(name)) {
        const full = join(WORKSPACE, name);
        if (statSync(full).isDirectory()) {
          targets.push({ path: full, reason: 'Legacy timestamp-named run directory', sizeBytes: getDirSize(full) });
        }
      }
    }
  }

  // 3. Old vlog-runs (keep the latest one only)
  const vlogDir = join(WORKSPACE, 'vlog-runs');
  if (existsSync(vlogDir)) {
    const runs = readdirSync(vlogDir)
      .filter(d => d.startsWith('vlog-'))
      .map(d => ({ name: d, path: join(vlogDir, d), mtime: statSync(join(vlogDir, d)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    // Keep the newest, purge the rest
    for (let i = 1; i < runs.length; i++) {
      targets.push({ path: runs[i].path, reason: 'Old vlog run (keeping latest)', sizeBytes: getDirSize(runs[i].path) });
    }
    if (runs.length > 0) console.log(`  Keeping latest vlog run: ${runs[0].name}`);
  }

  // 4. Old pipeline-runs/ (Phase 0 era)
  const pipelineRuns = join(WORKSPACE, 'pipeline-runs');
  if (existsSync(pipelineRuns)) {
    targets.push({ path: pipelineRuns, reason: 'Phase 0 pipeline runs', sizeBytes: getDirSize(pipelineRuns) });
  }

  // 5. Empty/unused directories
  for (const name of ['mixed-output', 'discovery-outputs', 'editing-outputs', 'clip-scores', 'transcripts', 'broll-test']) {
    const dir = join(WORKSPACE, name);
    if (existsSync(dir)) {
      targets.push({ path: dir, reason: 'Empty/unused directory', sizeBytes: getDirSize(dir) });
    }
  }

  // 6. v2-output (old v2 pipeline, superseded)
  const v2Out = join(WORKSPACE, 'v2-output');
  if (existsSync(v2Out)) {
    targets.push({ path: v2Out, reason: 'Deprecated v2 pipeline output', sizeBytes: getDirSize(v2Out) });
  }

  return targets;
}

function main(): void {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`SCS-001 Content Purge — ${confirm ? 'LIVE' : 'DRY RUN'}`);
  console.log(`${'='.repeat(50)}\n`);

  const targets = findTargets();
  if (targets.length === 0) {
    console.log('Nothing to purge.');
    return;
  }

  let totalBytes = 0;
  for (const t of targets) {
    console.log(`  ${confirm ? '🗑️' : '📋'} ${formatSize(t.sizeBytes).padStart(8)} — ${t.reason}`);
    console.log(`           ${t.path}`);
    totalBytes += t.sizeBytes;
  }

  console.log(`\n  Total: ${formatSize(totalBytes)} across ${targets.length} targets\n`);

  if (!confirm) {
    console.log('  Run with --confirm to execute deletion.');
    return;
  }

  // Execute deletion
  let freed = 0;
  for (const t of targets) {
    try {
      execSync(`rm -rf "${t.path}"`, { stdio: 'pipe' });
      freed += t.sizeBytes;
      console.log(`  ✅ Deleted: ${t.path}`);
    } catch (err: any) {
      console.warn(`  ❌ Failed: ${t.path} — ${err.message?.slice(0, 60)}`);
    }
  }

  console.log(`\n  Freed: ${formatSize(freed)}`);
  console.log(`  Done.\n`);
}

main();
