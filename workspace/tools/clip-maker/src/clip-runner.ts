/**
 * clip-runner.ts
 * Pulls approved TikTok briefs, downloads source video from IA,
 * extracts a vertical clip, stores clip_path back to Supabase.
 *
 * Run this SQL ONCE in Supabase dashboard before first use:
 * https://supabase.com/dashboard/project/hroblewzdsosomytdvwe/sql/new
 *
 * ALTER TABLE tiktok_briefs ADD COLUMN IF NOT EXISTS clip_path TEXT;
 * ALTER TABLE tiktok_briefs ADD COLUMN IF NOT EXISTS clip_status TEXT NOT NULL DEFAULT 'pending';
 *
 * Usage:
 *   npm test             → dry run on draft briefs (download + extract, no DB write)
 *   npm run draft        → live run on draft briefs (for testing without approved briefs)
 *   npm run run          → live run on approved briefs
 */

import './env.js';
import { resolve } from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { downloadVideo } from './ia-downloader.js';
import { extractClip } from './clip-extractor.js';

const HOME = process.env.HOME ?? '/Users/tarekmnif';
const DEFAULT_CLIPS_DIR = resolve(HOME, 'kognai', 'clips');
const DEFAULT_DOWNLOADS_DIR = resolve(HOME, 'kognai', 'downloads');

function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  return createClient(url, key);
}

export interface ClipRunConfig {
  limit?: number;
  status_filter?: string;  // 'approved' (default) | 'draft'
  start_seconds?: number;  // clip start offset (default: 10)
  clips_dir?: string;
  dry_run?: boolean;
}

export interface ClipRunResult {
  processed: number;
  clips_made: number;
  clips_stored: number;
  errors: string[];
  duration_ms: number;
}

export async function runClipMaker(config: ClipRunConfig): Promise<ClipRunResult> {
  const start = Date.now();
  const clipsDir = config.clips_dir ?? DEFAULT_CLIPS_DIR;
  const statusFilter = config.status_filter ?? 'approved';
  const startSeconds = config.start_seconds ?? 10;
  const errors: string[] = [];
  let clipsMade = 0;
  let clipsStored = 0;

  await mkdir(clipsDir, { recursive: true });
  await mkdir(DEFAULT_DOWNLOADS_DIR, { recursive: true });

  const db = getDb();
  const { data: briefs, error } = await db
    .from('tiktok_briefs')
    .select('id, ia_identifier, topic_id, hook, duration_seconds, score')
    .eq('status', statusFilter)
    .eq('clip_status', 'pending')
    .order('score', { ascending: false })
    .limit(config.limit ?? 5);

  if (error) throw new Error(`Failed to fetch briefs: ${error.message}`);
  if (!briefs?.length) { console.log('[clip-runner] No pending briefs found.'); }

  console.log(`[clip-runner] Processing ${briefs?.length ?? 0} briefs (status=${statusFilter})`);

  for (const brief of briefs ?? []) {
    try {
      // 1. Download source video
      const videoPath = await downloadVideo(
        brief.ia_identifier,
        DEFAULT_DOWNLOADS_DIR,
        (pct) => process.stdout.write(`\r  ↓ ${brief.ia_identifier}: ${pct}%   `)
      );
      process.stdout.write('\n');

      // 2. Extract clip
      const outputPath = resolve(clipsDir, `${brief.id}.mp4`);
      if (!existsSync(outputPath)) {
        console.log(`  ✂  Extracting ${brief.duration_seconds}s clip → ${outputPath}`);
        await extractClip(videoPath, outputPath, { startSeconds, durationSeconds: brief.duration_seconds });
      } else {
        console.log(`  ✓  Clip already exists: ${outputPath}`);
      }
      clipsMade++;

      console.log(`  ✓ [${brief.topic_id}] "${brief.hook.substring(0, 45)}" → ${brief.id}.mp4`);

      // 3. Update DB
      if (!config.dry_run) {
        const { error: updateErr } = await db
          .from('tiktok_briefs')
          .update({ clip_path: outputPath, clip_status: 'ready' })
          .eq('id', brief.id);
        if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);
        clipsStored++;
      }
    } catch (err) {
      const msg = `[${brief.topic_id}] "${brief.hook?.substring(0, 40)}": ${String(err)}`;
      errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }

  return {
    processed: briefs?.length ?? 0,
    clips_made: clipsMade,
    clips_stored: clipsStored,
    errors,
    duration_ms: Date.now() - start,
  };
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const isDryRun = process.argv.includes('--dry-run');
  const isDraft = process.argv.includes('--draft');

  console.log(`\n=== CLIP MAKER START ===`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'} | Briefs: ${isDraft ? 'draft' : 'approved'}`);

  runClipMaker({ limit: 5, status_filter: isDraft ? 'draft' : 'approved', dry_run: isDryRun })
    .then(r => {
      console.log(`\n=== DONE (${(r.duration_ms / 1000).toFixed(1)}s) ===`);
      console.log(`Processed: ${r.processed} | Clips made: ${r.clips_made} | Stored: ${r.clips_stored}`);
      if (r.errors.length) console.log('Errors:', r.errors);
    })
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
