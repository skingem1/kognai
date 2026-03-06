/**
 * kling-animator.ts
 * Sprint-062: Animate a static painting/map image into a short video.
 *
 * Primary:  Kling v1.6 standard via fal.ai  (~$0.029/sec, 10s = ~$0.29)
 * Fallback: minimax/hailuo-02 via fal.ai    (~$0.06/5s or $0.12/10s)
 * Zero-cost: Ken Burns zoompan via ffmpeg   (requires ffmpeg on PATH)
 *
 * Set FAL_KEY in ~/kognai/.env to enable AI animation.
 * Without FAL_KEY the runner automatically falls back to Ken Burns.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, existsSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const execFileAsync = promisify(execFile);

export type AnimatorModel = 'kling' | 'hailuo' | 'ken-burns';

export interface AnimateResult {
  videoPath: string;    // local absolute path to the downloaded .mp4
  model: AnimatorModel;
  durationSeconds: number;
  costUsd: number;
}

/**
 * Animate a painting/map image to a vertical (9:16) video.
 *
 * @param imageUrl   Public URL of the source image (JPEG/PNG)
 * @param outputPath Where to save the resulting .mp4
 * @param motionPrompt  Optional short description of desired camera motion
 */
export async function animateImage(
  imageUrl: string,
  outputPath: string,
  motionPrompt = 'slow cinematic camera drift revealing intricate details',
): Promise<AnimateResult> {
  const falKey = process.env.FAL_KEY;

  if (!falKey) {
    console.log('  ⚠️  FAL_KEY not set — falling back to Ken Burns (ffmpeg)');
    return kenBurnsFallback(imageUrl, outputPath);
  }

  // Try Kling first, then Hailuo on error
  for (const model of ['kling', 'hailuo'] as const) {
    try {
      return await falAnimate(imageUrl, outputPath, motionPrompt, model, falKey);
    } catch (err) {
      console.warn(`  ⚠️  ${model} failed: ${String(err).slice(0, 80)} — trying next`);
    }
  }

  // All AI models failed — Ken Burns fallback
  console.log('  ⚠️  All AI animators failed — falling back to Ken Burns (ffmpeg)');
  return kenBurnsFallback(imageUrl, outputPath);
}

// ── fal.ai AI animation ─────────────────────────────────────────────────────

async function falAnimate(
  imageUrl: string,
  outputPath: string,
  motionPrompt: string,
  model: 'kling' | 'hailuo',
  falKey: string,
): Promise<AnimateResult> {
  // Dynamic import to avoid hard dependency when FAL_KEY is absent
  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: falKey });

  const modelId = model === 'kling'
    ? 'fal-ai/kling-video/v1.6/standard/image-to-video'
    : 'fal-ai/minimax/hailuo-02/standard/image-to-video';

  const durationSeconds = 10;

  console.log(`  🤖 Animating with ${model} (${durationSeconds}s)…`);

  const result = await fal.subscribe(modelId, {
    input: {
      image_url:    imageUrl,
      prompt:       motionPrompt,
      duration:     model === 'kling' ? '10' : 6, // Kling: string enum; Hailuo: number
      aspect_ratio: '9:16',
    },
    logs: false,
    onQueueUpdate: (update: { status: string; queue_position?: number }) => {
      if (update.status === 'IN_QUEUE') {
        process.stdout.write(`\r  ⏳ ${model} queue position: ${update.queue_position ?? '?'}   `);
      } else if (update.status === 'IN_PROGRESS') {
        process.stdout.write(`\r  ⚙️  ${model} generating…                        `);
      }
    },
  // v1.x wraps output in { data: T, requestId: string }
  }) as { data?: { video?: { url?: string } } };

  process.stdout.write('\n');

  const videoUrl = result.data?.video?.url;
  if (!videoUrl) throw new Error(`${model} returned no video URL`);

  // Download video to local path
  await downloadFile(videoUrl, outputPath);

  // Cost estimate: Kling $0.029/s, Hailuo ~$0.012/s (varies by plan)
  const costUsd = model === 'kling'
    ? durationSeconds * 0.029
    : durationSeconds * 0.012;

  return { videoPath: outputPath, model, durationSeconds, costUsd };
}

// ── Ken Burns ffmpeg fallback ───────────────────────────────────────────────

/**
 * Download the image locally and apply a slow zoom-pan (Ken Burns effect).
 * Outputs a 1080×1920 (9:16) vertical video — TikTok-native resolution.
 *
 * Uses ffmpeg from PATH (brew install ffmpeg, or any system install).
 * The zoompan filter gradually zooms in (1.0→1.4) while drifting across the image.
 */
async function kenBurnsFallback(
  imageUrl: string,
  outputPath: string,
): Promise<AnimateResult> {
  const durationSeconds = 10;
  const fps = 25;
  const totalFrames = durationSeconds * fps; // 250

  // Download the source image to a temp file
  const tmpImg = outputPath.replace(/\.mp4$/, '_src.jpg');
  await downloadFile(imageUrl, tmpImg);

  // zoompan: zoom from 1.0 → 1.4 over `d` frames, panning toward center
  // s=1080x1920 forces TikTok vertical output
  const zoompan = [
    `zoompan`,
    `z='min(zoom+0.0016,1.4)'`,
    `x='iw/2-(iw/zoom/2)'`,
    `y='ih/2-(ih/zoom/2)'`,
    `d=${totalFrames}`,
    `s=1080x1920`,
    `fps=${fps}`,
  ].join(':');

  await execFileAsync('ffmpeg', [
    '-loop', '1',
    '-i',   tmpImg,
    '-vf',  zoompan,
    '-t',   String(durationSeconds),
    '-c:v', 'libx264',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-y',   outputPath,
  ]);

  // Clean up temp image
  try { await execFileAsync('rm', [tmpImg]); } catch { /* ignore */ }

  return { videoPath: outputPath, model: 'ken-burns', durationSeconds, costUsd: 0 };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function downloadFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  if (!res.body) throw new Error('No response body');
  const writer = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), writer);
}
