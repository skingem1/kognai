/**
 * compose-runner.ts
 * V2 pipeline orchestrator: supports Internet Archive AND stock sources (Pexels/Pixabay).
 * Routes by brief.video_source — IA uses ia-downloader + ASR; others use direct URL download.
 *
 * Usage:
 *   npm run compose           → draft briefs (testing)
 *   npm run compose:test      → draft briefs, dry-run (no DB writes)
 *   npm run run:compose       → approved briefs (production)
 */

import './env.js';
import { resolve } from 'path';
import { mkdir, readdir } from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createClient } from '@supabase/supabase-js';
import { downloadVideo } from './ia-downloader.js';
import { fetchSRT, windowSegments } from './ia-srt-fetcher.js';
import { selectScene } from './scene-selector.js';
import { composeClip } from './caption-composer.js';

const HOME = process.env.HOME ?? '/Users/tarekmnif';
const DEFAULT_FINAL_DIR     = resolve(HOME, 'kognai', 'final-v2');
const DEFAULT_DOWNLOADS_DIR = resolve(HOME, 'kognai', 'downloads');
const MUSIC_DIR             = resolve(HOME, 'kognai', 'music');

/** Pick a random music file from ~/kognai/music/, or undefined if none. */
async function pickMusicTrack(): Promise<string | undefined> {
  try {
    const files = await readdir(MUSIC_DIR);
    const tracks = files.filter(f => /\.(mp3|m4a|aac|wav|ogg)$/i.test(f));
    if (!tracks.length) return undefined;
    return resolve(MUSIC_DIR, tracks[Math.floor(Math.random() * tracks.length)]);
  } catch { return undefined; }
}

/**
 * Download any video URL to a local file.
 * Skips download if the file already exists (cache).
 */
async function downloadFromUrl(url: string, dir: string, filename: string): Promise<string> {
  const dest = resolve(dir, filename);
  if (existsSync(dest)) return dest;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  if (!res.body) throw new Error('No response body');

  // Stream to disk via pipeline — handles cleanup and errors correctly
  const writer = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), writer);
  return dest;
}

function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  return createClient(url, key);
}

export interface ComposeRunConfig {
  limit?: number;
  status_filter?: string;  // 'draft' | 'approved'
  dry_run?: boolean;
  final_dir?: string;
}

export interface ComposeRunResult {
  processed: number;
  composed: number;
  stored: number;
  errors: string[];
  duration_ms: number;
}

export async function runCompose(config: ComposeRunConfig): Promise<ComposeRunResult> {
  const start = Date.now();
  const finalDir = config.final_dir ?? DEFAULT_FINAL_DIR;
  const statusFilter = config.status_filter ?? 'draft';
  const errors: string[] = [];
  let composed = 0, stored = 0;

  await mkdir(finalDir, { recursive: true });
  await mkdir(DEFAULT_DOWNLOADS_DIR, { recursive: true });

  const db = getDb();
  const { data: briefs, error } = await db
    .from('tiktok_briefs')
    .select('id, ia_identifier, video_source, video_id, video_download_url, topic_id, topic_name, source_title, hook, caption, hashtags, duration_seconds, score, viral_trigger, platform')
    .eq('status', statusFilter)
    .eq('clip_status', 'pending')
    .order('score', { ascending: false })
    .limit(config.limit ?? 5);

  if (error) throw new Error(`Failed to fetch briefs: ${error.message}`);
  if (!briefs?.length) { console.log('[compose] No pending briefs found.'); }
  console.log(`[compose] Processing ${briefs?.length ?? 0} briefs (status=${statusFilter})`);

  for (const brief of briefs ?? []) {
    const src = brief.video_source ?? 'internet_archive';
    const label = `[${brief.topic_id}] "${brief.hook?.substring(0, 40)}"`;

    try {
      let videoPath: string;

      // ── Route by source ────────────────────────────────────────────────
      if (src === 'internet_archive' || brief.ia_identifier) {
        // IA path: use ia-downloader + ASR transcript
        const identifier = brief.ia_identifier ?? brief.video_id;
        videoPath = await downloadVideo(
          identifier,
          DEFAULT_DOWNLOADS_DIR,
          (pct) => process.stdout.write(`\r  ↓ ${identifier}: ${pct}%   `),
        );
        process.stdout.write('\n');

        const srt = await fetchSRT(identifier);
        if (srt.length === 0) {
          console.log(`  ⏭  Skipping ${label} — no ASR transcript`);
          continue;
        }
        console.log(`  📄 SRT: ${srt.length} segments`);

        const scene = await selectScene(identifier, srt, {
          title: brief.source_title,
          hook: brief.hook,
          topic_name: brief.topic_name,
          duration_seconds: brief.duration_seconds,
          viral_trigger: brief.viral_trigger,
        });
        console.log(`  🎬 Scene: start=${scene.start_seconds}s | ${scene.summary}`);

        const windowedSrt = windowSegments(srt, scene.start_seconds, brief.duration_seconds);
        const finalPath   = resolve(finalDir, `${brief.id}.mp4`);
        const musicPath   = await pickMusicTrack();
        if (musicPath) console.log(`  🎵 Music: ${musicPath.split('/').pop()}`);

        if (!existsSync(finalPath)) {
          await composeClip(videoPath, finalPath, {
            startSeconds: scene.start_seconds,
            durationSeconds: brief.duration_seconds,
            srtSegments: windowedSrt,
            narration: scene.narration,
            musicPath,
          });
        } else {
          console.log(`  ✓  Already composed: ${finalPath}`);
        }
        composed++;
        console.log(`  ✓ ${label} start=${scene.start_seconds}s narration=${scene.narration.length} captions=${windowedSrt.length}`);
        if (!config.dry_run) {
          await db.from('tiktok_briefs').update({ final_path: finalPath, clip_status: 'ready' }).eq('id', brief.id);
          stored++;
        }

      } else {
        // Stock path (Pexels / Pixabay): direct URL download, no SRT
        if (!brief.video_download_url) {
          console.log(`  ⏭  Skipping ${label} — no video_download_url`);
          continue;
        }
        const ext      = brief.video_download_url.includes('.mp4') ? 'mp4' : 'mp4';
        const filename = `${src}_${brief.video_id}.${ext}`;
        process.stdout.write(`  ↓ ${filename}...`);
        videoPath = await downloadFromUrl(brief.video_download_url, DEFAULT_DOWNLOADS_DIR, filename);
        process.stdout.write(' done\n');

        // No ASR → Claude generates narration from brief metadata alone (empty SRT)
        const scene = await selectScene(filename, [], {
          title: brief.source_title,
          hook: brief.hook,
          topic_name: brief.topic_name,
          duration_seconds: brief.duration_seconds,
          viral_trigger: brief.viral_trigger,
        });
        console.log(`  🎬 Scene (no-SRT): ${scene.summary}`);

        const finalPath = resolve(finalDir, `${brief.id}.mp4`);
        const musicPath = await pickMusicTrack();
        if (musicPath) console.log(`  🎵 Music: ${musicPath.split('/').pop()}`);

        if (!existsSync(finalPath)) {
          await composeClip(videoPath, finalPath, {
            startSeconds: 0,            // stock clips: start from beginning
            durationSeconds: brief.duration_seconds,
            srtSegments: [],            // no transcript
            narration: scene.narration,
            musicPath,
          });
        } else {
          console.log(`  ✓  Already composed: ${finalPath}`);
        }
        composed++;
        console.log(`  ✓ ${label} [${src}] narration=${scene.narration.length}`);
        if (!config.dry_run) {
          await db.from('tiktok_briefs').update({ final_path: finalPath, clip_status: 'ready' }).eq('id', brief.id);
          stored++;
        }
      }
    } catch (err) {
      const msg = `${label}: ${String(err)}`;
      errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }

  return { processed: briefs?.length ?? 0, composed, stored, errors, duration_ms: Date.now() - start };
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const isDryRun    = process.argv.includes('--dry-run');
  const isApproved  = process.argv.includes('--approved');
  const statusFilter = isApproved ? 'approved' : 'draft';

  console.log(`\n=== COMPOSE V2 START ===`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'} | Briefs: ${statusFilter}`);

  runCompose({ limit: 5, status_filter: statusFilter, dry_run: isDryRun })
    .then(r => {
      console.log(`\n=== DONE (${(r.duration_ms / 1000).toFixed(1)}s) ===`);
      console.log(`Processed: ${r.processed} | Composed: ${r.composed} | Stored: ${r.stored}`);
      if (r.errors.length) console.log('Errors:', r.errors);
    })
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
