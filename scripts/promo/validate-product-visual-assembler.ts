#!/usr/bin/env npx ts-node
/**
 * validate-product-visual-assembler.ts — Sprint TICKET-008-PROMO-03
 *
 * Gate validator for TICKET-008-PROMO-03:
 *   - Output MP4 exists
 *   - Duration 45-65 seconds (from ffprobe)
 *   - Width = 1080, Height = 1920
 *
 * Usage:
 *   npx ts-node scripts/promo/validate-product-visual-assembler.ts --dry-run
 *   npx ts-node scripts/promo/validate-product-visual-assembler.ts --job-id <id>
 *
 * Exit 0 = PASS, Exit 1 = FAIL
 */

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { assemble } from './product-visual-assembler';
import { generateScript } from './promo-scriptgen';

const ROOT = join(__dirname, '..', '..');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');
const FFPROBE = 'ffprobe';

interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

function probeVideo(path: string): VideoInfo | null {
  const r = spawnSync(FFPROBE, [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', path,
  ], { encoding: 'utf8', stdio: 'pipe' });
  if (r.status !== 0) return null;
  try {
    const info = JSON.parse(r.stdout);
    const video = info.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
    if (!video) return null;
    return {
      duration: parseFloat(video.duration || '0'),
      width: parseInt(video.width || '0'),
      height: parseInt(video.height || '0'),
    };
  } catch {
    return null;
  }
}

interface GateResult {
  jobId: string;
  pass: boolean;
  checks: Record<string, { pass: boolean; detail: string }>;
}

function validateVideo(jobId: string, outputPath: string): GateResult {
  const exists = existsSync(outputPath);
  if (!exists) {
    return { jobId, pass: false, checks: { file_exists: { pass: false, detail: outputPath } } };
  }

  const info = probeVideo(outputPath);
  if (!info) {
    return { jobId, pass: false, checks: {
      file_exists: { pass: true, detail: 'OK' },
      ffprobe_parse: { pass: false, detail: 'ffprobe failed to parse video' },
    }};
  }

  const durationOk = info.duration >= 44 && info.duration <= 66; // ±1s tolerance
  const widthOk = info.width === 1080;
  const heightOk = info.height === 1920;

  return {
    jobId,
    pass: durationOk && widthOk && heightOk,
    checks: {
      file_exists:      { pass: true,       detail: outputPath },
      duration_45_65s:  { pass: durationOk, detail: `${info.duration.toFixed(1)}s` },
      width_1080:       { pass: widthOk,    detail: `${info.width}px` },
      height_1920:      { pass: heightOk,   detail: `${info.height}px` },
    },
  };
}

function printResult(r: GateResult) {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} Job: ${r.jobId}`);
  for (const [k, { pass, detail }] of Object.entries(r.checks)) {
    console.log(`   ${pass ? '✓' : '✗'} ${k}: ${detail}`);
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jobIdIdx = args.indexOf('--job-id');
  const jobIdArg = jobIdIdx !== -1 ? args[jobIdIdx + 1] : null;

  console.log('═══════════════════════════════════════════════════');
  console.log('  PROMO-03 GATE VALIDATOR — product-visual-assembler');
  console.log('═══════════════════════════════════════════════════\n');

  if (jobIdArg) {
    const outputPath = join(PROMO_JOBS_DIR, jobIdArg, 'final.mp4');
    const result = validateVideo(jobIdArg, outputPath);
    printResult(result);
    process.exit(result.pass ? 0 : 1);
  }

  if (dryRun) {
    const testJobId = `validate-visual-assembler-${Date.now()}`;
    const jobDir = join(PROMO_JOBS_DIR, testJobId);
    mkdirSync(jobDir, { recursive: true });

    // Write mock product.json
    const mockProduct = {
      name: 'Premium Wireless Earbuds', brand: 'SoundTech', price: '$79.99',
      description: 'Crystal clear audio with 30hr battery life.',
      bulletPoints: ['Active Noise Cancellation', 'Wireless Charging Case', 'IPX5 Water Resistant'],
      images: [
        'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600',
        'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=600',
        'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=600',
      ],
      rating: '4.8', reviewCount: '12,450 reviews',
      topReviews: ['Best earbuds I\'ve ever owned!', 'Amazing noise cancellation.'],
      category: 'Electronics', url: 'https://example.com/earbuds',
    };
    writeFileSync(join(jobDir, 'product.json'), JSON.stringify(mockProduct, null, 2));

    // Generate mock script
    console.log(`Generating mock script for job: ${testJobId}`);
    const scriptResult = await generateScript(testJobId, 'enthusiastic', true);
    if (!scriptResult.ok) {
      console.error(`❌ Script generation failed: ${scriptResult.error}`);
      process.exit(1);
    }

    // Assemble video (dry-run = solid color, no image download)
    console.log('Assembling video (dry-run: solid color placeholder)...');
    const assembleResult = await assemble(testJobId, true);

    const outputPath = join(jobDir, 'final.mp4');
    const result = validateVideo(testJobId, outputPath);

    console.log('\n── Results ──────────────────────────────────────\n');
    if (!assembleResult.ok) {
      console.log(`❌ Assemble failed: ${assembleResult.error}`);
    } else {
      printResult(result);
    }

    console.log('═══════════════════════════════════════════════════');
    if (assembleResult.ok && result.pass) {
      console.log('✅ GATE PASS — Valid 1080×1920 MP4 generated, duration in range');
    } else {
      console.log('❌ GATE FAIL');
    }
    console.log('═══════════════════════════════════════════════════');
    process.exit(assembleResult.ok && result.pass ? 0 : 1);
  }

  console.error('Usage:');
  console.error('  --dry-run           Generate mock video + validate');
  console.error('  --job-id <id>       Validate existing final.mp4');
  process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
