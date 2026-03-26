/**
 * cleanup-pipeline-runs.ts — Sprint 1476
 *
 * Frees disk space by deleting intermediate subdirectories from the 15-stage
 * pipeline's run-TIMESTAMP output directories.
 *
 * Each run-TIMESTAMP dir contains:
 *   editing/         — raw edited videos (~600MB per run) — DELETABLE
 *   mixed-output/    — voiceover-mixed videos (~640MB per run) — DELETABLE
 *   voiceover-audio/ — raw TTS audio files (~9MB per run) — DELETABLE
 *   caption/         — captioned (publishable) videos — KEEP
 *
 * This script deletes editing/, mixed-output/, voiceover-audio/ subdirs,
 * keeping caption/ intact as these are the publishable outputs.
 *
 * Usage:
 *   npx ts-node scripts/scs001/cleanup-pipeline-runs.ts --dry-run
 *   npx ts-node scripts/scs001/cleanup-pipeline-runs.ts
 *
 * Freed per run: ~1.2GB. Total for 6 runs: ~7.2GB.
 * Sprint 1476
 */

import { existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const SCS001_DIR = join(ROOT, 'workspace', 'scs001');

// Subdirectories to delete (intermediates — no longer needed after captioning)
const DELETABLE_SUBDIRS = ['editing', 'mixed-output', 'voiceover-audio'];

// Subdirectories to preserve
const KEEP_SUBDIRS = ['caption'];

function getDirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(p);
    } else {
      try { total += statSync(p).size; } catch { /* ignore */ }
    }
  }
  return total;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)}GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)}MB`;
  return `${(bytes / 1e3).toFixed(0)}KB`;
}

function cleanPipelineRun(runDir: string, dryRun: boolean): number {
  let freed = 0;

  for (const subdir of DELETABLE_SUBDIRS) {
    const p = join(runDir, subdir);
    if (!existsSync(p)) continue;
    const size = getDirSize(p);
    if (!dryRun) {
      rmSync(p, { recursive: true, force: true });
    }
    freed += size;
  }

  return freed;
}

// CLI
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[cleanup-pipeline-runs] ${dryRun ? 'DRY RUN — ' : ''}scanning workspace/scs001/run-* directories...`);

  if (!existsSync(SCS001_DIR)) {
    console.error(`[cleanup-pipeline-runs] SCS001_DIR not found: ${SCS001_DIR}`);
    process.exit(1);
  }

  let totalFreed = 0;
  let cleaned = 0;
  let skipped = 0;

  for (const entry of readdirSync(SCS001_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('run-')) continue;

    const runDir = join(SCS001_DIR, entry.name);

    // Verify caption/ exists (sanity check — don't clean runs that look incomplete)
    const captionDir = join(runDir, 'caption');
    if (!existsSync(captionDir)) {
      console.log(`  [skip] ${entry.name} — no caption/ dir (may be incomplete)`);
      skipped++;
      continue;
    }

    const freed = cleanPipelineRun(runDir, dryRun);
    if (freed > 0) {
      console.log(`  ${dryRun ? '[would free]' : '[freed]'} ${entry.name}: ${formatBytes(freed)}`);
      totalFreed += freed;
      cleaned++;
    } else {
      console.log(`  [skip] ${entry.name} — already clean or no intermediates found`);
      skipped++;
    }
  }

  console.log(`\n[cleanup-pipeline-runs] ${dryRun ? 'Would free' : 'Freed'} ${formatBytes(totalFreed)} across ${cleaned} run(s) (${skipped} skipped)`);
  if (dryRun) console.log('[cleanup-pipeline-runs] Run without --dry-run to apply changes');
}

export { cleanPipelineRun };
