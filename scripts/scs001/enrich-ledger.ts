#!/usr/bin/env ts-node
/**
 * enrich-ledger.ts — Sprint 810
 * Backfills publish-ledger.jsonl with duration_s, file_exists, file_path,
 * and experiment data (viral_score, speaker, topic, format) from MP4 files.
 *
 * Usage: npx ts-node scripts/scs001/enrich-ledger.ts [--dry-run]
 * Env:   ENRICH_DRY_RUN=1 to preview without writing
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');
const LEDGER = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const EXP_PATH = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
const DRY_RUN = process.argv.includes('--dry-run') || process.env.ENRICH_DRY_RUN === '1';

interface LedgerEntry {
  video_id: string;
  duration_s?: number;
  file_exists?: boolean;
  file_path?: string;
  viral_score?: number;
  speaker?: string;
  topic?: string;
  format?: string;
  [key: string]: any;
}

function getDuration(mp4Path: string): number | null {
  try {
    const out = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${mp4Path}"`,
      { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString().trim();
    const d = parseFloat(out);
    return isNaN(d) ? null : Math.round(d);
  } catch {
    return null;
  }
}

function findMp4(videoId: string): string | null {
  const scsDir = path.join(ROOT, 'workspace', 'scs001');

  // Check multiformat-runs output dirs
  const mfDir = path.join(scsDir, 'multiformat-runs');
  if (fs.existsSync(mfDir)) {
    const mfRuns = fs.readdirSync(mfDir).filter(d => d.startsWith('mf-'));
    for (const dir of mfRuns) {
      const outDir = path.join(mfDir, dir, 'output');
      if (!fs.existsSync(outDir)) continue;
      for (const suffix of ['_final.mp4', '_final_av.mp4', '_video_only.mp4', '_base.mp4']) {
        const p = path.join(outDir, `${videoId}${suffix}`);
        if (fs.existsSync(p)) return p;
      }
    }
  }

  // Check legacy run-* dirs
  try {
    const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = path.join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* ignore */ }

  return null;
}

function loadExperiments(): Map<string, { viral_score?: number; speaker?: string; topic?: string; format?: string }> {
  const map = new Map();
  if (!fs.existsSync(EXP_PATH)) return map;
  try {
    for (const line of fs.readFileSync(EXP_PATH, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id) {
          map.set(id, {
            viral_score: e.partial_viral_score ?? e.viral_score,
            speaker: e.speaker,
            topic: e.topic,
            format: e.format,
          });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return map;
}

export interface EnrichResult {
  total: number;
  enriched: number;
  filesFound: number;
  filesMissing: number;
  durationsAdded: number;
  scoresAdded: number;
  dryRun: boolean;
}

export function runEnrich(): EnrichResult {
  if (!fs.existsSync(LEDGER)) {
    return { total: 0, enriched: 0, filesFound: 0, filesMissing: 0, durationsAdded: 0, scoresAdded: 0, dryRun: DRY_RUN };
  }

  const experiments = loadExperiments();
  const lines = fs.readFileSync(LEDGER, 'utf-8').split('\n');
  const result: EnrichResult = { total: 0, enriched: 0, filesFound: 0, filesMissing: 0, durationsAdded: 0, scoresAdded: 0, dryRun: DRY_RUN };
  const newLines: string[] = [];

  for (const line of lines) {
    if (!line.trim()) { newLines.push(line); continue; }
    let entry: LedgerEntry;
    try { entry = JSON.parse(line); } catch { newLines.push(line); continue; }
    result.total++;

    let changed = false;
    const vid = entry.video_id;
    if (!vid) { newLines.push(line); continue; }

    // Backfill file_exists + file_path + duration
    if (entry.file_exists === undefined || entry.duration_s === undefined) {
      const mp4 = findMp4(vid);
      if (mp4) {
        result.filesFound++;
        if (!entry.file_exists) { entry.file_exists = true; changed = true; }
        if (!entry.file_path) { entry.file_path = mp4; changed = true; }
        if (entry.duration_s === undefined) {
          const dur = getDuration(mp4);
          if (dur !== null) {
            entry.duration_s = dur;
            result.durationsAdded++;
            changed = true;
          }
        }
      } else {
        result.filesMissing++;
        if (entry.file_exists !== false) { entry.file_exists = false; changed = true; }
      }
    } else {
      if (entry.file_exists) result.filesFound++;
      else result.filesMissing++;
    }

    // Backfill experiment data
    const exp = experiments.get(vid);
    if (exp) {
      if (exp.viral_score != null && entry.viral_score === undefined) {
        entry.viral_score = exp.viral_score;
        result.scoresAdded++;
        changed = true;
      }
      if (exp.speaker && !entry.speaker) { entry.speaker = exp.speaker; changed = true; }
      if (exp.topic && !entry.topic) { entry.topic = exp.topic; changed = true; }
      if (exp.format && !entry.format) { entry.format = exp.format; changed = true; }
    }

    if (changed) result.enriched++;
    newLines.push(JSON.stringify(entry));
  }

  if (!DRY_RUN && result.enriched > 0) {
    fs.writeFileSync(LEDGER, newLines.join('\n'));
  }

  return result;
}

export function formatEnrichResult(r: EnrichResult): string {
  const mode = r.dryRun ? '🔍 DRY RUN' : '✅ ENRICHMENT COMPLETE';
  return [
    mode,
    '',
    `*Ledger:* ${r.total} entries`,
    `*Enriched:* ${r.enriched} entries updated`,
    `*Files found:* ${r.filesFound} | Missing: ${r.filesMissing}`,
    `*Durations added:* ${r.durationsAdded}`,
    `*Scores added:* ${r.scoresAdded}`,
  ].join('\n');
}

if (require.main === module) {
  const result = runEnrich();
  console.log(formatEnrichResult(result));
}
