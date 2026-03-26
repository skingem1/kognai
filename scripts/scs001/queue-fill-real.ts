/**
 * queue-fill-real.ts — Sprint 1463
 * Scan multiformat-runs and vlog-runs dirs for on-disk videos not yet in
 * post-queue.jsonl, and enqueue them.
 *
 * Sources:
 *   multiformat: workspace/scs001/multiformat-runs/{runId}/run-report.json
 *   vlog:        workspace/scs001/vlog-runs/{runId}/meta.json
 *
 * Usage:
 *   npx ts-node scripts/scs001/queue-fill-real.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const MF_DIR = path.join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
const VLOG_DIR = path.join(ROOT, 'workspace', 'scs001', 'vlog-runs');
const QUEUE_FILE = path.join(ROOT, 'workspace', 'scs001', 'post-queue.jsonl');
const DRY_RUN = process.argv.includes('--dry-run');

interface PostQueueEntry {
  video_id: string;
  title: string;
  file: string;
  score: string;
  added_at: string;
  status: string;
}

// ── read existing queue ids ─────────────────────────────────────────────────
function loadQueueIds(): Set<string> {
  if (!fs.existsSync(QUEUE_FILE)) return new Set();
  const ids = new Set<string>();
  fs.readFileSync(QUEUE_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .forEach(line => {
      try {
        const e = JSON.parse(line);
        if (e.video_id) ids.add(e.video_id);
      } catch {}
    });
  return ids;
}

// ── scan multiformat runs ───────────────────────────────────────────────────
function scanMultiformat(existingIds: Set<string>): PostQueueEntry[] {
  const entries: PostQueueEntry[] = [];
  if (!fs.existsSync(MF_DIR)) return entries;

  for (const runId of fs.readdirSync(MF_DIR)) {
    const reportPath = path.join(MF_DIR, runId, 'run-report.json');
    if (!fs.existsSync(reportPath)) continue;

    let report: any;
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')); }
    catch { continue; }

    const results: any[] = report.results || [];
    for (const r of results) {
      if (!r.success) continue;
      const videoId: string = r.script_id;
      if (!videoId || existingIds.has(videoId)) continue;

      const filePath: string = r.video_path || '';
      if (!filePath || !fs.existsSync(filePath)) continue;

      // decode HTML entities in title (e.g. &#8216; → ')
      const rawTitle: string = r.title || videoId;
      const title = rawTitle.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

      entries.push({
        video_id: videoId,
        title: title.slice(0, 120),
        file: filePath,
        score: 'N/A',
        added_at: new Date().toISOString(),
        status: 'pending',
      });
      existingIds.add(videoId);
    }
  }
  return entries;
}

// ── scan vlog runs ──────────────────────────────────────────────────────────
function scanVlog(existingIds: Set<string>): PostQueueEntry[] {
  const entries: PostQueueEntry[] = [];
  if (!fs.existsSync(VLOG_DIR)) return entries;

  for (const runId of fs.readdirSync(VLOG_DIR)) {
    const metaPath = path.join(VLOG_DIR, runId, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;

    let meta: any;
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); }
    catch { continue; }

    const videoId: string = meta.runId || runId;
    if (!videoId || existingIds.has(videoId)) continue;

    const filePath = path.join(VLOG_DIR, runId, `${runId}.mp4`);
    if (!fs.existsSync(filePath)) continue;

    entries.push({
      video_id: videoId,
      title: (meta.title || videoId).slice(0, 120),
      file: filePath,
      score: 'N/A',
      added_at: new Date().toISOString(),
      status: 'pending',
    });
    existingIds.add(videoId);
  }
  return entries;
}

// ── main ────────────────────────────────────────────────────────────────────
function main(): void {
  const existingIds = loadQueueIds();
  console.log(`[queue-fill-real] Existing queue: ${existingIds.size} entries`);

  const mfEntries = scanMultiformat(existingIds);
  const vlogEntries = scanVlog(existingIds);
  const newEntries = [...mfEntries, ...vlogEntries];

  console.log(`[queue-fill-real] Found: ${mfEntries.length} multiformat + ${vlogEntries.length} vlog = ${newEntries.length} new`);

  if (newEntries.length === 0) {
    console.log('[queue-fill-real] Nothing to add. Queue is up to date.');
    return;
  }

  for (const e of newEntries) {
    console.log(`  + [${e.score}] ${e.video_id} — ${e.title.slice(0, 60)}`);
  }

  if (DRY_RUN) {
    console.log('[queue-fill-real] DRY RUN — no changes written');
    return;
  }

  const lines = newEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(QUEUE_FILE, lines);
  console.log(`[queue-fill-real] Appended ${newEntries.length} entries to post-queue.jsonl`);
  console.log('[queue-fill-real] DONE');
}

main();
