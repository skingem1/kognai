/**
 * SCS-001 — Video Inventory Scanner
 *
 * Scans all multiformat pipeline runs, deduplicates by topic,
 * ranks by quality (duration, format diversity), and registers
 * new videos into publish-ledger.jsonl so /deliver can find them.
 *
 * Usage:
 *   npx ts-node scripts/scs001/scan-video-inventory.ts [--dry-run]
 *
 * Sprint 603 — GATE-PUSH
 */

import { join, basename } from 'path';
import { readdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, statSync } from 'fs';

const ROOT = join(__dirname, '..', '..');
const MF_DIR = join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const INVENTORY_PATH = join(ROOT, 'reports', 'video-inventory.json');
const MANUAL_POSTS_PATH = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

interface RunReport {
  run_id: string;
  started_at: string;
  completed_at: string;
  results: Array<{
    script_id: string;
    format: string;
    title: string;
    video_path: string;
    srt_path: string;
    duration_s: number;
    success: boolean;
    avatar_cost: number;
    llm_used: boolean;
  }>;
}

interface InventoryEntry {
  video_id: string;
  run_id: string;
  format: string;
  title: string;
  topic_key: string;
  video_path: string;
  duration_s: number;
  created_at: string;
  registered: boolean;
  posted: boolean;
}

function normalizeTitle(title: string): string {
  // Strip emoji, price changes, whitespace for dedup key
  return title
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/📈|📉|💰|🔥|🚀/g, '')
    .replace(/[+-]?\d+\.?\d*%/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');

  // Load existing ledger entries
  const existingIds = new Set<string>();
  if (existsSync(LEDGER_PATH)) {
    for (const line of readFileSync(LEDGER_PATH, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.video_id) existingIds.add(e.video_id);
      } catch { /* skip */ }
    }
  }

  // Load posted videos
  const postedIds = new Set<string>();
  if (existsSync(MANUAL_POSTS_PATH)) {
    for (const line of readFileSync(MANUAL_POSTS_PATH, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.video_id) postedIds.add(e.video_id);
      } catch { /* skip */ }
    }
  }

  // Scan all multiformat runs
  const allVideos: InventoryEntry[] = [];

  if (!existsSync(MF_DIR)) {
    console.log('No multiformat runs directory found.');
    return;
  }

  const runDirs = readdirSync(MF_DIR)
    .filter(d => d.startsWith('mf-'))
    .sort();

  for (const dir of runDirs) {
    const reportPath = join(MF_DIR, dir, 'run-report.json');
    if (!existsSync(reportPath)) continue;

    let report: RunReport;
    try {
      report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    } catch { continue; }

    for (const result of report.results) {
      if (!result.success) continue;

      // Check video file actually exists
      if (!existsSync(result.video_path)) {
        // Try relative path
        const altPath = join(MF_DIR, dir, 'output', basename(result.video_path));
        if (!existsSync(altPath)) continue;
        result.video_path = altPath;
      }

      allVideos.push({
        video_id: result.script_id,
        run_id: report.run_id,
        format: result.format,
        title: result.title,
        topic_key: normalizeTitle(result.title),
        video_path: result.video_path,
        duration_s: result.duration_s,
        created_at: report.completed_at,
        registered: existingIds.has(result.script_id),
        posted: postedIds.has(result.script_id),
      });
    }
  }

  // Deduplicate: keep the best video per topic (longest duration, prefer debate > explainer)
  const formatPriority: Record<string, number> = { debate: 3, vision: 2, listicle: 2, explainer: 1 };
  const byTopic = new Map<string, InventoryEntry>();

  for (const v of allVideos) {
    const existing = byTopic.get(v.topic_key);
    if (!existing) {
      byTopic.set(v.topic_key, v);
      continue;
    }
    // Prefer longer duration, then better format
    const existingScore = existing.duration_s * 10 + (formatPriority[existing.format] ?? 0);
    const newScore = v.duration_s * 10 + (formatPriority[v.format] ?? 0);
    if (newScore > existingScore) {
      byTopic.set(v.topic_key, v);
    }
  }

  const uniqueVideos = [...byTopic.values()].sort((a, b) =>
    b.duration_s - a.duration_s || b.created_at.localeCompare(a.created_at)
  );

  // Register new videos into publish ledger
  let newRegistered = 0;
  for (const v of uniqueVideos) {
    if (v.registered || v.posted) continue;

    const entry = {
      clip_id: v.video_id,
      video_id: v.video_id,
      published_at: v.created_at,
      run_id: v.run_id,
      format: v.format,
      title: v.title,
      source: 'multiformat-pipeline',
    };

    if (!dryRun) {
      appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
    }
    v.registered = true;
    newRegistered++;
  }

  // Write inventory report
  const inventory = {
    scanned_at: new Date().toISOString(),
    total_runs: runDirs.length,
    total_videos: allVideos.length,
    unique_topics: uniqueVideos.length,
    already_registered: uniqueVideos.filter(v => existingIds.has(v.video_id)).length,
    newly_registered: newRegistered,
    already_posted: uniqueVideos.filter(v => v.posted).length,
    ready_to_post: uniqueVideos.filter(v => !v.posted).length,
    gate_status: {
      posted: postedIds.size,
      target: 30,
      gap: Math.max(0, 30 - postedIds.size),
    },
    videos: uniqueVideos.map(v => ({
      video_id: v.video_id,
      format: v.format,
      title: v.title,
      duration_s: v.duration_s,
      posted: v.posted,
      video_path: v.video_path,
    })),
  };

  if (!dryRun) {
    writeFileSync(INVENTORY_PATH, JSON.stringify(inventory, null, 2));
  }

  // Print summary
  console.log('=== Video Inventory Scan ===');
  console.log(`Runs scanned:      ${runDirs.length}`);
  console.log(`Total videos:      ${allVideos.length}`);
  console.log(`Unique topics:     ${uniqueVideos.length}`);
  console.log(`Newly registered:  ${newRegistered}`);
  console.log(`Already posted:    ${postedIds.size}`);
  console.log(`Ready to post:     ${uniqueVideos.filter(v => !v.posted).length}`);
  console.log(`Gate: ${postedIds.size}/30 posts (${Math.max(0, 30 - postedIds.size)} to go)`);
  console.log('');
  console.log('Unique videos (best per topic):');
  for (const v of uniqueVideos) {
    const status = v.posted ? '✅' : '⏳';
    console.log(`  ${status} [${v.format}] ${v.title} (${v.duration_s}s) — ${v.video_id}`);
  }

  if (dryRun) {
    console.log('\n(dry-run — no files modified)');
  }
}

main();
