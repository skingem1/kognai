/**
 * compose-runner.ts
 * V2 pipeline orchestrator: SRT fetch + Claude scene select + blurred-bg compose.
 * Replaces the old clip-runner + overlay-runner pair.
 *
 * Usage:
 *   npm run compose           → draft briefs (testing)
 *   npm run compose:test      → draft briefs, dry-run (no DB writes)
 *   npm run run:compose       → approved briefs (production)
 */

import './env.js';
import { resolve } from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { downloadVideo } from './ia-downloader.js';
import { fetchSRT, windowSegments } from './ia-srt-fetcher.js';
import { selectScene } from './scene-selector.js';
import { composeClip } from './caption-composer.js';

const HOME = process.env.HOME ?? '/Users/tarekmnif';
const DEFAULT_FINAL_DIR = resolve(HOME, 'kognai', 'final-v2');
const DEFAULT_DOWNLOADS_DIR = resolve(HOME, 'kognai', 'downloads');

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
  let composed = 0;
  let stored = 0;

  await mkdir(finalDir, { recursive: true });
  await mkdir(DEFAULT_DOWNLOADS_DIR, { recursive: true });

  const db = getDb();
  const { data: briefs, error } = await db
    .from('tiktok_briefs')
    .select('id, ia_identifier, topic_id, topic_name, source_title, hook, caption, hashtags, duration_seconds, score, viral_trigger, platform')
    .eq('status', statusFilter)
    .eq('clip_status', 'pending')
    .order('score', { ascending: false })
    .limit(config.limit ?? 5);

  if (error) throw new Error(`Failed to fetch briefs: ${error.message}`);
  if (!briefs?.length) { console.log('[compose] No pending briefs found.'); }
  console.log(`[compose] Processing ${briefs?.length ?? 0} briefs (status=${statusFilter})`);

  for (const brief of briefs ?? []) {
    try {
      // 1. Download source video (cached if already exists)
      const videoPath = await downloadVideo(
        brief.ia_identifier,
        DEFAULT_DOWNLOADS_DIR,
        (pct) => process.stdout.write(`\r  ↓ ${brief.ia_identifier}: ${pct}%   `),
      );
      process.stdout.write('\n');

      // 2. Fetch IA ASR transcript
      const srt = await fetchSRT(brief.ia_identifier);
      console.log(`  📄 SRT: ${srt.length} segments`);

      // 3. Claude picks best scene + generates narration
      const scene = await selectScene(brief.ia_identifier, srt, {
        title: brief.source_title,
        hook: brief.hook,
        topic_name: brief.topic_name,
        duration_seconds: brief.duration_seconds,
        viral_trigger: brief.viral_trigger,
      });
      console.log(`  🎬 Scene: start=${scene.start_seconds}s | ${scene.summary}`);

      // 4. Window SRT to clip range (0-based)
      const windowedSrt = windowSegments(srt, scene.start_seconds, brief.duration_seconds);

      // 5. Compose: blurred bg + SRT captions + narration overlay
      const finalPath = resolve(finalDir, `${brief.id}.mp4`);
      if (!existsSync(finalPath)) {
        await composeClip(videoPath, finalPath, {
          startSeconds: scene.start_seconds,
          durationSeconds: brief.duration_seconds,
          srtSegments: windowedSrt,
          narration: scene.narration,
        });
      } else {
        console.log(`  ✓  Already composed: ${finalPath}`);
      }
      composed++;
      console.log(`  ✓ [${brief.topic_id}] "${brief.hook.substring(0, 45)}" start=${scene.start_seconds}s narration=${scene.narration.length} captions=${windowedSrt.length}`);

      // 6. Update DB
      if (!config.dry_run) {
        const { error: updateErr } = await db
          .from('tiktok_briefs')
          .update({ final_path: finalPath, clip_status: 'ready' })
          .eq('id', brief.id);
        if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);
        stored++;
      }
    } catch (err) {
      const msg = `[${brief.topic_id ?? brief.id}] "${brief.hook?.substring(0, 40)}": ${String(err)}`;
      errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }

  return { processed: briefs?.length ?? 0, composed, stored, errors, duration_ms: Date.now() - start };
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const isDryRun = process.argv.includes('--dry-run');
  const isDraft = process.argv.includes('--draft');
  const isApproved = process.argv.includes('--approved');
  const statusFilter = isApproved ? 'approved' : isDraft ? 'draft' : 'draft';

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
