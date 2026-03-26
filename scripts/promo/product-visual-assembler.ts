#!/usr/bin/env npx ts-node
/**
 * product-visual-assembler.ts — Sprint TICKET-008-PROMO-03
 *
 * Assembles a promotional video from ProductData + PromoScript using FFmpeg.
 * - Ken Burns effect via zoompan on product images
 * - Split-screen: 60% avatar placeholder left / 40% product image right (image beats)
 * - Full-width avatar for null-image beats (hook/problem/cta)
 * - Per-beat segments then xfade crossfade concat
 * - Output: 1080×1920 vertical MP4
 *
 * Usage:
 *   npx ts-node scripts/promo/product-visual-assembler.ts --job-id <id>
 *   npx ts-node scripts/promo/product-visual-assembler.ts --job-id <id> --dry-run
 *
 * Input:  workspace/promo-jobs/{jobId}/product.json
 *         workspace/promo-jobs/{jobId}/script.json
 * Output: workspace/promo-jobs/{jobId}/final.mp4
 *         workspace/promo-jobs/{jobId}/segments/ (per-beat MP4s)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';
import { createWriteStream } from 'fs';

const ROOT = join(__dirname, '..', '..');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');
const FFMPEG = 'ffmpeg';
const FFPROBE = 'ffprobe';
const FPS = 25;
const W = 1080;
const H = 1920;
const AVATAR_W = Math.round(W * 0.6);  // 648
const PRODUCT_W = W - AVATAR_W;         // 432
const XFADE_DUR = 0.3;
// Avatar placeholder color (dark charcoal — until real avatar video is wired in PROMO-05)
const AVATAR_COLOR = '0x1a1a2e';

interface Beat {
  beat: string;
  text: string;
  image_index: number | null;
  duration_s: number;
}

interface AssembleResult {
  ok: boolean;
  outputPath?: string;
  durationS?: number;
  segments?: string[];
  error?: string;
}

function downloadImage(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (existsSync(destPath)) { resolve(true); return; }
    const fn = url.startsWith('https') ? httpsGet : httpGet;
    const file = createWriteStream(destPath);
    fn(url, (res) => {
      if (res.statusCode !== 200) { file.close(); resolve(false); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
      file.on('error', () => { file.close(); resolve(false); });
    }).on('error', () => { file.close(); resolve(false); });
    setTimeout(() => { file.close(); resolve(false); }, 15_000);
  });
}

function makePlaceholderImage(color: string, w: number, h: number, destPath: string) {
  const cmd = [FFMPEG, '-y', '-f', 'lavfi', '-i', `color=c=${color}:size=${w}x${h}:rate=1`,
    '-vframes', '1', destPath];
  spawnSync(cmd[0], cmd.slice(1), { stdio: 'pipe' });
}

function buildBeatSegment(
  beat: Beat,
  imagePath: string | null,
  segPath: string,
): boolean {
  const frames = Math.round(beat.duration_s * FPS);
  const dur = beat.duration_s;

  if (imagePath && existsSync(imagePath)) {
    // Split-screen: avatar (648×1920) left + Ken Burns product image (432×1920) right
    // PROMO-05: more dynamic zoom (1.0→1.35) with subtle pan for visual interest
    const zoomEnd = 1.35;
    const zoomSpeed = (zoomEnd - 1.0) / frames;
    const zoompan = `zoompan=z='min(zoom+${zoomSpeed.toFixed(6)},${zoomEnd})':d=${frames}:x='iw/2-(iw/zoom/2)+${(0.5).toFixed(1)}*on':y='iw/2-(ih/zoom/2)',scale=${PRODUCT_W}:${H}:force_original_aspect_ratio=increase,crop=${PRODUCT_W}:${H}`;

    const args = [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${AVATAR_COLOR}:size=${AVATAR_W}x${H}:rate=${FPS}`,
      '-loop', '1', '-i', imagePath,
      '-filter_complex',
      `[1:v]${zoompan}[prod];[0:v][prod]hstack=inputs=2[out]`,
      '-map', '[out]',
      '-t', String(dur),
      '-r', String(FPS),
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      segPath,
    ];
    const r = spawnSync(FFMPEG, args, { stdio: 'pipe', timeout: 120_000 });
    return r.status === 0;
  } else {
    // Full-width avatar placeholder
    const args = [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${AVATAR_COLOR}:size=${W}x${H}:rate=${FPS}`,
      '-t', String(dur),
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      segPath,
    ];
    const r = spawnSync(FFMPEG, args, { stdio: 'pipe', timeout: 60_000 });
    return r.status === 0;
  }
}

function xfadeConcat(segments: string[], outputPath: string): boolean {
  if (segments.length === 1) {
    // Single segment — just copy
    const r = spawnSync(FFMPEG, ['-y', '-i', segments[0], '-c', 'copy', outputPath], { stdio: 'pipe', timeout: 120_000 });
    return r.status === 0;
  }

  // Build xfade chain: [0][1]xfade[v01]; [v01][2]xfade[v012]; ...
  // offset for each xfade = cumulative duration - XFADE_DUR
  // We need to know segment durations to compute offsets.
  // Use ffprobe to get each segment duration.
  const durations: number[] = segments.map((seg) => {
    const r = spawnSync(FFPROBE, [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', seg,
    ], { encoding: 'utf8', stdio: 'pipe' });
    try {
      const info = JSON.parse(r.stdout);
      return parseFloat(info.streams[0]?.duration || '5');
    } catch {
      return 5;
    }
  });

  let filterComplex = '';
  let prevLabel = '[0:v]';
  let offset = 0;

  for (let i = 1; i < segments.length; i++) {
    offset += durations[i - 1] - XFADE_DUR;
    const outLabel = i === segments.length - 1 ? '[vout]' : `[v${i}]`;
    filterComplex += `${prevLabel}[${i}:v]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset.toFixed(3)}${outLabel};`;
    prevLabel = `[v${i}]`;
  }
  filterComplex = filterComplex.replace(/;$/, '');

  const inputArgs: string[] = [];
  for (const seg of segments) inputArgs.push('-i', seg);

  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    outputPath,
  ];
  const r = spawnSync(FFMPEG, args, { stdio: 'pipe', timeout: 300_000 });
  return r.status === 0;
}

async function assemble(jobId: string, dryRun: boolean): Promise<AssembleResult> {
  const jobDir = join(PROMO_JOBS_DIR, jobId);
  const productPath = join(jobDir, 'product.json');
  const scriptPath = join(jobDir, 'script.json');

  if (!existsSync(productPath)) return { ok: false, error: `product.json missing: ${productPath}` };
  if (!existsSync(scriptPath)) return { ok: false, error: `script.json missing: ${scriptPath}` };

  const product = JSON.parse(readFileSync(productPath, 'utf8'));
  const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
  const beats: Beat[] = script.beats || [];
  const images: string[] = product.images || [];

  if (beats.length === 0) return { ok: false, error: 'script.json has no beats' };

  const segDir = join(jobDir, 'segments');
  mkdirSync(segDir, { recursive: true });

  // In dry-run mode: generate minimal color-only video without downloading images
  if (dryRun) {
    const outputPath = join(jobDir, 'final.mp4');
    const totalDur = beats.reduce((s, b) => s + b.duration_s, 0);
    // Just produce a single solid-color MP4 for validation
    const args = ['-y', '-f', 'lavfi', '-i', `color=c=${AVATAR_COLOR}:size=${W}x${H}:rate=${FPS}`,
      '-t', String(totalDur), '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', outputPath];
    const r = spawnSync(FFMPEG, args, { stdio: 'pipe', timeout: 120_000 });
    if (r.status !== 0) {
      return { ok: false, error: `FFmpeg dry-run failed: ${r.stderr?.toString().slice(0, 300)}` };
    }
    return { ok: true, outputPath, durationS: totalDur };
  }

  // Download product images
  const imageDir = join(jobDir, 'images');
  mkdirSync(imageDir, { recursive: true });
  const localImages: (string | null)[] = [];
  for (let i = 0; i < images.length; i++) {
    const ext = images[i].split('.').pop()?.split('?')[0] || 'jpg';
    const dest = join(imageDir, `img_${i}.${ext}`);
    const ok = await downloadImage(images[i], dest);
    localImages.push(ok ? dest : null);
  }

  // Build per-beat segments
  const segments: string[] = [];
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const segPath = join(segDir, `beat_${String(i).padStart(2, '0')}_${beat.beat}.mp4`);
    const imgPath = beat.image_index !== null ? (localImages[beat.image_index] || null) : null;
    const ok = buildBeatSegment(beat, imgPath, segPath);
    if (!ok) return { ok: false, error: `FFmpeg failed on beat ${beat.beat} (segment ${i})` };
    segments.push(segPath);
  }

  // Concat with xfade
  const outputPath = join(jobDir, 'final.mp4');
  const concatOk = xfadeConcat(segments, outputPath);
  if (!concatOk) return { ok: false, error: 'FFmpeg xfade concat failed' };

  const totalDuration = beats.reduce((s, b) => s + b.duration_s, 0);
  return { ok: true, outputPath, durationS: totalDuration, segments };
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let jobId = '';
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--job-id') jobId = args[++i] || '';
    else if (args[i] === '--dry-run') dryRun = true;
  }
  if (!jobId) {
    console.error('Usage: product-visual-assembler.ts --job-id <id> [--dry-run]');
    process.exit(1);
  }
  console.error(`Assembling video: job=${jobId} dry-run=${dryRun}`);
  assemble(jobId, dryRun).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => {
    console.error('Fatal:', e.message);
    process.exit(1);
  });
}

export { assemble };
