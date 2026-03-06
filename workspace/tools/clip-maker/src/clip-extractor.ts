/**
 * clip-extractor.ts
 * Uses fluent-ffmpeg + ffmpeg-static to extract a 9:16 vertical clip.
 * Output: 1080x1920 H.264 MP4 — TikTok / Reels / Shorts ready.
 */

import ffmpegStatic from 'ffmpeg-static';
import Ffmpeg from 'fluent-ffmpeg';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

Ffmpeg.setFfmpegPath(ffmpegStatic!);

export interface ClipOptions {
  startSeconds?: number;   // default: 10 (skip intros/title cards)
  durationSeconds: number; // from brief.duration_seconds
  width?: number;          // default: 1080
  height?: number;         // default: 1920
}

/**
 * Extracts a vertical TikTok-ready clip from inputPath → outputPath.
 * Crops landscape 16:9 → portrait 9:16 (center crop), or pads if source is narrower.
 */
export async function extractClip(
  inputPath: string,
  outputPath: string,
  opts: ClipOptions
): Promise<void> {
  const start = opts.startSeconds ?? 10;
  const duration = opts.durationSeconds;
  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;

  await mkdir(dirname(outputPath), { recursive: true });

  // Probe source dimensions to decide crop vs pad
  const probe = await probeVideo(inputPath);
  const srcW = probe.width ?? 1920;
  const srcH = probe.height ?? 1080;
  const srcAspect = srcW / srcH;
  const targetAspect = W / H; // 9/16 = 0.5625

  // If source is wider than 9:16 → center-crop width
  // If source is narrower (portrait or near-square) → pad with black
  const vf = srcAspect > targetAspect
    ? `crop=ih*${W}/${H}:ih:(iw-ih*${W}/${H})/2:0,scale=${W}:${H}`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`;

  return new Promise((resolve, reject) => {
    Ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(duration)
      .videoFilter(vf)
      .videoCodec('libx264')
      .addOption('-crf', '23')
      .addOption('-preset', 'fast')
      .addOption('-profile:v', 'baseline')
      .addOption('-level', '3.1')
      .audioCodec('aac')
      .audioBitrate('128k')
      .outputOptions('-movflags', '+faststart')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`ffmpeg error: ${err.message}`)))
      .run();
  });
}

/** Probe video dimensions using ffprobe (bundled with ffmpeg-static). */
function probeVideo(inputPath: string): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    Ffmpeg.ffprobe(inputPath, (err, meta) => {
      if (err) { resolve({}); return; }
      const vs = meta.streams?.find(s => s.codec_type === 'video');
      resolve({ width: vs?.width, height: vs?.height });
    });
  });
}
