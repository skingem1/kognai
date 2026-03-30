#!/usr/bin/env npx ts-node
/**
 * pipeline-output-validator.ts — Sprint 685
 * Validates captioned videos are playable using ffprobe.
 *
 * Checks:
 * - Video stream exists (has video codec)
 * - Duration > 5s (not a corrupt stub)
 * - File size > 100KB (not empty/truncated)
 * - No ffprobe errors (not corrupt)
 *
 * Scans: workspace/scs001/run-{id}/caption/{id}-captioned.mp4
 *        workspace/scs001/multiformat-runs/{id}/output/{id}.mp4
 *
 * Usage:
 *   npx ts-node scripts/scs001/pipeline-output-validator.ts
 *   npx ts-node scripts/scs001/pipeline-output-validator.ts --recent 10  # only last 10 runs
 *   npx ts-node scripts/scs001/pipeline-output-validator.ts --telegram   # send report to Telegram
 *
 * PM2: kognai-video-validator (daily cron)
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import { join, basename } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');
const SCS001 = join(ROOT, 'workspace', 'scs001');
const REPORT_PATH = join(ROOT, 'reports', 'video-validation.json');
const LOG_PATH = join(ROOT, 'logs', 'video-validator.log');

// ── Args ──────────────────────────────────────────────

const args = process.argv.slice(2);
const recentIdx = args.indexOf('--recent');
const recentCount = recentIdx >= 0 ? parseInt(args[recentIdx + 1] || '10', 10) : 0;
const sendTelegram = args.includes('--telegram');

// ── ffprobe ───────────────────────────────────────────

interface ProbeResult {
  file: string;
  videoId: string;
  valid: boolean;
  duration: number;
  fileSize: number;
  codec: string;
  width: number;
  height: number;
  error?: string;
}

function probeVideo(filePath: string): ProbeResult {
  const videoId = basename(filePath).replace('-captioned.mp4', '').replace('_base.mp4', '').replace('_video_only.mp4', '');
  const st = statSync(filePath);

  if (st.size < 100_000) {
    return { file: filePath, videoId, valid: false, duration: 0, fileSize: st.size, codec: '', width: 0, height: 0, error: 'File too small (<100KB)' };
  }

  try {
    const probe = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,duration -show_entries format=duration -of json "${filePath}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );

    const data = JSON.parse(probe);
    const stream = data.streams?.[0];
    const formatDuration = parseFloat(data.format?.duration ?? '0');
    const streamDuration = parseFloat(stream?.duration ?? '0');
    const duration = formatDuration || streamDuration;
    const codec = stream?.codec_name ?? '';
    const width = stream?.width ?? 0;
    const height = stream?.height ?? 0;

    if (!codec) {
      return { file: filePath, videoId, valid: false, duration, fileSize: st.size, codec, width, height, error: 'No video codec found' };
    }
    if (duration < 5) {
      return { file: filePath, videoId, valid: false, duration, fileSize: st.size, codec, width, height, error: `Duration too short (${duration.toFixed(1)}s)` };
    }

    return { file: filePath, videoId, valid: true, duration, fileSize: st.size, codec, width, height };
  } catch (err) {
    return { file: filePath, videoId, valid: false, duration: 0, fileSize: st.size, codec: '', width: 0, height: 0, error: `ffprobe failed: ${(err as Error).message?.slice(0, 100)}` };
  }
}

// ── Scan ──────────────────────────────────────────────

function findVideos(): string[] {
  const videos: string[] = [];

  // Standard pipeline: run-*/caption/*-captioned.mp4
  try {
    const runs = readdirSync(SCS001).filter(d => d.startsWith('run-')).sort();
    const targetRuns = recentCount > 0 ? runs.slice(-recentCount) : runs;
    for (const run of targetRuns) {
      const captionDir = join(SCS001, run, 'caption');
      if (!existsSync(captionDir)) continue;
      for (const f of readdirSync(captionDir)) {
        if (f.endsWith('-captioned.mp4')) videos.push(join(captionDir, f));
      }
    }
  } catch { /* no runs */ }

  // Multiformat pipeline: multiformat-runs/*/output/*.mp4
  try {
    const mfDir = join(SCS001, 'multiformat-runs');
    if (existsSync(mfDir)) {
      const mfRuns = readdirSync(mfDir).filter(d => d.startsWith('mf-')).sort();
      const targetMf = recentCount > 0 ? mfRuns.slice(-recentCount) : mfRuns;
      for (const run of targetMf) {
        const outDir = join(mfDir, run, 'output');
        if (!existsSync(outDir)) continue;
        for (const f of readdirSync(outDir)) {
          if (f.endsWith('.mp4')) videos.push(join(outDir, f));
        }
      }
    }
  } catch { /* no mf runs */ }

  return videos;
}

// ── Telegram ──────────────────────────────────────────

function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || '';
  if (!token || !chatId) return Promise.resolve();

  const payload = JSON.stringify({ chat_id: chatId, text });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, () => resolve());
    req.on('error', () => resolve());
    req.write(payload);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────

async function main(): Promise<void> {
  const videos = findVideos();
  console.log(`[video-validator] Scanning ${videos.length} video files...`);

  const results: ProbeResult[] = [];
  for (const v of videos) {
    results.push(probeVideo(v));
  }

  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);

  // Report
  const report = {
    timestamp: new Date().toISOString(),
    total: results.length,
    valid: valid.length,
    invalid: invalid.length,
    pass_rate: results.length > 0 ? Math.round((valid.length / results.length) * 100) : 0,
    avg_duration: valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.duration, 0) / valid.length) : 0,
    avg_file_size_mb: valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.fileSize, 0) / valid.length / 1024 / 1024 * 10) / 10 : 0,
    invalid_files: invalid.map(r => ({ videoId: r.videoId, error: r.error })),
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n=== Video Validation Report ===`);
  console.log(`Total: ${report.total} | Valid: ${report.valid} | Invalid: ${report.invalid} | Pass: ${report.pass_rate}%`);
  console.log(`Avg duration: ${report.avg_duration}s | Avg size: ${report.avg_file_size_mb}MB`);

  if (invalid.length > 0) {
    console.log(`\nInvalid files:`);
    for (const r of invalid.slice(0, 10)) {
      console.log(`  - ${r.videoId}: ${r.error}`);
    }
  }

  // Log
  const logLine = `${new Date().toISOString()} | total=${report.total} valid=${report.valid} invalid=${report.invalid} pass=${report.pass_rate}%\n`;
  appendFileSync(LOG_PATH, logLine);

  // Telegram alert if invalid > 20%
  if (sendTelegram && report.pass_rate < 80 && report.total > 0) {
    const msg = `⚠️ Video Validator: ${report.invalid}/${report.total} invalid (${report.pass_rate}% pass)\n\n` +
      invalid.slice(0, 5).map(r => `- ${r.videoId}: ${r.error}`).join('\n');
    await sendTelegramMessage(msg);
  }

  console.log(`\nReport saved: ${REPORT_PATH}`);
}

main().catch(err => { console.error('[video-validator] Fatal:', err.message); process.exit(1); });
