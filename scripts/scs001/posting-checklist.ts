/**
 * posting-checklist.ts — Sprint 700
 *
 * Phase 1.5 gate readiness checker. Shows:
 * - How many videos are ready to post
 * - How many posts needed per day to hit April 7 gate (30 posts)
 * - Prioritised list of best videos to post next
 * - Content diversity breakdown by format
 *
 * Usage:
 *   npx ts-node scripts/scs001/posting-checklist.ts
 *
 * Telegram: /checklist
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const DELIVERED_PATH = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const MF_RUNS_DIR = join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
const GATE_DATE = new Date('2026-04-07T00:00:00Z');
const GATE_TARGET = 30;

interface VideoEntry {
  script_id: string;
  format: string;
  title: string;
  video_path: string;
  duration_s: number;
  posted: boolean;
  delivered: boolean;
}

function readJsonLines(path: string): any[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function getVideos(): VideoEntry[] {
  const ledger = readJsonLines(LEDGER_PATH);
  const delivered = readJsonLines(DELIVERED_PATH);
  const deliveredIds = new Set(delivered.map(d => d.script_id || d.video_id));

  const videos: VideoEntry[] = [];
  const seen = new Set<string>();

  for (const entry of ledger) {
    const id = entry.script_id || entry.video_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    videos.push({
      script_id: id,
      format: entry.format || 'unknown',
      title: (entry.title || entry.topic || id).slice(0, 60),
      video_path: entry.video_path || '',
      duration_s: entry.duration_s || 0,
      posted: entry.posted === true,
      delivered: deliveredIds.has(id),
    });
  }

  return videos;
}

export function generateChecklist(): string {
  const videos = getVideos();
  const now = new Date();
  const daysLeft = Math.max(1, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86400000));
  const posted = videos.filter(v => v.posted).length;
  const ready = videos.filter(v => !v.posted && existsSync(v.video_path)).length;
  const delivered = videos.filter(v => v.delivered && !v.posted).length;
  const remaining = GATE_TARGET - posted;
  const postsPerDay = Math.ceil(remaining / daysLeft);

  const lines: string[] = [];
  lines.push('📋 *Phase 1.5 Gate — Posting Checklist*\n');
  lines.push(`🎯 Gate: ${posted}/${GATE_TARGET} posts (${remaining} to go)`);
  lines.push(`📅 Deadline: Apr 7 (${daysLeft} days left)`);
  lines.push(`⚡ Pace needed: ${postsPerDay} posts/day`);
  lines.push(`📹 Videos ready: ${ready}`);
  lines.push(`📬 Already delivered to Telegram: ${delivered}`);
  lines.push('');

  // Format breakdown
  const formatCounts: Record<string, number> = {};
  videos.filter(v => !v.posted).forEach(v => {
    formatCounts[v.format] = (formatCounts[v.format] || 0) + 1;
  });
  lines.push('*Content Mix:*');
  for (const [fmt, count] of Object.entries(formatCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${fmt}: ${count} videos`);
  }
  lines.push('');

  // Next 5 to post (prioritise undelivered, then by format variety)
  const unposted = videos
    .filter(v => !v.posted && existsSync(v.video_path))
    .sort((a, b) => {
      // Prioritise undelivered (not yet sent to Telegram)
      if (a.delivered !== b.delivered) return a.delivered ? 1 : -1;
      // Then by duration (longer = more engagement)
      return b.duration_s - a.duration_s;
    })
    .slice(0, 5);

  if (unposted.length > 0) {
    lines.push('*Next 5 to Post:*');
    unposted.forEach((v, i) => {
      const icon = v.delivered ? '📬' : '📹';
      lines.push(`  ${i + 1}. ${icon} [${v.format}] ${v.title} (${v.duration_s}s)`);
    });
  }

  lines.push('');
  if (remaining <= 0) {
    lines.push('✅ *GATE MET* — 30 posts reached!');
  } else if (ready >= remaining) {
    lines.push(`✅ *Content sufficient* — ${ready} ready, need ${remaining}`);
  } else {
    lines.push(`⚠️ *Content gap* — have ${ready}, need ${remaining} more`);
  }

  // Blocker check
  lines.push('');
  lines.push('*Blockers:*');
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    lines.push('  🔴 TIKTOK\\_ACCESS\\_TOKEN not set — API posting blocked');
    lines.push('  → Manual posting via Telegram delivery is active');
  }

  return lines.join('\n');
}

// CLI
if (require.main === module) {
  console.log(generateChecklist().replace(/\*/g, '').replace(/\\_/g, '_'));
}
