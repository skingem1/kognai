#!/usr/bin/env npx ts-node
/**
 * backfill-multiformat-ledger.ts — Sprint 806
 *
 * Finds multiformat videos with _final.mp4 that aren't in the publish ledger
 * and adds them. Also adds to auto-delivered.jsonl for posting queue.
 *
 * Usage: npx ts-node scripts/scs001/backfill-multiformat-ledger.ts [--dry-run]
 */

import { readFileSync, existsSync, appendFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const CWD = process.cwd();
const MF_DIR = join(CWD, 'workspace', 'scs001', 'multiformat-runs');
const LEDGER_PATH = join(CWD, 'workspace', 'scs001', 'publish-ledger.jsonl');
const DELIVERED_PATH = join(CWD, 'workspace', 'scs001', 'auto-delivered.jsonl');
const DRY_RUN = process.argv.includes('--dry-run');

function loadIds(filePath: string): Set<string> {
  const ids = new Set<string>();
  if (existsSync(filePath)) {
    readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try { const e = JSON.parse(l); if (e.video_id) ids.add(e.video_id); } catch {}
    });
  }
  return ids;
}

function main(): void {
  console.log(`[backfill] Scanning multiformat runs...`);
  console.log(`[backfill] DRY_RUN=${DRY_RUN}`);

  const ledgerIds = loadIds(LEDGER_PATH);
  const deliveredIds = loadIds(DELIVERED_PATH);

  // Find all multiformat videos with _final.mp4
  const mfRuns = readdirSync(MF_DIR).filter(d => d.startsWith('mf-'));
  let addedToLedger = 0;
  let addedToDelivered = 0;

  for (const runDir of mfRuns) {
    const outDir = join(MF_DIR, runDir, 'output');
    if (!existsSync(outDir)) continue;

    const files = readdirSync(outDir);
    for (const file of files) {
      const match = file.match(/^(.+)_final\.mp4$/);
      if (!match) continue;

      const videoId = match[1];
      const mp4Path = join(outDir, file);

      // Get run report for topic info
      let topic = '';
      let format = '';
      const reportPath = join(MF_DIR, runDir, 'run-report.json');
      if (existsSync(reportPath)) {
        try {
          const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
          // Check results array for this video
          for (const r of (report.results ?? [])) {
            if (r.script_id === videoId || r.video_id === videoId) {
              topic = r.title ?? '';
              format = r.format ?? '';
              break;
            }
          }
          if (!topic) topic = report.title ?? '';
          if (!format) format = report.format ?? '';
        } catch {}
      }

      // Add to ledger if missing
      if (!ledgerIds.has(videoId)) {
        const entry = {
          video_id: videoId,
          clip_id: videoId,
          published_at: new Date().toISOString(),
          run_id: runDir,
          topic,
          format,
        };
        if (!DRY_RUN) {
          appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
        }
        ledgerIds.add(videoId);
        addedToLedger++;
      }

      // Add to auto-delivered if missing
      if (!deliveredIds.has(videoId)) {
        const entry = {
          video_id: videoId,
          delivered_at: new Date().toISOString(),
          viral_score: null,
          mp4_path: mp4Path,
          source: 'backfill-multiformat',
          topic,
          format,
        };
        if (!DRY_RUN) {
          appendFileSync(DELIVERED_PATH, JSON.stringify(entry) + '\n');
        }
        deliveredIds.add(videoId);
        addedToDelivered++;
      }
    }
  }

  console.log(`[backfill] Added to ledger: ${addedToLedger}`);
  console.log(`[backfill] Added to delivered: ${addedToDelivered}`);
  console.log(`[backfill] Total ledger: ${ledgerIds.size}`);
  console.log(`[backfill] Total delivered: ${deliveredIds.size}`);
}

main();
