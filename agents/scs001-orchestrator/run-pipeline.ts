#!/usr/bin/env ts-node
// SCS-001 Pipeline Runner — Executes orchestrator, saves report, notifies via Telegram
// Usage: npx ts-node agents/scs001-orchestrator/run-pipeline.ts [mock|live]

import 'dotenv/config';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { SCS001Orchestrator } from './index';
import { notifyPipelineComplete, notifyPipelineError } from './notifier';
import { logPipelineMetric } from './metrics-logger';
import { DedupLedger } from './dedup-ledger';

// Sprint 420: Queue depth check — skip pipeline if queue is saturated
const QUEUE_THRESHOLD = parseInt(process.env.PIPELINE_QUEUE_THRESHOLD || '80', 10);
const CAPTIONED_DIR = join(process.cwd(), 'workspace', 'scs001', 'captioned-output');
const LEDGER_PATH = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
const MANUAL_PATH = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');
const ARCHIVE_PATH = join(process.cwd(), 'workspace', 'scs001', 'archived-videos.json');

function getReadyQueueDepth(): number {
  // Count unposted, unarchived entries in publish ledger that have captioned MP4s
  const postedIds = new Set<string>();
  const archivedIds = new Set<string>();

  if (existsSync(MANUAL_PATH)) {
    for (const line of readFileSync(MANUAL_PATH, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e.video_id) postedIds.add(e.video_id); } catch {}
    }
  }

  if (existsSync(ARCHIVE_PATH)) {
    try {
      const data = JSON.parse(readFileSync(ARCHIVE_PATH, 'utf-8'));
      if (Array.isArray(data.ids)) for (const id of data.ids) archivedIds.add(id);
    } catch {}
  }

  let readyCount = 0;
  if (existsSync(LEDGER_PATH)) {
    for (const line of readFileSync(LEDGER_PATH, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (!e.video_id || postedIds.has(e.video_id) || archivedIds.has(e.video_id)) continue;
        // Check if captioned MP4 exists
        if (existsSync(CAPTIONED_DIR)) {
          const files = readdirSync(CAPTIONED_DIR);
          if (files.some(f => f.startsWith(e.video_id) && f.endsWith('.mp4'))) {
            readyCount++;
          }
        }
      } catch {}
    }
  }

  return readyCount;
}

async function main(): Promise<void> {
  const mode = (process.argv[2] === 'live' ? 'live' : 'mock') as 'mock' | 'live';

  // Sprint 420: Smart throttle — check queue depth before running
  const queueDepth = getReadyQueueDepth();
  if (queueDepth >= QUEUE_THRESHOLD) {
    console.log(`[Runner] Queue depth ${queueDepth} >= threshold ${QUEUE_THRESHOLD} — skipping pipeline run.`);
    console.log(`[Runner] Use PIPELINE_QUEUE_THRESHOLD env to adjust. Post content to reduce queue.`);
    return;
  }
  console.log(`[Runner] Queue depth ${queueDepth}/${QUEUE_THRESHOLD} — proceeding with pipeline run.`);

  const orchestrator = new SCS001Orchestrator(mode);
  const report = await orchestrator.run();

  // Save report to reports dir
  const reportsDir = 'reports/pipeline-runs';
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  const filename = reportsDir + '/' + report.run_id + '.json';
  writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log('[Runner] Report saved to ' + filename);

  // Also save as latest
  writeFileSync(reportsDir + '/latest.json', JSON.stringify(report, null, 2));
  console.log('[Runner] Latest report updated');

  // Log metrics for dashboard trends (non-fatal)
  try {
    logPipelineMetric(report);
  } catch (err) {
    console.error('[Runner] Metrics logging failed (non-fatal):', (err as Error).message);
  }

  // Notify subscribers via Telegram (non-fatal)
  try {
    await notifyPipelineComplete(report);
  } catch (err) {
    console.error('[Runner] Notification failed (non-fatal):', (err as Error).message);
  }

  // Sprint 423: Auto-purge low-quality content (viral score < threshold)
  const PURGE_THRESHOLD = parseFloat(process.env.PIPELINE_PURGE_THRESHOLD || '0.25');
  try {
    const expPath = join(process.cwd(), 'workspace', 'scs001', 'experiments.jsonl');
    if (existsSync(expPath)) {
      const viralScores = new Map<string, number>();
      for (const line of readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
        } catch {}
      }

      // Load existing archive
      let archivedIds: string[] = [];
      if (existsSync(ARCHIVE_PATH)) {
        try {
          const data = JSON.parse(readFileSync(ARCHIVE_PATH, 'utf-8'));
          archivedIds = Array.isArray(data.ids) ? data.ids : [];
        } catch {}
      }
      const archivedSet = new Set(archivedIds);

      // Load posted IDs
      const postedIds = new Set<string>();
      if (existsSync(MANUAL_PATH)) {
        for (const line of readFileSync(MANUAL_PATH, 'utf-8').split('\n')) {
          if (!line.trim()) continue;
          try { const e = JSON.parse(line); if (e.video_id) postedIds.add(e.video_id); } catch {}
        }
      }

      // Find low-quality clips to archive
      let purged = 0;
      for (const [id, score] of viralScores) {
        if (score < PURGE_THRESHOLD && !archivedSet.has(id) && !postedIds.has(id)) {
          archivedSet.add(id);
          purged++;
        }
      }

      // Sprint 430: Also archive experiments with unknown speaker AND hook (no useful metadata)
      let metadataPurged = 0;
      for (const line of readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id && !archivedSet.has(id) && !postedIds.has(id)
              && (e.speaker ?? 'unknown') === 'unknown'
              && (e.hook_formula ?? 'unknown') === 'unknown') {
            archivedSet.add(id);
            metadataPurged++;
          }
        } catch {}
      }
      if (metadataPurged > 0) {
        console.log(`[Runner] Auto-archived ${metadataPurged} clips with no speaker/hook metadata`);
        purged += metadataPurged;
      }

      if (purged > 0) {
        writeFileSync(ARCHIVE_PATH, JSON.stringify({
          ids: Array.from(archivedSet),
          updated_at: new Date().toISOString(),
          count: archivedSet.size,
        }, null, 2));
        console.log(`[Runner] Auto-purged ${purged} low-quality clips (score <${PURGE_THRESHOLD})`);
      }
    }
  } catch (err) {
    console.error('[Runner] Auto-purge failed (non-fatal):', (err as Error).message);
  }

  // Sprint 300: Auto-compact ledger to prevent duplicate accumulation
  try {
    const ledger = new DedupLedger();
    const { before, after } = ledger.compact();
    if (before > after) {
      console.log(`[Runner] Ledger compacted: ${before} → ${after}`);
    }
  } catch (err) {
    console.error('[Runner] Ledger compact failed (non-fatal):', (err as Error).message);
  }

  // Sprint 431: Regenerate content calendar + posting schedule after each run
  // Without this, new content only appears in calendar after next daily cron (06:50).
  try {
    const { execSync } = require('child_process');
    execSync('npx ts-node scripts/scs001/generate-content-calendar.ts', { cwd: process.cwd(), timeout: 30000, stdio: 'pipe' });
    execSync('npx ts-node scripts/scs001/generate-posting-schedule.ts', { cwd: process.cwd(), timeout: 30000, stdio: 'pipe' });
    console.log('[Runner] Content calendar + posting schedule regenerated');
  } catch (err) {
    console.error('[Runner] Calendar/schedule regen failed (non-fatal):', (err as Error).message);
  }
}

main().catch(async err => {
  console.error('Pipeline run failed:', err);
  try { await notifyPipelineError(err.message ?? String(err)); } catch {}
  process.exit(1);
});
