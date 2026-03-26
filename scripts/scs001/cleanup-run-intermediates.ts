/**
 * cleanup-run-intermediates.ts — Sprint 1472
 *
 * Frees disk space by deleting intermediate files from completed run directories.
 * workspace/scs001/ was at 10.5GB (threshold 5GB) — intermediates serve no purpose
 * after the final video is produced and written to the publish ledger.
 *
 * Vlog runs: keeps vlog-{id}.mp4 + meta.json, deletes everything else
 * Multiformat runs: keeps output/*_final_av.mp4 + run-report.json,
 *                   deletes tts/, output/*_frames/, output/*_sub*.mp4,
 *                   output/*_base.mp4, output/*_video_only.mp4, output/*.srt
 *
 * Usage:
 *   npx ts-node scripts/scs001/cleanup-run-intermediates.ts --dry-run
 *   npx ts-node scripts/scs001/cleanup-run-intermediates.ts
 */

import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync, rmSync } from 'fs';
import { join, basename, extname } from 'path';

const ROOT = join(__dirname, '..', '..');
const VLOG_DIR = join(ROOT, 'workspace', 'scs001', 'vlog-runs');
const MF_DIR   = join(ROOT, 'workspace', 'scs001', 'multiformat-runs');

// Intermediates to delete from vlog run dirs (keep final video + meta.json)
const VLOG_INTERMEDIATES = [
  'avatar.mp4',
  'avatar_branded.mp4',
  'composited.mp4',
  'subtitled.mp4',
  'script.json',
];

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
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)}MB`;
  return `${(bytes / 1e3).toFixed(0)}KB`;
}

function deleteFile(p: string, dryRun: boolean): number {
  if (!existsSync(p)) return 0;
  const size = statSync(p).size;
  if (!dryRun) unlinkSync(p);
  return size;
}

function deleteDir(p: string, dryRun: boolean): number {
  if (!existsSync(p)) return 0;
  const size = getDirSize(p);
  if (!dryRun) rmSync(p, { recursive: true, force: true });
  return size;
}

function cleanVlogRun(runDir: string, dryRun: boolean): number {
  const runId = basename(runDir);
  // Must have a final video to be safe to clean
  const finalVideo = join(runDir, `${runId}.mp4`);
  if (!existsSync(finalVideo)) {
    return 0; // Not complete — skip
  }

  let freed = 0;
  for (const name of VLOG_INTERMEDIATES) {
    const p = join(runDir, name);
    freed += deleteFile(p, dryRun);
  }
  // Delete broll/ directory
  freed += deleteDir(join(runDir, 'broll'), dryRun);

  return freed;
}

function cleanMultiformatRun(runDir: string, dryRun: boolean): number {
  const reportFile = join(runDir, 'run-report.json');
  if (!existsSync(reportFile)) return 0;

  // Check run is complete (has completed_at)
  try {
    const report = JSON.parse(require('fs').readFileSync(reportFile, 'utf-8'));
    if (!report.completed_at) return 0;
  } catch { return 0; }

  let freed = 0;

  // Delete tts/ directory entirely (audio files no longer needed post-composite)
  freed += deleteDir(join(runDir, 'tts'), dryRun);

  // Clean output/ — delete intermediates, keep *_final_av.mp4
  const outputDir = join(runDir, 'output');
  if (!existsSync(outputDir)) return freed;

  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    const p = join(outputDir, entry.name);
    if (entry.isDirectory()) {
      // Delete _frames/ directories
      if (entry.name.endsWith('_frames')) {
        freed += deleteDir(p, dryRun);
      }
    } else {
      // Keep *_final_av.mp4 — delete everything else
      if (entry.name.endsWith('_final_av.mp4')) continue;
      freed += deleteFile(p, dryRun);
    }
  }

  return freed;
}

export function cleanupRunIntermediates(runId: string, dryRun = false): number {
  // Determine run type from ID prefix
  let runDir: string;
  if (runId.startsWith('vlog-')) {
    runDir = join(VLOG_DIR, runId);
    if (!existsSync(runDir)) return 0;
    return cleanVlogRun(runDir, dryRun);
  } else if (runId.startsWith('mf-')) {
    runDir = join(MF_DIR, runId);
    if (!existsSync(runDir)) return 0;
    return cleanMultiformatRun(runDir, dryRun);
  }
  return 0;
}

// CLI: run cleanup on all existing runs
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[cleanup-run-intermediates] ${dryRun ? 'DRY RUN — ' : ''}scanning run directories...`);

  let totalFreed = 0;
  let cleaned = 0;
  let skipped = 0;

  // Vlog runs
  if (existsSync(VLOG_DIR)) {
    for (const entry of readdirSync(VLOG_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('vlog-')) continue;
      const freed = cleanVlogRun(join(VLOG_DIR, entry.name), dryRun);
      if (freed > 0) {
        console.log(`  [vlog] ${entry.name}: freed ${formatBytes(freed)}`);
        totalFreed += freed;
        cleaned++;
      } else {
        skipped++;
      }
    }
  }

  // Multiformat runs
  if (existsSync(MF_DIR)) {
    for (const entry of readdirSync(MF_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('mf-')) continue;
      const freed = cleanMultiformatRun(join(MF_DIR, entry.name), dryRun);
      if (freed > 0) {
        console.log(`  [mf] ${entry.name}: freed ${formatBytes(freed)}`);
        totalFreed += freed;
        cleaned++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`\n[cleanup-run-intermediates] ${dryRun ? 'Would free' : 'Freed'} ${formatBytes(totalFreed)} across ${cleaned} runs (${skipped} skipped — incomplete or already clean)`);
  if (dryRun) console.log('[cleanup-run-intermediates] Run without --dry-run to apply changes');
}
