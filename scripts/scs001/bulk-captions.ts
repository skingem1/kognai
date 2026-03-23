/**
 * bulk-captions.ts — Sprint 839
 *
 * Exports all ready-to-post videos with their TikTok-ready captions
 * to reports/bulk-captions.json. Useful for the operator to quickly
 * copy-paste captions when posting manually.
 *
 * Usage:
 *   npx ts-node scripts/scs001/bulk-captions.ts
 *
 * Telegram: /bulk-captions (wired separately)
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildEngagementCaption } from './engagement-caption';

const ROOT = join(__dirname, '..', '..');

const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const MANUAL_POSTS = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const DELIVERED_PATH = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const OUTPUT_PATH = join(ROOT, 'reports', 'bulk-captions.json');

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
  const mfDir = join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
  if (!existsSync(mfDir)) return null;
  const runs = readdirSync(mfDir).filter(d => d.startsWith('mf-'));
  for (const run of runs.reverse()) {
    const outDir = join(mfDir, run, 'output');
    if (!existsSync(outDir)) continue;
    try {
      const files = readdirSync(outDir);
      const mp4 = files.find(f => f.startsWith(videoId) && f.endsWith('_final.mp4'));
      if (mp4) return join(outDir, mp4);
    } catch { /* skip */ }
  }
  return null;
}

function main(): void {
  // Load posted IDs
  const postedIds = new Set<string>();
  for (const entry of readJsonLines(MANUAL_POSTS)) {
    if (entry.video_id) postedIds.add(entry.video_id);
  }

  // Build candidates from ledger + delivered
  const seen = new Set<string>();
  const candidates: Array<{
    video_id: string;
    topic: string;
    format: string;
    speaker: string;
    hook_formula: string;
    mp4_path: string;
    caption: string;
  }> = [];

  // From delivered log (has more metadata)
  for (const entry of readJsonLines(DELIVERED_PATH)) {
    if (!entry.video_id || postedIds.has(entry.video_id) || seen.has(entry.video_id)) continue;
    const mp4 = (entry.mp4_path && existsSync(entry.mp4_path)) ? entry.mp4_path : findMp4(entry.video_id);
    if (!mp4) continue;
    seen.add(entry.video_id);
    candidates.push({
      video_id: entry.video_id,
      topic: entry.topic ?? '',
      format: entry.format ?? '',
      speaker: entry.speaker ?? '',
      hook_formula: entry.hook_formula ?? '',
      mp4_path: mp4,
      caption: buildEngagementCaption({
        videoId: entry.video_id,
        hookFormula: entry.hook_formula,
        speaker: entry.speaker,
        topic: entry.topic,
      }),
    });
  }

  // From ledger
  for (const entry of readJsonLines(LEDGER_PATH)) {
    if (!entry.video_id || postedIds.has(entry.video_id) || seen.has(entry.video_id)) continue;
    const mp4 = findMp4(entry.video_id);
    if (!mp4) continue;
    seen.add(entry.video_id);
    candidates.push({
      video_id: entry.video_id,
      topic: entry.topic ?? '',
      format: entry.format ?? '',
      speaker: entry.speaker ?? '',
      hook_formula: entry.hook_formula ?? '',
      mp4_path: mp4,
      caption: buildEngagementCaption({
        videoId: entry.video_id,
        hookFormula: entry.hook_formula,
        speaker: entry.speaker,
        topic: entry.topic,
      }),
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    total_ready: candidates.length,
    posted: postedIds.size,
    gate: { posted: postedIds.size, target: 30, gap: Math.max(0, 30 - postedIds.size) },
    videos: candidates,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log(`=== Bulk Captions Export ===`);
  console.log(`Ready to post: ${candidates.length}`);
  console.log(`Already posted: ${postedIds.size}`);
  console.log(`Gate: ${postedIds.size}/30 (${report.gate.gap} to go)`);
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log('');

  // Print first 5 as preview
  for (const v of candidates.slice(0, 5)) {
    console.log(`--- ${v.video_id} (${v.format}) ---`);
    console.log(`Topic: ${v.topic}`);
    console.log(`Caption:\n${v.caption}`);
    console.log('');
  }

  if (candidates.length > 5) {
    console.log(`... and ${candidates.length - 5} more in ${OUTPUT_PATH}`);
  }
}

main();
