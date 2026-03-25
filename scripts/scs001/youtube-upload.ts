#!/usr/bin/env npx ts-node --transpile-only
/**
 * youtube-upload.ts — Sprint 1297
 * SCS-001 YouTube Shorts upload CLI
 *
 * Takes a video path, checks aspect ratio (from metadata.json or ffprobe),
 * derives title from caption/scene names, and uploads via YouTube Data API v3.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/scs001/youtube-upload.ts <video.mp4> [title]
 *   YOUTUBE_DRY_RUN=1 npx ts-node --transpile-only scripts/scs001/youtube-upload.ts <video.mp4>
 *
 * On success, prints the YouTube video ID to stdout.
 * Returns exit code 0 on success, 1 on failure.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

import { uploadShort, checkUploadReadiness } from './youtube-shorts';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read metadata.json in the same directory as the video, if present.
 * Returns null if not found or not parseable.
 */
function readVideoMetadata(videoPath: string): Record<string, any> | null {
  const metaPath = join(dirname(videoPath), 'metadata.json');
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Derive a Short title from video metadata or filename.
 * Priority: first Hook scene name → video_id → sanitised filename.
 */
function deriveTitleFromMetadata(videoPath: string, meta: Record<string, any> | null): string {
  // Try to extract Hook scene title from segment filenames if sibling dir exists
  if (meta) {
    const segDir = join(dirname(videoPath), 'segments');
    if (existsSync(segDir)) {
      try {
        const { readdirSync } = require('fs');
        const files = (readdirSync(segDir) as string[]).sort();
        if (files.length > 0) {
          // First segment usually contains the Hook
          const first = files[0];
          // e.g. "scene_0_The Hook — You've Been Doing It Wrong.mp4"
          const sceneTitle = first
            .replace(/^scene_\d+_/, '')
            .replace(extname(first), '')
            .replace(/[–—]/g, '-')
            .trim();
          if (sceneTitle.length > 4) return sceneTitle.slice(0, 100);
        }
      } catch { /* ignore */ }
    }
    if (meta.video_id) return `AI Short ${meta.video_id}`;
  }

  // Fallback: sanitise filename
  return basename(videoPath, extname(videoPath))
    .replace(/[-_]/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, 100) || 'AI Short';
}

/**
 * Check aspect ratio.
 * Uses metadata.json first, then ffprobe if available, then warns and continues.
 */
function checkAspectRatio(videoPath: string, meta: Record<string, any> | null): {
  ok: boolean; ratio: string; warning?: string
} {
  // From metadata
  if (meta?.aspect_ratio) {
    const r = meta.aspect_ratio as string;
    if (r === '9:16') return { ok: true, ratio: r };
    return { ok: false, ratio: r, warning: `Aspect ratio is ${r}, not 9:16. Video may not qualify as a Short.` };
  }

  // Try ffprobe
  try {
    const out = execSync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf-8', timeout: 8000 }
    ).trim();
    const [w, h] = out.split(',').map(Number);
    if (w && h) {
      const ratio = w < h ? '9:16' : `${w}:${h}`;
      const isVertical = h > w;
      return {
        ok: isVertical,
        ratio,
        warning: isVertical ? undefined : `Video is ${w}x${h} (not vertical). Shorts require 9:16.`,
      };
    }
  } catch { /* ffprobe not available */ }

  // Cannot determine — warn and proceed
  return { ok: true, ratio: 'unknown', warning: 'Could not verify aspect ratio (no metadata.json or ffprobe).' };
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const videoPath = process.argv[2];
  const titleOverride = process.argv[3];

  if (!videoPath) {
    console.error('Usage: youtube-upload.ts <video.mp4> [title]');
    process.exit(1);
  }

  const absPath = videoPath.startsWith('/') ? videoPath : join(process.cwd(), videoPath);

  if (!existsSync(absPath)) {
    console.error(`❌ Video not found: ${absPath}`);
    process.exit(1);
  }

  // ── Readiness check ──────────────────────────────────────────────────────
  const readiness = checkUploadReadiness();
  if (!readiness.can_upload && process.env.YOUTUBE_DRY_RUN !== '1') {
    console.error('❌ YouTube upload not configured:');
    for (const issue of readiness.issues) console.error(`   • ${issue}`);
    process.exit(1);
  }

  // ── Metadata + title ─────────────────────────────────────────────────────
  const meta = readVideoMetadata(absPath);
  const title = titleOverride ?? deriveTitleFromMetadata(absPath, meta);

  // ── Aspect ratio check ───────────────────────────────────────────────────
  const { ok: ratioOk, ratio, warning: ratioWarning } = checkAspectRatio(absPath, meta);
  if (ratioWarning) console.warn(`⚠️  ${ratioWarning}`);
  if (!ratioOk) {
    console.error('❌ Aborting: video aspect ratio is not suitable for Shorts.');
    process.exit(1);
  }

  console.log(`📤 Uploading: ${basename(absPath)}`);
  console.log(`   Title: ${title}`);
  console.log(`   Aspect ratio: ${ratio}`);
  if (process.env.YOUTUBE_DRY_RUN === '1') console.log('   Mode: DRY RUN');

  // ── Upload ───────────────────────────────────────────────────────────────
  const result = await uploadShort({
    videoPath: absPath,
    title,
    description: `${title}\n\n#Shorts #AI #Tech`,
    tags: ['shorts', 'ai', 'tech', 'viral'],
  });

  if (result.success) {
    console.log(`✅ Uploaded: ${result.url}`);
    console.log(`   Video ID: ${result.video_id}`);
    console.log(`   Time: ${result.upload_time_ms}ms`);
    // Print just the video ID on its own line for scripting
    process.stdout.write(result.video_id + '\n');
    process.exit(0);
  } else {
    console.error(`❌ Upload failed: ${result.error}`);
    process.exit(1);
  }
})();
