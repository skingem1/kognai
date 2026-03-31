#!/usr/bin/env ts-node
/**
 * TICKET-030-B + TICKET-030-Addendum: Ker@ Text → Lip-synced + Enhanced Video Pipeline
 *
 * Text → Kokoro am_echo TTS → LatentSync 1.6 → Reinhard Grade → [GFPGAN] → output.mp4
 *
 * Steps:
 *  1. TTS      — python3.12 tts_kokoro.py        →  24kHz WAV (am_echo)
 *  2. Prep     — ffmpeg still image               →  512×512 25fps H.264 video
 *  3. Sync     — comfyui-env LatentSync           →  lip-synced .mp4
 *  3.5 Grade   — kerat_color_grade.py             →  Reinhard Lab colour-graded .mp4
 *                (transfers source portrait colour palette to entire output frame —
 *                 eliminates the bright-face-on-dark-background seam artifact)
 *  3.7 GFPGAN  — gfpgan_enhance.py (opt-in only) →  face-restored .mp4
 *                NOTE: GFPGAN is DISABLED by default for dark/stylised portraits.
 *                      It undoes the Lab colour correction by restoring faces to
 *                      "natural" brightness.  Use --enable-gfpgan ONLY with
 *                      well-lit, neutral portraits.
 *
 * Usage:
 *   cd ~/kognai && ts-node scripts/kerat/kerat-lipsync.ts \
 *     --text "Intelligence is a sovereign right." \
 *     [--portrait workspace/kerat/portraits/kerat_portrait_signal_nexus_03.jpg] \
 *     [--out workspace/kerat/output/kerat_001.mp4] \
 *     [--inference-steps 20] \
 *     [--device mps] \
 *     [--grade-strength 1.0]   (0.0 = no grade, 1.0 = full Reinhard, default 1.0)
 *     [--enable-gfpgan]        (only for well-lit portraits)
 *     [--skip-grade]           (skip Reinhard grade, raw LatentSync output)
 *
 * Portrait guidance:
 *   - Dark / stylised (L < 50): default grade works well, skip GFPGAN
 *   - Well-lit / neutral (L ≥ 100): can optionally add --enable-gfpgan
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join, resolve, extname, basename, dirname } from 'path';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: join(__dirname, '..', '..', '.env') });

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..');
const LATENTSYNC_DIR = join(
  process.env.HOME!,
  'ComfyUI/custom_nodes/ComfyUI-LatentSyncWrapper'
);
const COMFYUI_ENV = join(process.env.HOME!, 'comfyui-env/bin/python');
const CHECKPOINT = join(LATENTSYNC_DIR, 'checkpoints/latentsync_unet.pt');
const UNET_CONFIG = join(LATENTSYNC_DIR, 'configs/unet/stage2.yaml');
const DEFAULT_PORTRAIT      = join(ROOT, 'workspace/kerat/portraits/kerat_portrait_signal_nexus_03.jpg');
const DEFAULT_OUT_DIR       = join(ROOT, 'workspace/kerat/output');
const TTS_SCRIPT            = join(__dirname, 'tts_kokoro.py');
const COLOR_GRADE_SCRIPT    = join(__dirname, 'kerat_color_grade.py');
const GFPGAN_SCRIPT         = join(__dirname, 'gfpgan_enhance.py');
const GFPGAN_MODEL          = join(ROOT, 'workspace/kerat/GFPGANv1.4.pth');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`[kerat-lipsync] ${msg}\n`);
}

function die(msg: string): never {
  process.stderr.write(`[kerat-lipsync] FATAL: ${msg}\n`);
  process.exit(1);
}

function getAudioDuration(wavPath: string): number {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${wavPath}"`,
      { stdio: 'pipe' }
    ).toString().trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

function isVideoFile(p: string): boolean {
  return ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(extname(p).toLowerCase());
}

// ─── Step 1: TTS ─────────────────────────────────────────────────────────────

function generateTTS(text: string, voice: string, speed: number, outWav: string): number {
  log(`Step 1 — TTS: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}" (voice=${voice})`);

  const result = spawnSync(
    '/opt/homebrew/bin/python3.12',
    [TTS_SCRIPT, '--text', text, '--out', outWav, '--voice', voice, '--speed', String(speed)],
    { encoding: 'utf8', timeout: 120_000 }
  );

  if (result.status !== 0 || result.error) {
    die(`TTS failed:\nstderr: ${result.stderr}\nerror: ${result.error?.message ?? ''}`);
  }

  // Parse metadata JSON from stdout
  let meta: any = {};
  try {
    meta = JSON.parse(result.stdout.trim().split('\n').find(l => l.startsWith('{')) ?? '{}');
  } catch {
    // Fallback: measure duration via ffprobe
  }

  const duration = meta.duration_s ?? getAudioDuration(outWav);
  log(`Step 1 ✅  WAV: ${outWav}  duration: ${duration.toFixed(2)}s`);
  return duration;
}

// ─── Step 2: Portrait → Video ─────────────────────────────────────────────────

function preparePortraitVideo(portraitPath: string, duration: number, tmpDir: string): string {
  if (isVideoFile(portraitPath)) {
    log(`Step 2 — Portrait already a video: ${portraitPath}`);
    return portraitPath;
  }

  // Still image — loop into 512×512 25fps H.264 video
  // Add 1s buffer so LatentSync has enough frames for the full audio
  const videoDuration = duration + 1.5;
  const outVideo = join(tmpDir, `kerat_portrait_${Date.now()}.mp4`);

  log(`Step 2 — Converting portrait image → ${videoDuration.toFixed(1)}s 512×512 H.264 video`);

  // scale + pad to exactly 512×512 (LatentSync requires this)
  const ffmpegCmd = [
    'ffmpeg', '-y',
    '-loop', '1',
    '-i', portraitPath,
    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:black',
    '-c:v', 'libx264',
    '-t', videoDuration.toFixed(3),
    '-r', '25',
    '-pix_fmt', 'yuv420p',
    outVideo,
  ];

  const result = spawnSync(ffmpegCmd[0], ffmpegCmd.slice(1), {
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== 0 || result.error) {
    die(`ffmpeg portrait conversion failed:\n${result.stderr}\n${result.error?.message ?? ''}`);
  }

  log(`Step 2 ✅  Portrait video: ${outVideo}`);
  return outVideo;
}

// ─── Step 3: LatentSync ───────────────────────────────────────────────────────

function runLatentSync(
  portraitVideo: string,
  audioWav: string,
  outVideo: string,
  inferenceSteps: number,
  device: string
): void {
  log(`Step 3 — LatentSync: steps=${inferenceSteps} device=${device}`);
  log(`  portrait_video: ${portraitVideo}`);
  log(`  audio:          ${audioWav}`);
  log(`  output:         ${outVideo}`);

  // PYTHONPATH must include LATENTSYNC_DIR so `import latentsync` resolves
  const existingPythonpath = (process.env.PYTHONPATH ?? '').split(':').filter(Boolean);
  const pythonpath = [LATENTSYNC_DIR, ...existingPythonpath].join(':');

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PYTORCH_MPS_HIGH_WATERMARK_RATIO: '0.0',
    PYTORCH_ENABLE_MPS_FALLBACK: '1',
    PYTHONPATH: pythonpath,
  };

  const args = [
    join(LATENTSYNC_DIR, 'scripts/inference.py'),
    '--unet_config_path', UNET_CONFIG,
    '--inference_ckpt_path', CHECKPOINT,
    '--video_path', portraitVideo,
    '--audio_path', audioWav,
    '--video_out_path', outVideo,
    '--inference_steps', String(inferenceSteps),
    '--guidance_scale', '1.0',
    '--device', device,
  ];

  // LatentSync must be run from its own directory (relative config paths)
  const result = spawnSync(COMFYUI_ENV, args, {
    cwd: LATENTSYNC_DIR,
    env,
    encoding: 'utf8',
    timeout: 3_600_000,  // 1h — MPS inference is slow
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  });

  // Stream output in real-time isn't possible with spawnSync,
  // but we log the full output after completion
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0 || result.error) {
    die(`LatentSync failed (exit ${result.status}):\n${result.error?.message ?? ''}`);
  }

  if (!existsSync(outVideo)) {
    die(`LatentSync exited 0 but output file not found: ${outVideo}`);
  }

  const sizeMB = (statSync(outVideo).size / 1024 / 1024).toFixed(1);
  log(`Step 3 ✅  Output: ${outVideo}  (${sizeMB}MB)`);
}

// ─── Step 3.5: Reinhard Lab Colour Grade ─────────────────────────────────────

function runColorGrade(
  inputVideo: string,
  outputVideo: string,
  portrait: string,
  strength: number
): boolean {
  log(`Step 3.5 — Reinhard Lab colour grade (strength=${strength.toFixed(2)})`);
  log(`  input:     ${inputVideo}`);
  log(`  reference: ${portrait}`);
  log(`  output:    ${outputVideo}`);

  if (!existsSync(COLOR_GRADE_SCRIPT)) {
    log(`Step 3.5 ⚠️  Color grade script not found at ${COLOR_GRADE_SCRIPT} — skipping`);
    return false;
  }

  const result = spawnSync(
    COMFYUI_ENV,
    [
      COLOR_GRADE_SCRIPT,
      '--input',     inputVideo,
      '--reference', portrait,
      '--output',    outputVideo,
      '--strength',  String(strength),
    ],
    {
      encoding: 'utf8',
      timeout: 1_800_000,  // 30min max
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0 || result.error) {
    log(`Step 3.5 ⚠️  Colour grade failed (exit ${result.status}) — using raw LatentSync output`);
    log(`  Error: ${result.error?.message ?? 'non-zero exit'}`);
    return false;
  }

  if (!existsSync(outputVideo)) {
    log(`Step 3.5 ⚠️  Colour grade output not found — using raw LatentSync output`);
    return false;
  }

  const sizeMB = (statSync(outputVideo).size / 1024 / 1024).toFixed(1);
  log(`Step 3.5 ✅  Colour-graded output: ${outputVideo}  (${sizeMB}MB)`);
  return true;
}

// ─── Step 3.7: GFPGAN Face Restoration (opt-in only) ─────────────────────────

function runGFPGAN(inputVideo: string, outputVideo: string): boolean {
  log(`Step 3.7 — GFPGAN face restoration (opt-in)`);
  log(`  input:  ${inputVideo}`);
  log(`  output: ${outputVideo}`);

  if (!existsSync(GFPGAN_SCRIPT)) {
    log(`Step 3.7 ⚠️  GFPGAN script not found at ${GFPGAN_SCRIPT} — skipping`);
    return false;
  }

  if (!existsSync(GFPGAN_MODEL)) {
    log(`Step 3.7 ⚠️  GFPGAN model not found at ${GFPGAN_MODEL} — skipping`);
    return false;
  }

  const result = spawnSync(
    COMFYUI_ENV,
    [GFPGAN_SCRIPT, '--input', inputVideo, '--output', outputVideo, '--model', GFPGAN_MODEL],
    {
      encoding: 'utf8',
      timeout: 1_800_000,  // 30min max
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0 || result.error) {
    log(`Step 3.7 ⚠️  GFPGAN failed (exit ${result.status}) — using previous step output`);
    log(`  Error: ${result.error?.message ?? 'non-zero exit'}`);
    return false;
  }

  if (!existsSync(outputVideo)) {
    log(`Step 3.7 ⚠️  GFPGAN output not found — using previous step output`);
    return false;
  }

  const sizeMB = (statSync(outputVideo).size / 1024 / 1024).toFixed(1);
  log(`Step 3.7 ✅  GFPGAN output: ${outputVideo}  (${sizeMB}MB)`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def?: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : def;
  };

  const text = get('--text');
  if (!text) {
    process.stderr.write(
      'Usage: ts-node kerat-lipsync.ts --text "..." ' +
      '[--portrait path] [--out path] [--inference-steps N] [--device mps] ' +
      '[--grade-strength 1.0] [--skip-grade] [--enable-gfpgan]\n'
    );
    process.exit(1);
  }

  return {
    text,
    portrait:      get('--portrait', DEFAULT_PORTRAIT)!,
    out:           get('--out')!,  // will be resolved below
    steps:         parseInt(get('--inference-steps', '20')!, 10),
    voice:         get('--voice', 'am_echo')!,
    speed:         parseFloat(get('--speed', '1.0')!),
    device:        get('--device', 'mps')!,
    gradeStrength: parseFloat(get('--grade-strength', '1.0')!),
    skipGrade:     args.includes('--skip-grade'),
    enableGfpgan:  args.includes('--enable-gfpgan'),
  };
}

async function main() {
  const cfg = parseArgs();

  // Validate inputs
  if (!existsSync(COMFYUI_ENV))  die(`comfyui-env not found: ${COMFYUI_ENV}`);
  if (!existsSync(CHECKPOINT))   die(`LatentSync checkpoint not found: ${CHECKPOINT}`);
  if (!existsSync(cfg.portrait)) die(`Portrait not found: ${cfg.portrait}`);

  // Prepare output paths — resolve ALL to absolute so LatentSync (cwd=LATENTSYNC_DIR) gets correct paths
  mkdirSync(DEFAULT_OUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outVideo = resolve(cfg.out ?? join(DEFAULT_OUT_DIR, `kerat_${ts}.mp4`));
  mkdirSync(dirname(outVideo), { recursive: true });

  const tmpDir = join(ROOT, 'workspace/kerat/.tmp');
  mkdirSync(tmpDir, { recursive: true });

  const wavPath = join(tmpDir, `tts_${ts}.wav`);

  const gradeEnabled  = !cfg.skipGrade;
  const gfpganEnabled = cfg.enableGfpgan && existsSync(GFPGAN_MODEL) && existsSync(GFPGAN_SCRIPT);

  log(`═══════════════════════════════════════════`);
  log(`Ker@ Lip-sync Pipeline`);
  log(`Text:     "${cfg.text.slice(0, 80)}"`);
  log(`Portrait: ${cfg.portrait}`);
  log(`Out:      ${outVideo}`);
  log(`Steps:    ${cfg.steps}  Device: ${cfg.device}`);
  log(`Grade:    ${gradeEnabled ? `ON (strength=${cfg.gradeStrength.toFixed(2)})` : 'OFF (--skip-grade)'}`);
  log(`GFPGAN:   ${gfpganEnabled ? 'ON (--enable-gfpgan)' : 'OFF (default — not safe for dark portraits)'}`);
  log(`═══════════════════════════════════════════`);

  // Step 1: TTS
  const duration = generateTTS(cfg.text, cfg.voice, cfg.speed, wavPath);

  // Step 2: Portrait → Video (if needed)
  const portraitVideo = preparePortraitVideo(cfg.portrait, duration, tmpDir);

  // Step 3: LatentSync
  // Always write LS output to a .latentsync.mp4 intermediate when further steps follow
  const anyPostProcess = gradeEnabled || gfpganEnabled;
  const latentSyncOut = anyPostProcess
    ? resolve(dirname(outVideo), `${basename(outVideo, '.mp4')}.latentsync.mp4`)
    : outVideo;

  runLatentSync(portraitVideo, wavPath, latentSyncOut, cfg.steps, cfg.device);

  // Step 3.5: Reinhard Lab colour grade (default ON, eliminates paste-boundary seam)
  let gradeApplied = false;
  let gradeOut = latentSyncOut;
  if (gradeEnabled) {
    const gradeTarget = gfpganEnabled
      ? resolve(dirname(outVideo), `${basename(outVideo, '.mp4')}.graded.mp4`)
      : outVideo;
    gradeApplied = runColorGrade(latentSyncOut, gradeTarget, cfg.portrait, cfg.gradeStrength);
    if (gradeApplied) {
      gradeOut = gradeTarget;
      // Remove LS intermediate now that grade succeeded
      if (existsSync(latentSyncOut) && latentSyncOut !== outVideo) {
        try { require('fs').unlinkSync(latentSyncOut); } catch {}
      }
    }
  }

  // Step 3.7: GFPGAN face restoration (opt-in only — safe for well-lit portraits)
  let gfpganApplied = false;
  let finalOut = gradeApplied ? gradeOut : latentSyncOut;
  if (gfpganEnabled) {
    gfpganApplied = runGFPGAN(finalOut, outVideo);
    if (gfpganApplied) {
      // Remove graded intermediate now that GFPGAN succeeded
      if (existsSync(gradeOut) && gradeOut !== outVideo) {
        try { require('fs').unlinkSync(gradeOut); } catch {}
      }
      finalOut = outVideo;
    }
  }

  // If neither grade nor GFPGAN produced outVideo, the LS output IS the final output
  // (already at outVideo if no post-processing, or at latentSyncOut if both steps failed)
  log('');
  log(`✅ Pipeline complete → ${finalOut}`);

  // Print JSON result for programmatic callers
  console.log(JSON.stringify({
    ok: true,
    output: finalOut,
    audio_wav: wavPath,
    portrait_video: portraitVideo,
    duration_s: duration,
    inference_steps: cfg.steps,
    voice: cfg.voice,
    grade_applied: gradeApplied,
    grade_strength: cfg.gradeStrength,
    gfpgan_applied: gfpganApplied,
  }));
}

main().catch((err) => {
  process.stderr.write(`[kerat-lipsync] FATAL: ${err.message}\n`);
  process.exit(1);
});
