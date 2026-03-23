/**
 * batch-browser-post.ts — Sprint 830
 *
 * Posts N videos to TikTok via Browser Use CLI, sequentially,
 * with configurable delay between posts. Logs each result.
 *
 * Usage:
 *   npx ts-node scripts/scs001/batch-browser-post.ts [--count N] [--delay-min M] [--dry-run]
 *
 * Default: 3 videos, 30 min delay between posts, live mode.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');

try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const MANUAL_POSTS = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const DELIVERED_LOG = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const BATCH_LOG = join(ROOT, 'logs', 'batch-browser-post.jsonl');
const POST_SCRIPT = join(ROOT, 'scripts', 'scs001', 'post-tiktok-browser.sh');

interface Candidate {
  video_id: string;
  viral_score: number;
  mp4: string;
  caption: string;
}

function readJsonLines(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function findMp4(videoId: string): string | null {
  const scsDir = join(ROOT, 'workspace', 'scs001');
  // Check ready-to-post folder
  const readyDir = join(scsDir, 'ready-to-post');
  if (existsSync(readyDir)) {
    const { readdirSync } = require('fs');
    for (const f of readdirSync(readyDir)) {
      if (f.endsWith('.mp4') && f.includes(videoId)) return join(readyDir, f);
    }
  }
  // Check multiformat output dirs
  const mfDir = join(scsDir, 'multiformat-runs');
  if (existsSync(mfDir)) {
    const { readdirSync } = require('fs');
    for (const run of readdirSync(mfDir).sort().reverse()) {
      const outputDir = join(mfDir, run, 'output');
      if (!existsSync(outputDir)) continue;
      for (const f of readdirSync(outputDir)) {
        if (f.endsWith('.mp4') && f.includes(videoId)) return join(outputDir, f);
      }
    }
  }
  // Check captioned dirs
  const captionedDir = join(scsDir, 'captioned');
  if (existsSync(captionedDir)) {
    const { readdirSync } = require('fs');
    for (const f of readdirSync(captionedDir)) {
      if (f.endsWith('.mp4') && f.includes(videoId)) return join(captionedDir, f);
    }
  }
  return null;
}

function getCandidates(count: number): Candidate[] {
  const postedIds = new Set<string>();
  for (const e of readJsonLines(MANUAL_POSTS)) {
    if (e.video_id) postedIds.add(e.video_id);
  }

  const viralScores = new Map<string, number>();
  const expPath = join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  for (const e of readJsonLines(expPath)) {
    const id = e.clip_id ?? e.video_id;
    if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
  }

  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  // From delivered log (higher priority — already vetted)
  for (const e of readJsonLines(DELIVERED_LOG)) {
    if (!e.video_id || postedIds.has(e.video_id) || seen.has(e.video_id)) continue;
    const mp4 = (e.mp4_path && existsSync(e.mp4_path)) ? e.mp4_path : findMp4(e.video_id);
    if (mp4) {
      seen.add(e.video_id);
      candidates.push({
        video_id: e.video_id,
        viral_score: e.viral_score ?? viralScores.get(e.video_id) ?? 0,
        mp4,
        caption: e.caption || `AI content #ai #tech #viral`,
      });
    }
  }

  // From ledger
  for (const e of readJsonLines(LEDGER_PATH)) {
    if (!e.video_id || postedIds.has(e.video_id) || seen.has(e.video_id)) continue;
    const mp4 = findMp4(e.video_id);
    if (mp4) {
      seen.add(e.video_id);
      candidates.push({
        video_id: e.video_id,
        viral_score: viralScores.get(e.video_id) ?? 0,
        mp4,
        caption: e.caption || `AI is changing everything #ai #tech`,
      });
    }
  }

  // Sort by viral score descending
  candidates.sort((a, b) => b.viral_score - a.viral_score);
  return candidates.slice(0, count);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(): { count: number; delayMin: number; dryRun: boolean } {
  let count = 3;
  let delayMin = 30;
  let dryRun = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--count' && process.argv[i + 1]) {
      count = Math.min(Math.max(parseInt(process.argv[i + 1]) || 3, 1), 10);
      i++;
    }
    if (process.argv[i] === '--delay-min' && process.argv[i + 1]) {
      delayMin = Math.min(Math.max(parseInt(process.argv[i + 1]) || 30, 5), 120);
      i++;
    }
    if (process.argv[i] === '--dry-run') dryRun = true;
  }
  return { count, delayMin, dryRun };
}

async function main() {
  const { count, delayMin, dryRun } = parseArgs();
  const candidates = getCandidates(count);

  console.log(`=== Batch Browser Post ===`);
  console.log(`Videos: ${candidates.length}/${count} available`);
  console.log(`Delay: ${delayMin} min between posts`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  if (candidates.length === 0) {
    console.log('No unposted videos with MP4 files found. Run pipeline first.');
    return;
  }

  mkdirSync(join(ROOT, 'logs'), { recursive: true });

  const results: Array<{ video_id: string; success: boolean; error?: string }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    console.log(`\n[${i + 1}/${candidates.length}] Posting: ${c.video_id}`);
    console.log(`  MP4: ${c.mp4}`);
    console.log(`  Score: ${c.viral_score > 0 ? c.viral_score.toFixed(2) : 'n/a'}`);

    if (dryRun) {
      console.log('  [DRY RUN] Would post via Browser Use');
      results.push({ video_id: c.video_id, success: true });

      // Record in manual-posts as dry run
      const entry = {
        video_id: c.video_id,
        views: 0,
        posted_at: new Date().toISOString(),
        method: 'batch-browser-dry',
      };
      appendFileSync(MANUAL_POSTS, JSON.stringify(entry) + '\n');
    } else {
      try {
        const caption = c.caption.replace(/"/g, '\\"');
        execSync(`bash "${POST_SCRIPT}" "${c.mp4}" "${caption}"`, {
          cwd: ROOT,
          timeout: 120000,
          stdio: 'inherit',
        });
        results.push({ video_id: c.video_id, success: true });

        // Record in manual-posts
        const entry = {
          video_id: c.video_id,
          views: 0,
          posted_at: new Date().toISOString(),
          method: 'batch-browser-live',
        };
        appendFileSync(MANUAL_POSTS, JSON.stringify(entry) + '\n');
        console.log(`  ✅ Posted successfully`);
      } catch (err: any) {
        console.log(`  ❌ Failed: ${err.message}`);
        results.push({ video_id: c.video_id, success: false, error: err.message });
      }
    }

    // Log result
    appendFileSync(BATCH_LOG, JSON.stringify({
      video_id: c.video_id,
      success: results[results.length - 1].success,
      dry_run: dryRun,
      timestamp: new Date().toISOString(),
    }) + '\n');

    // Wait between posts (skip after last)
    if (i < candidates.length - 1) {
      console.log(`  ⏳ Waiting ${delayMin} min before next post...`);
      await sleep(delayMin * 60 * 1000);
    }
  }

  // Summary
  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  console.log(`\n=== Batch Complete ===`);
  console.log(`Posted: ${ok}/${results.length} (${fail} failed)`);

  // Gate status
  const totalPosted = readJsonLines(MANUAL_POSTS).length;
  const remaining = Math.max(0, 30 - totalPosted);
  console.log(`Gate: ${totalPosted}/30 posted · ${remaining} remaining`);
}

main().catch(err => {
  console.error('Batch posting failed:', err.message);
  process.exit(1);
});
