#!/usr/bin/env npx ts-node
/**
 * pipelines/promo.ts — Sprint TICKET-008-PROMO-04
 *
 * Full end-to-end promotional video pipeline:
 *   1. Scrape ProductData from marketplace URL (browser_use)
 *   2. Generate AIDA PromoScript via qwen3:14b
 *   3. Submit monologue to HeyGen Studio avatar → 1080x1920 avatar video
 *   4. Download product images + composite with avatar using FFmpeg
 *   5. Output: workspace/promo-jobs/{jobId}/final.mp4
 *
 * Usage:
 *   npx ts-node scripts/promo/pipelines/promo.ts --url <URL> [--job-id <id>]
 *   npx ts-node scripts/promo/pipelines/promo.ts --url <URL> --dry-run
 *
 * Progress callbacks: caller can pass onProgress(step, message) for Telegram updates.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync, spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

const ROOT = join(__dirname, '..', '..', '..');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');
const VENV_PYTHON = join(ROOT, '.venv-browser-use', 'bin', 'python');
const PY_SCRAPER = join(ROOT, 'scripts', 'promo', 'product-scraper.py');
const FFMPEG = 'ffmpeg';
const FFPROBE = 'ffprobe';

export type ProgressCallback = (step: string, message: string) => void | Promise<void>;

export interface PromoJob {
  jobId: string;
  url: string;
  outputPath: string;
  durationS?: number;
  productName?: string;
}

export interface PipelineResult {
  ok: boolean;
  job?: PromoJob;
  error?: string;
}

// ── HeyGen helpers ────────────────────────────────────────────────────────────

async function submitHeyGenJob(
  monologue: string,
  avatarId: string,
  voiceId: string,
): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error('HEYGEN_API_KEY not set');

  const payload = JSON.stringify({
    video_inputs: [{
      character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
      voice: { type: 'text', input_text: monologue.slice(0, 1500), voice_id: voiceId },
      background: { type: 'color', value: '#1a1a2e' },
    }],
    dimension: { width: 648, height: 1920 },
  });

  const tmpPayload = join(PROMO_JOBS_DIR, `heygen_payload_${Date.now()}.json`);
  writeFileSync(tmpPayload, payload);

  const result = execSync(
    `curl -s -X POST "https://api.heygen.com/v2/video/generate" ` +
    `-H "x-api-key: ${apiKey}" -H "Content-Type: application/json" -d @"${tmpPayload}"`,
    { encoding: 'utf-8', timeout: 30_000 },
  );

  try { execSync(`rm -f "${tmpPayload}"`, { stdio: 'pipe' }); } catch {}

  const data = JSON.parse(result);
  const videoId = data.data?.video_id;
  if (!videoId) throw new Error(`HeyGen submit failed: ${JSON.stringify(data).slice(0, 200)}`);
  return videoId;
}

async function pollHeyGenJob(videoId: string, outPath: string, onProgress?: ProgressCallback): Promise<void> {
  const apiKey = process.env.HEYGEN_API_KEY!;
  const maxWait = 300_000; // 5 min
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    const result = execSync(
      `curl -s "https://api.heygen.com/v1/video_status.get?video_id=${videoId}" -H "x-api-key: ${apiKey}"`,
      { encoding: 'utf-8', timeout: 15_000 },
    );
    const data = JSON.parse(result);
    const status = data.data?.status;

    if (status === 'completed') {
      const videoUrl = data.data?.video_url;
      if (!videoUrl) throw new Error('HeyGen: no video_url in completed response');
      execSync(`curl -sL "${videoUrl}" -o "${outPath}"`, { timeout: 120_000 });
      return;
    }
    if (status === 'failed') {
      throw new Error(`HeyGen FAILED: ${JSON.stringify(data.data?.error || 'unknown').slice(0, 200)}`);
    }
    if (onProgress) await onProgress('heygen', `Rendering avatar... (${status})`);
  }
  throw new Error('HeyGen timeout after 5 minutes');
}

// ── Product image download ────────────────────────────────────────────────────

function downloadImageSync(url: string, destPath: string): boolean {
  if (existsSync(destPath)) return true;
  try {
    execSync(`curl -sL --max-time 15 "${url}" -o "${destPath}"`, { stdio: 'pipe', timeout: 20_000 });
    return existsSync(destPath) && require('fs').statSync(destPath).size > 1000;
  } catch {
    return false;
  }
}

// ── FFmpeg composite ─────────────────────────────────────────────────────────

function compositeAvatar(
  avatarPath: string,
  imagePaths: (string | null)[],
  beats: Array<{ beat: string; image_index: number | null; duration_s: number }>,
  outputPath: string,
): boolean {
  // Avatar is 648x1920. We overlay product images on the right 432px.
  // Full output: 1080x1920.
  const W = 1080, H = 1920, AVATAR_W = 648, PROD_W = 432, FPS = 25;

  // Probe avatar duration
  const probeResult = spawnSync(FFPROBE, [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', avatarPath,
  ], { encoding: 'utf8', stdio: 'pipe' });

  // Build per-beat segments
  const segDir = join(require('path').dirname(outputPath), 'segments');
  mkdirSync(segDir, { recursive: true });

  const segments: string[] = [];
  let avatarOffset = 0;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const segPath = join(segDir, `beat_${String(i).padStart(2, '0')}_${beat.beat}.mp4`);
    const dur = beat.duration_s;

    const imgPath = beat.image_index !== null ? (imagePaths[beat.image_index] || null) : null;

    if (imgPath) {
      // Trim avatar segment + overlay product image right
      const zoompan = `zoompan=z='min(zoom+0.001,1.25)':d=${Math.round(dur * FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',scale=${PROD_W}:${H}:force_original_aspect_ratio=increase,crop=${PROD_W}:${H}`;
      const args = [
        '-y',
        '-ss', String(avatarOffset), '-t', String(dur), '-i', avatarPath,
        '-loop', '1', '-i', imgPath,
        '-filter_complex',
        `[0:v]scale=${AVATAR_W}:${H}:force_original_aspect_ratio=increase,crop=${AVATAR_W}:${H}[avatar];[1:v]${zoompan}[prod];[avatar][prod]hstack=inputs=2[out]`,
        '-map', '[out]',
        '-t', String(dur), '-r', String(FPS),
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
        segPath,
      ];
      const r = spawnSync(FFMPEG, args, { stdio: 'pipe', timeout: 120_000 });
      if (r.status !== 0) return false;
    } else {
      // Avatar only — full width, trim to beat duration
      const args = [
        '-y',
        '-ss', String(avatarOffset), '-t', String(dur), '-i', avatarPath,
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
        '-t', String(dur), '-r', String(FPS),
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
        segPath,
      ];
      const r = spawnSync(FFMPEG, args, { stdio: 'pipe', timeout: 60_000 });
      if (r.status !== 0) return false;
    }

    segments.push(segPath);
    avatarOffset += dur;
  }

  // Concat segments
  const listPath = join(segDir, 'concat.txt');
  writeFileSync(listPath, segments.map(s => `file '${s}'`).join('\n'));
  const concatArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', outputPath];
  const r = spawnSync(FFMPEG, concatArgs, { stdio: 'pipe', timeout: 300_000 });
  return r.status === 0;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runPromo(
  url: string,
  jobId: string,
  opts: { dryRun?: boolean; tone?: string; onProgress?: ProgressCallback } = {},
): Promise<PipelineResult> {
  const { dryRun = false, tone = 'enthusiastic', onProgress } = opts;
  const progress = async (step: string, msg: string) => {
    if (onProgress) await onProgress(step, msg);
    else console.error(`[promo] [${step}] ${msg}`);
  };

  const jobDir = join(PROMO_JOBS_DIR, jobId);
  mkdirSync(jobDir, { recursive: true });

  // ── Step 1: Scrape ─────────────────────────────────────────────────────────
  await progress('scrape', `Scraping product data...`);
  const productPath = join(jobDir, 'product.json');

  if (!existsSync(productPath)) {
    if (dryRun) {
      // Write mock product for dry-run
      const mock = {
        name: 'Test Product (dry-run)', brand: 'TestBrand', price: '$29.99',
        description: 'High-quality product with amazing features.',
        bulletPoints: ['Feature A', 'Feature B', 'Feature C'],
        images: [
          'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600',
          'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=600',
          'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=600',
        ],
        rating: '4.7', reviewCount: '5,432 reviews',
        topReviews: ['Great product!', 'Worth every penny.'],
        category: 'Electronics', url,
      };
      writeFileSync(productPath, JSON.stringify(mock, null, 2));
    } else {
      const scraperArgs = [`--url`, url];
      const cmd = `${VENV_PYTHON} ${PY_SCRAPER} ${scraperArgs.map(a => `"${a}"`).join(' ')}`;
      let stdout: string;
      try {
        stdout = execSync(cmd, { timeout: 120_000, encoding: 'utf8', cwd: ROOT }).trim();
      } catch (e: any) {
        return { ok: false, error: `Scraper failed: ${e.message?.slice(0, 200)}` };
      }
      const jsonStart = stdout.indexOf('{');
      if (jsonStart === -1) return { ok: false, error: `No JSON from scraper: ${stdout.slice(0, 200)}` };
      const parsed = JSON.parse(stdout.slice(jsonStart, stdout.lastIndexOf('}') + 1));
      if (!parsed.ok || !parsed.data) return { ok: false, error: parsed.error || 'Scraper returned ok:false' };
      writeFileSync(productPath, JSON.stringify(parsed.data, null, 2));
    }
  }

  const product = JSON.parse(readFileSync(productPath, 'utf8'));
  await progress('scrape', `Got: ${product.name}`);

  // ── Step 2: Script ─────────────────────────────────────────────────────────
  await progress('script', 'Writing promotional script...');
  const { generateScript } = require('../promo-scriptgen');
  const scriptResult = await generateScript(jobId, tone, dryRun);
  if (!scriptResult.ok) return { ok: false, error: `Script failed: ${scriptResult.error}` };

  const script = scriptResult.script!;
  const monologue = script.beats.map((b: { text: string }) => b.text).join(' ');
  await progress('script', `Script ready — ${script.beats.length} beats, ${script.totalDuration}s`);

  // ── Step 3: HeyGen avatar ──────────────────────────────────────────────────
  await progress('heygen', 'Submitting to HeyGen Studio...');
  const avatarVideoPath = join(jobDir, 'avatar.mp4');

  if (dryRun) {
    // Create placeholder avatar video
    const avatarArgs = ['-y', '-f', 'lavfi', '-i',
      `color=c=0x1a1a2e:size=648x1920:rate=25`, '-t', String(script.totalDuration),
      '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
      avatarVideoPath];
    spawnSync(FFMPEG, avatarArgs, { stdio: 'pipe', timeout: 60_000 });
  } else {
    const { pickStudioAvatar } = require('../heygen-studio-avatars');
    const avatar = pickStudioAvatar(jobId);
    await progress('heygen', `Using avatar: ${avatar.name}`);
    const videoId = await submitHeyGenJob(monologue, avatar.avatarId, avatar.voiceId);
    await progress('heygen', `Job ${videoId} submitted, rendering...`);
    await pollHeyGenJob(videoId, avatarVideoPath, onProgress);
  }

  if (!existsSync(avatarVideoPath)) return { ok: false, error: 'Avatar video not created' };
  await progress('heygen', 'Avatar video ready');

  // ── Step 4: Download product images ───────────────────────────────────────
  await progress('images', 'Downloading product images...');
  const imageDir = join(jobDir, 'images');
  mkdirSync(imageDir, { recursive: true });
  const images: string[] = product.images || [];
  const localImages: (string | null)[] = images.map((url: string, i: number) => {
    const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
    const dest = join(imageDir, `img_${i}.${ext}`);
    if (dryRun) return null; // Skip download in dry-run
    return downloadImageSync(url, dest) ? dest : null;
  });

  // ── Step 5: Composite ─────────────────────────────────────────────────────
  await progress('composite', 'Compositing avatar + product images...');
  const finalPath = join(jobDir, 'final.mp4');
  const ok = compositeAvatar(avatarVideoPath, localImages, script.beats, finalPath);
  if (!ok) return { ok: false, error: 'FFmpeg composite failed' };

  await progress('done', `Done! ${finalPath}`);
  return {
    ok: true,
    job: {
      jobId,
      url,
      outputPath: finalPath,
      durationS: script.totalDuration,
      productName: product.name,
    },
  };
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let url = '';
  let jobId = '';
  let dryRun = false;
  let tone = 'enthusiastic';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url') url = args[++i] || '';
    else if (args[i] === '--job-id') jobId = args[++i] || '';
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--tone') tone = args[++i] || 'enthusiastic';
  }
  if (!url) { console.error('--url required'); process.exit(1); }
  if (!jobId) jobId = `promo-${randomBytes(4).toString('hex')}`;

  runPromo(url, jobId, { dryRun, tone }).then(r => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch(e => { console.error('Fatal:', e.message); process.exit(1); });
}
