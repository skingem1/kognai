/**
 * kling-animator.ts
 * Sprint-062: Animate a static painting/map image into a short video.
 *
 * Primary:   Kling v1.6 standard via fal.ai  (~$0.029/sec, 10s = ~$0.29)
 * Fallback:  minimax/hailuo-02 via fal.ai    (~$0.012/sec)
 * Zero-cost: Ken Burns zoompan via ffmpeg-static (no system ffmpeg needed)
 *
 * Set FAL_KEY in ~/kognai/.env to enable AI animation.
 * Without FAL_KEY the runner automatically falls back to Ken Burns.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

export type AnimatorModel = 'kling' | 'hailuo' | 'ken-burns';

export interface AnimateResult {
  videoPath: string;      // local absolute path to the downloaded .mp4
  model: AnimatorModel;
  durationSeconds: number;
  costUsd: number;
}

/**
 * Animate a painting/map image to a vertical (9:16) video.
 *
 * @param imageUrl    Public URL of the source image (JPEG/PNG)
 * @param outputPath  Where to save the resulting .mp4
 * @param motionPrompt  Short description of desired camera motion (for AI models)
 */
export async function animateImage(
  imageUrl: string,
  outputPath: string,
  motionPrompt = 'slow cinematic camera drift revealing intricate details',
): Promise<AnimateResult> {
  const falKey = process.env.FAL_KEY;

  if (!falKey) {
    console.log('  ⚠️  FAL_KEY not set — falling back to Ken Burns (ffmpeg-static)');
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
  console.log('  ⚠️  All AI animators failed — falling back to Ken Burns (ffmpeg-static)');
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
  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: falKey });

  const modelId = model === 'kling'
    ? 'fal-ai/kling-video/v1.6/standard/image-to-video'
    : 'fal-ai/minimax/hailuo-02/standard/image-to-video';

  const durationSeconds = 10;

  // Upload image to fal.ai storage for a clean CDN URL.
  // Wikimedia URLs often have special chars or CDN restrictions that cause
  // ValidationError when passed directly to Kling/Hailuo.
  console.log(`  ☁️  Uploading image to fal.ai storage…`);
  const imgRes = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Kognai/1.0 (history-maker; kognai-bot)' },
  });
  if (!imgRes.ok) throw new Error(`Image fetch failed ${imgRes.status}`);
  const imgBlob = await imgRes.blob();
  const falImageUrl = await fal.storage.upload(imgBlob);

  console.log(`  🤖 Animating with ${model} (${durationSeconds}s)…`);

  const result = await fal.subscribe(modelId, {
    input: {
      image_url:    falImageUrl,
      prompt:       motionPrompt,
      duration:     model === 'kling' ? '10' : 6,
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
  }) as { data?: { video?: { url?: string } } };

  process.stdout.write('\n');

  const videoUrl = result.data?.video?.url;
  if (!videoUrl) throw new Error(`${model} returned no video URL`);

  await downloadFile(videoUrl, outputPath);

  const costUsd = model === 'kling'
    ? durationSeconds * 0.029
    : durationSeconds * 0.012;

  return { videoPath: outputPath, model, durationSeconds, costUsd };
}

// ── Ken Burns ffmpeg-static fallback ─────────────────────────────────────────

/**
 * Download the image locally and apply a slow zoom-pan (Ken Burns effect).
 * Outputs a 1080×1920 (9:16) vertical video — TikTok-native resolution.
 * Uses ffmpeg-static (bundled binary — no system ffmpeg required).
 */
async function kenBurnsFallback(
  imageUrl: string,
  outputPath: string,
): Promise<AnimateResult> {
  const durationSeconds = 10;
  const fps = 25;
  const totalFrames = durationSeconds * fps; // 250

  const tmpImg = `${outputPath}.src.jpg`;
  await downloadFile(imageUrl, tmpImg);

  // zoompan: zoom 1.0 → 1.4 over totalFrames, drifting toward center.
  // No shell-style single-quote escaping — execFileAsync passes args directly to ffmpeg.
  // Commas in math expressions are fine inside ffmpeg's expression evaluator.
  const zoompan = `zoompan=z=min(zoom+0.0016\\,1.4):x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):d=${totalFrames}:s=1080x1920:fps=${fps}`;

  await execFileAsync(ffmpegStatic!, [
    '-loop', '1',
    '-i',    tmpImg,
    '-vf',   zoompan,
    '-t',    String(durationSeconds),
    '-c:v',  'libx264',
    '-crf',  '22',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-y',    outputPath,
  ]);

  try { unlinkSync(tmpImg); } catch { /* ignore */ }

  return { videoPath: outputPath, model: 'ken-burns', durationSeconds, costUsd: 0 };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Download a URL to a local file with retry on 429 (Wikimedia rate limit).
 * Skips if the file already exists (cache).
 */
async function downloadFile(url: string, dest: string, retries = 4): Promise<void> {
  if (existsSync(dest)) return;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Kognai/1.0 (history-maker; kognai-bot)' },
    });
    if (res.status === 429) {
      const wait = 2500 * attempt;
      console.log(`\n  ⏳ Wikimedia rate limit (429) — waiting ${wait / 1000}s…`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
    if (!res.body) throw new Error('No response body');
    const writer = createWriteStream(dest);
    await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), writer);
    return;
  }
  throw new Error(`Download failed after ${retries} retries (rate limited): ${url}`);
}
