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
  codeDemoRuns: { deleted: number; kept: number; freedMB: number };         // Sprint 1218
  vlogRuns: { deleted: number; kept: number; freedMB: number };             // Sprint 1218
  entertainmentRuns: { deleted: number; kept: number; freedMB: number };   // Sprint 1224
  legacyRuns: { deleted: number; kept: number; freedMB: number };          // Sprint 1435
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

// Sprint 826: Build set of run IDs that contain ready-to-post videos
function getProtectedRunIds(): Set<string> {
  const protected_ = new Set<string>();

  // Read publish ledger for run_id mappings
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const manualPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

  // Get posted video IDs
  const postedIds = new Set<string>();
  if (fs.existsSync(manualPath)) {
    for (const line of fs.readFileSync(manualPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e.video_id) postedIds.add(e.video_id); } catch {}
    }
  }

  // Protect runs that have unposted videos with existing files
  if (fs.existsSync(ledgerPath)) {
    for (const line of fs.readFileSync(ledgerPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.run_id && e.video_id && !postedIds.has(e.video_id)) {
          // Check if the video file still exists
          const videoPath = e.video_path || e.file_path;
          if (videoPath && fs.existsSync(videoPath)) {
            protected_.add(e.run_id);
          }
        }
      } catch {}
    }
  }

  return protected_;
}

function cleanDirProtected(
  parentDir: string,
  prefix: string,
  keepCount: number,
  isDir: boolean,
  protectedNames?: Set<string>
): { deleted: number; kept: number; freedBytes: number } {
  if (!fs.existsSync(parentDir)) return { deleted: 0, kept: 0, freedBytes: 0 };

  const entries = fs.readdirSync(parentDir)
    .filter(name => name.startsWith(prefix))
    .map(name => {
      const full = path.join(parentDir, name);
      try {
        const stat = fs.statSync(full);
        return { name, full, mtime: stat.mtimeMs, isDir: stat.isDirectory() };
      } catch { return null; }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null && e.isDir === isDir)
    .sort((a, b) => b.mtime - a.mtime);

  // Protected entries are never deleted (they contain ready-to-post videos)
  const protectedEntries = protectedNames
    ? entries.filter(e => protectedNames.has(e.name))
    : [];
  const unprotected = protectedNames
    ? entries.filter(e => !protectedNames.has(e.name))
    : entries;

  // From unprotected, keep latest keepCount
  const keepUnprotected = unprotected.slice(0, Math.max(0, keepCount - protectedEntries.length));
  const remove = unprotected.slice(Math.max(0, keepCount - protectedEntries.length));

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

  return { deleted: remove.length, kept: protectedEntries.length + keepUnprotected.length, freedBytes };
}

function run(): CleanupResult {
  const mfDir = path.join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
  const radarDir = path.join(ROOT, 'workspace', 'scs001', 'topic-radar');
  const scriptsDir = path.join(ROOT, 'workspace', 'scs001', 'scripts');
  const codeDemoDir = path.join(ROOT, 'workspace', 'scs001', 'code-demo-runs');       // Sprint 1218
  const vlogDir = path.join(ROOT, 'workspace', 'scs001', 'vlog-runs');               // Sprint 1218
  const entertainmentDir = path.join(ROOT, 'workspace', 'scs001', 'entertainment-runs'); // Sprint 1224

  // Sprint 826: Protect run dirs that contain ready-to-post videos
  const protectedRuns = getProtectedRunIds();
  const mf = cleanDirProtected(mfDir, 'mf-', 30, true, protectedRuns);

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

  // Sprint 1218: code-demo-runs (demo-*) — keep latest 20
  const codeDemo = cleanDir(codeDemoDir, 'demo-', 20, true);

  // Sprint 1218: vlog-runs (vlog-*) — keep latest 30
  const vlog = cleanDir(vlogDir, 'vlog-', 30, true);

  // Sprint 1224: entertainment-runs (ent-*) — keep latest 20
  const entertainment = cleanDir(entertainmentDir, 'ent-', 20, true);

  // Sprint 1435: Legacy pipeline run-* dirs — keep latest 2, delete the rest
  const scsDir = path.join(ROOT, 'workspace', 'scs001');
  const legacyRunDirs = fs.existsSync(scsDir)
    ? fs.readdirSync(scsDir)
        .filter(name => /^run-\d+$/.test(name))
        .map(name => {
          const full = path.join(scsDir, name);
          try { return { name, full, mtime: fs.statSync(full).mtimeMs }; } catch { return null; }
        })
        .filter((e): e is { name: string; full: string; mtime: number } => e !== null)
        .sort((a, b) => b.mtime - a.mtime)
    : [];
  const legacyRemove = legacyRunDirs.slice(2);
  let legacyFreedBytes = 0;
  for (const entry of legacyRemove) {
    legacyFreedBytes += dirSizeMB(entry.full) * 1024 * 1024;
    if (!DRY_RUN) rmRecursive(entry.full);
  }
  const legacy = {
    deleted: legacyRemove.length,
    kept: legacyRunDirs.length - legacyRemove.length,
    freedBytes: legacyFreedBytes,
  };

  const totalFreedMB = (mf.freedBytes + radar.freedBytes + scriptResult.freedBytes + codeDemo.freedBytes + vlog.freedBytes + entertainment.freedBytes + legacy.freedBytes) / (1024 * 1024);

  return {
    multiformat: { deleted: mf.deleted, kept: mf.kept, freedMB: Math.round(mf.freedBytes / (1024 * 1024)) },
    radar: { deleted: radar.deleted, kept: radar.kept, freedKB: Math.round(radar.freedBytes / 1024) },
    scripts: { deleted: scriptResult.deleted, kept: scriptResult.kept, freedKB: Math.round(scriptResult.freedBytes / 1024) },
    codeDemoRuns: { deleted: codeDemo.deleted, kept: codeDemo.kept, freedMB: Math.round(codeDemo.freedBytes / (1024 * 1024)) },
    vlogRuns: { deleted: vlog.deleted, kept: vlog.kept, freedMB: Math.round(vlog.freedBytes / (1024 * 1024)) },
    entertainmentRuns: { deleted: entertainment.deleted, kept: entertainment.kept, freedMB: Math.round(entertainment.freedBytes / (1024 * 1024)) },
    legacyRuns: { deleted: legacy.deleted, kept: legacy.kept, freedMB: Math.round(legacy.freedBytes / (1024 * 1024)) },
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
    `*Code Demo runs:*`,
    `  Deleted: ${r.codeDemoRuns.deleted} dirs (~${r.codeDemoRuns.freedMB} MB)`,
    `  Kept: ${r.codeDemoRuns.kept} (latest)`,
    '',
    `*Vlog runs:*`,
    `  Deleted: ${r.vlogRuns.deleted} dirs (~${r.vlogRuns.freedMB} MB)`,
    `  Kept: ${r.vlogRuns.kept} (latest)`,
    '',
    `*Entertainment runs:*`,
    `  Deleted: ${r.entertainmentRuns.deleted} dirs (~${r.entertainmentRuns.freedMB} MB)`,
    `  Kept: ${r.entertainmentRuns.kept} (latest)`,
    '',
    `*Legacy pipeline runs (run-*):*`,
    `  Deleted: ${r.legacyRuns.deleted} dirs (~${r.legacyRuns.freedMB} MB)`,
    `  Kept: ${r.legacyRuns.kept} (latest)`,
    '',
    `*Total freed: ~${r.totalFreedMB} MB*`,
  ].join('\n');
}

// CLI mode
if (require.main === module) {
  const result = run();
  console.log(formatCleanupResult(result));
}
