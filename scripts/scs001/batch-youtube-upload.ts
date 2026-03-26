#!/usr/bin/env npx ts-node
/**
 * batch-youtube-upload.ts — Sprint 1448
 * Uploads *_final_av.mp4 files from multiformat-runs to YouTube Shorts.
 *
 * Usage:
 *   npx ts-node scripts/scs001/batch-youtube-upload.ts            # dry-run
 *   npx ts-node scripts/scs001/batch-youtube-upload.ts --live     # actual upload
 *   npx ts-node scripts/scs001/batch-youtube-upload.ts --live --max=3
 *
 * Prerequisite: run youtube-oauth.ts first to set YOUTUBE_REFRESH_TOKEN in .env
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { uploadShort, checkUploadReadiness } from './youtube-shorts';

const ROOT        = path.resolve(__dirname, '..', '..');
const LEDGER_PATH = path.join(ROOT, 'workspace', 'scs001', 'youtube-ledger.jsonl');
const RUNS_DIR    = path.join(ROOT, 'workspace', 'scs001', 'multiformat-runs');

dotenv.config({ path: path.join(ROOT, '.env') });

// ── Args ──────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const isLive    = args.includes('--live');
const maxArg    = args.find(a => a.startsWith('--max='));
const maxUpload = maxArg ? parseInt(maxArg.split('=')[1], 10) : 5;

// ── Load ledger ───────────────────────────────────────────────────────────────

function loadLedger(): Set<string> {
  if (!fs.existsSync(LEDGER_PATH)) return new Set();
  return new Set(
    fs.readFileSync(LEDGER_PATH, 'utf-8').split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l).video_path as string; } catch { return ''; } })
      .filter(Boolean)
  );
}

function appendLedger(entry: { video_path: string; youtube_id: string; uploaded_at: string }): void {
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Batch YouTube Upload — Sprint 1448 (${isLive ? 'LIVE' : 'DRY-RUN'}) ===`);

  // Check readiness first
  const ready = checkUploadReadiness();
  if (isLive && !ready.can_upload) {
    console.error('Cannot upload — missing credentials:');
    ready.issues.forEach(i => console.error(' -', i));
    console.error('\nRun: npx ts-node scripts/scs001/youtube-oauth.ts');
    process.exit(1);
  }

  // Find all final videos (stdlib scan — no glob dep)
  const allVideos: string[] = [];
  if (fs.existsSync(RUNS_DIR)) {
    for (const run of fs.readdirSync(RUNS_DIR)) {
      const outDir = path.join(RUNS_DIR, run, 'output');
      if (!fs.existsSync(outDir)) continue;
      for (const file of fs.readdirSync(outDir)) {
        if (file.endsWith('_final_av.mp4')) allVideos.push(path.join(outDir, file));
      }
    }
  }
  console.log(`\nFound ${allVideos.length} *_final_av.mp4 video(s) in multiformat-runs`);

  const uploaded = loadLedger();
  const pending  = allVideos.filter(v => !uploaded.has(v));
  const toUpload = pending.slice(0, maxUpload);
  const skipped  = pending.length - toUpload.length;

  console.log(`  Already uploaded : ${allVideos.length - pending.length}`);
  console.log(`  Pending          : ${pending.length}`);
  console.log(`  This run (max=${maxUpload}): ${toUpload.length}`);
  if (skipped > 0) console.log(`  Skipped (hit max): ${skipped}`);

  let successCount = 0;
  for (const videoPath of toUpload) {
    const title = path.basename(videoPath, '_final_av.mp4');
    console.log(`\n→ ${isLive ? 'Uploading' : 'Would upload'}: ${path.relative(ROOT, videoPath)}`);

    if (!isLive) { successCount++; continue; }

    const result = await uploadShort({
      videoPath, title,
      description: 'AI-generated content by Kognai — Phase 1 TikTok pipeline',
      tags: ['ai', 'tech', 'aitools', 'artificialintelligence', 'contentcreator'],
    });

    if (result.success && result.video_id) {
      appendLedger({ video_path: videoPath, youtube_id: result.video_id, uploaded_at: new Date().toISOString() });
      console.log(`  ✅ Uploaded: https://youtube.com/shorts/${result.video_id}`);
      successCount++;
    } else {
      console.error(`  ❌ Failed: ${result.error}`);
    }
  }

  console.log(`\nDone — ${successCount}/${toUpload.length} ${isLive ? 'uploaded' : 'would upload'}`);
  if (!isLive && toUpload.length > 0) {
    console.log('\nRun with --live to actually upload.');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
