#!/usr/bin/env ts-node
/**
 * cleanup-old-runs.ts — Sprint 809
 * Purges old multiformat-run dirs, topic-radar files, and ephemeral script JSONs.
 * Keeps latest N items by modification time. Runs standalone or via /cleanup.
 *
 * Usage: npx ts-node scripts/scs001/cleanup-old-runs.ts [--dry-run]
 * Env:   CLEANUP_DRY_RUN=1 to preview without deleting
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const DRY_RUN = process.argv.includes('--dry-run') || process.env.CLEANUP_DRY_RUN === '1';

interface CleanupResult {
  multiformat: { deleted: number; kept: number; freedMB: number };
  radar: { deleted: number; kept: number; freedKB: number };
  scripts: { deleted: number; kept: number; freedKB: number };
  totalFreedMB: number;
  dryRun: boolean;
}

function dirSizeMB(dirPath: string): number {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dirPath, e.name);
      if (e.isFile()) {
        total += fs.statSync(full).size;
      } else if (e.isDirectory()) {
        total += dirSizeMB(full) * 1024 * 1024; // recurse (already in bytes after first call)
      }
    }
  } catch { /* ignore */ }
  return total / (1024 * 1024);
}

function fileSizeKB(filePath: string): number {
  try { return fs.statSync(filePath).size / 1024; } catch { return 0; }
}

function rmRecursive(target: string): void {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(target)) {
      rmRecursive(path.join(target, child));
    }
    fs.rmdirSync(target);
  } else {
    fs.unlinkSync(target);
  }
}

function cleanDir(
  parentDir: string,
  prefix: string,
  keepCount: number,
  isDir: boolean
): { deleted: number; kept: number; freedBytes: number } {
  if (!fs.existsSync(parentDir)) return { deleted: 0, kept: 0, freedBytes: 0 };

  const entries = fs.readdirSync(parentDir)
    .filter(name => name.startsWith(prefix))
    .map(name => {
      const full = path.join(parentDir, name);
      try {
        const stat = fs.statSync(full);
        return { name, full, mtime: stat.mtimeMs, isDir: stat.isDirectory() };
      } catch {
        return null;
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null && e.isDir === isDir)
    .sort((a, b) => b.mtime - a.mtime); // newest first

  const keep = entries.slice(0, keepCount);
  const remove = entries.slice(keepCount);

  let freedBytes = 0;
  for (const entry of remove) {
    if (isDir) {
      freedBytes += dirSizeMB(entry.full) * 1024 * 1024;
    } else {
      freedBytes += fileSizeKB(entry.full) * 1024;
    }
    if (!DRY_RUN) {
      rmRecursive(entry.full);
    }
  }

  return { deleted: remove.length, kept: keep.length, freedBytes };
}

function run(): CleanupResult {
  const mfDir = path.join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
  const radarDir = path.join(ROOT, 'workspace', 'scs001', 'topic-radar');
  const scriptsDir = path.join(ROOT, 'workspace', 'scs001', 'scripts');

  // Multiformat runs: keep latest 30 dirs (enough for all postable videos)
  const mf = cleanDir(mfDir, 'mf-', 30, true);

  // Topic radar: keep latest 20 files
  const radar = cleanDir(radarDir, 'radar-', 20, false);

  // Ephemeral script JSONs: keep latest 30 files (dbt-, exp-, lst-, vis-)
  let scriptResult = { deleted: 0, kept: 0, freedBytes: 0 };
  for (const prefix of ['dbt-', 'exp-', 'lst-', 'vis-']) {
    const r = cleanDir(scriptsDir, prefix, 10, false);
    scriptResult.deleted += r.deleted;
    scriptResult.kept += r.kept;
    scriptResult.freedBytes += r.freedBytes;
  }

  const totalFreedMB = (mf.freedBytes + radar.freedBytes + scriptResult.freedBytes) / (1024 * 1024);

  return {
    multiformat: { deleted: mf.deleted, kept: mf.kept, freedMB: Math.round(mf.freedBytes / (1024 * 1024)) },
    radar: { deleted: radar.deleted, kept: radar.kept, freedKB: Math.round(radar.freedBytes / 1024) },
    scripts: { deleted: scriptResult.deleted, kept: scriptResult.kept, freedKB: Math.round(scriptResult.freedBytes / 1024) },
    totalFreedMB: Math.round(totalFreedMB),
    dryRun: DRY_RUN,
  };
}

export function runCleanup(): CleanupResult {
  return run();
}

export function formatCleanupResult(r: CleanupResult): string {
  const mode = r.dryRun ? '🔍 DRY RUN' : '🧹 CLEANUP COMPLETE';
  return [
    `${mode}`,
    '',
    `*Multiformat runs:*`,
    `  Deleted: ${r.multiformat.deleted} dirs (~${r.multiformat.freedMB} MB)`,
    `  Kept: ${r.multiformat.kept} (latest)`,
    '',
    `*Topic radar:*`,
    `  Deleted: ${r.radar.deleted} files (~${r.radar.freedKB} KB)`,
    `  Kept: ${r.radar.kept} (latest)`,
    '',
    `*Script JSONs:*`,
    `  Deleted: ${r.scripts.deleted} files (~${r.scripts.freedKB} KB)`,
    `  Kept: ${r.scripts.kept} (latest)`,
    '',
    `*Total freed: ~${r.totalFreedMB} MB*`,
  ].join('\n');
}

// CLI mode
if (require.main === module) {
  const result = run();
  console.log(formatCleanupResult(result));
}
