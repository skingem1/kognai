/**
 * overlay-runner.ts
 * Applies hook text overlay to vertical clips → ~/kognai/final/
 * Stores final_path back to tiktok_briefs.
 *
 * Run this SQL ONCE in Supabase dashboard before first use:
 * https://supabase.com/dashboard/project/hroblewzdsosomytdvwe/sql/new
 *
 * ALTER TABLE tiktok_briefs ADD COLUMN IF NOT EXISTS final_path TEXT;
 *
 * Usage:
 *   npm run overlay:test     → dry run on draft briefs (no DB write)
 *   npm run overlay          → live run on draft briefs (for testing)
 *   npm run run:overlay      → live run on approved briefs
 */

import './env.js';
import { resolve } from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { applyTextOverlay } from './text-overlay.js';

const HOME = process.env.HOME ?? '/Users/tarekmnif';
const DEFAULT_CLIPS_DIR = resolve(HOME, 'kognai', 'clips');
const DEFAULT_FINAL_DIR = resolve(HOME, 'kognai', 'final');

function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  return createClient(url, key);
}

export interface OverlayRunConfig {
  limit?: number;
  status_filter?: string; // 'approved' | 'draft' (default: 'draft' for testing)
  clips_dir?: string;
  final_dir?: string;
  dry_run?: boolean;
}

export interface OverlayRunResult {
  processed: number;
  overlays_applied: number;
  stored: number;
  errors: string[];
  duration_ms: number;
}

export async function runOverlay(config: OverlayRunConfig): Promise<OverlayRunResult> {
  const start = Date.now();
  const clipsDir = config.clips_dir ?? DEFAULT_CLIPS_DIR;
  const finalDir = config.final_dir ?? DEFAULT_FINAL_DIR;
  const statusFilter = config.status_filter ?? 'draft';
  const errors: string[] = [];
  let overlaysApplied = 0;
  let stored = 0;

  await mkdir(finalDir, { recursive: true });

  const db = getDb();
  const { data: briefs, error } = await db
    .from('tiktok_briefs')
    .select('id, topic_id, hook, score')
    .eq('status', statusFilter)
    .in('clip_status', ['ready', 'pending'])  // include 'pending' so dry-run clips work
    .is('final_path', null)
    .order('score', { ascending: false })
    .limit(config.limit ?? 5);

  if (error) throw new Error(`Failed to fetch briefs: ${error.message}`);

  console.log(`[overlay-runner] Processing ${briefs?.length ?? 0} briefs (status=${statusFilter})`);

  for (const brief of briefs ?? []) {
    const clipPath = resolve(clipsDir, `${brief.id}.mp4`);
    const finalPath = resolve(finalDir, `${brief.id}.mp4`);

    if (!existsSync(clipPath)) {
      console.warn(`  ⚠  Clip not found, skipping: ${clipPath}`);
      errors.push(`[${brief.topic_id}] clip missing: ${brief.id}.mp4`);
      continue;
    }

    try {
      console.log(`  ✍  [${brief.topic_id}] "${brief.hook.substring(0, 45)}"...`);
      await applyTextOverlay(clipPath, finalPath, { hookText: brief.hook });
      overlaysApplied++;

      console.log(`  ✓  → final/${brief.id}.mp4`);

      if (!config.dry_run) {
        const { error: updateErr } = await db
          .from('tiktok_briefs')
          .update({ final_path: finalPath })
          .eq('id', brief.id);
        if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);
        stored++;
      }
    } catch (err) {
      const msg = `[${brief.topic_id}] "${brief.hook.substring(0, 35)}": ${String(err)}`;
      errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }

  return {
    processed: briefs?.length ?? 0,
    overlays_applied: overlaysApplied,
    stored,
    errors,
    duration_ms: Date.now() - start,
  };
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const isDryRun = process.argv.includes('--dry-run');
  const isDraft = process.argv.includes('--draft');
  const isApproved = process.argv.includes('--approved');

  console.log(`\n=== OVERLAY RUNNER START ===`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'} | Briefs: ${isApproved ? 'approved' : 'draft'}`);

  runOverlay({
    limit: 5,
    status_filter: isApproved ? 'approved' : 'draft',
    dry_run: isDryRun,
  })
    .then(r => {
      console.log(`\n=== DONE (${(r.duration_ms / 1000).toFixed(1)}s) ===`);
      console.log(`Processed: ${r.processed} | Overlays: ${r.overlays_applied} | Stored: ${r.stored}`);
      if (r.errors.length) console.log('Errors:', r.errors);
    })
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
