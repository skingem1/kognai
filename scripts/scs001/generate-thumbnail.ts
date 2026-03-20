/**
 * Sprint 468: Thumbnail generator for YouTube Shorts
 *
 * Extracts a frame from the captioned video at ~3s (hook moment),
 * adds bold text overlay (hook text from experiment data),
 * saves as JPG thumbnail.
 *
 * Usage: npx ts-node scripts/scs001/generate-thumbnail.ts <video_id>
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');

function findCaptionedMp4(videoId: string): string | null {
  const scsDir = path.join(ROOT, 'workspace', 'scs001');
  try {
    const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = path.join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

function getExperimentHook(videoId: string): { hook: string; topic: string } {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  const result = { hook: '', topic: '' };
  if (!fs.existsSync(expPath)) return result;
  try {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id === videoId) {
          if (e.hook_formula) result.hook = e.hook_formula;
          if (e.topic) result.topic = e.topic;
        }
      } catch {}
    }
  } catch {}
  return result;
}

export function generateThumbnail(videoId: string): string | null {
  const mp4Path = findCaptionedMp4(videoId);
  if (!mp4Path) {
    console.error(`[Thumbnail] No captioned mp4 found for ${videoId}`);
    return null;
  }

  const thumbDir = path.join(ROOT, 'workspace', 'scs001', 'thumbnails');
  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
  const outputPath = path.join(thumbDir, `${videoId}.jpg`);

  const { hook, topic } = getExperimentHook(videoId);

  // Extract frame at 3 seconds (hook moment for Shorts)
  // Use color overlay with text since libfreetype may not be available
  const overlayText = (hook || topic || 'Watch Now').slice(0, 40).replace(/'/g, "'\\''");

  try {
    // Step 1: Extract frame at 3s
    const framePath = path.join(thumbDir, `${videoId}-frame.jpg`);
    execSync(
      `ffmpeg -y -ss 3 -i "${mp4Path}" -vframes 1 -q:v 2 "${framePath}"`,
      { timeout: 15000, stdio: 'pipe' }
    );

    if (!fs.existsSync(framePath)) {
      console.error(`[Thumbnail] Frame extraction failed for ${videoId}`);
      return null;
    }

    // Step 2: Add text overlay using drawtext (color block background)
    // Use a semi-transparent black bar at bottom with white text
    try {
      execSync(
        `ffmpeg -y -i "${framePath}" -vf "` +
        `drawbox=x=0:y=ih-120:w=iw:h=120:color=black@0.7:t=fill,` +
        `drawtext=text='${overlayText}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=h-90:borderw=2:bordercolor=black" ` +
        `-q:v 2 "${outputPath}"`,
        { timeout: 15000, stdio: 'pipe' }
      );
    } catch {
      // Fallback: just use the raw frame without text overlay
      fs.copyFileSync(framePath, outputPath);
    }

    // Clean up temp frame
    try { fs.unlinkSync(framePath); } catch {}

    if (fs.existsSync(outputPath)) {
      const size = fs.statSync(outputPath).size;
      console.log(`[Thumbnail] Generated: ${outputPath} (${Math.round(size / 1024)}KB)`);
      return outputPath;
    }
  } catch (err: any) {
    console.error(`[Thumbnail] Error: ${err.message}`);
  }

  return null;
}

// CLI entry point
if (require.main === module) {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error('Usage: npx ts-node scripts/scs001/generate-thumbnail.ts <video_id>');
    process.exit(1);
  }
  const result = generateThumbnail(videoId);
  if (result) {
    console.log(`Thumbnail: ${result}`);
  } else {
    console.error('Failed to generate thumbnail');
    process.exit(1);
  }
}
