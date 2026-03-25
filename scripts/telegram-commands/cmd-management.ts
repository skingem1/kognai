/**
 * Telegram bot commands — extracted from telegram-bot.ts (Sprint 455)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ROOT, readJSON, readLines, readRealPosts, getPm2List, fmtUptime, fmtMem, latestSprintFile,
  findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived, saveArchived, ARCHIVE_PATH,
  loadNotes, saveNotes, HOOK_OPENERS,
} from './shared';

export function cmdHistory(): string {
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const posts = readLines(manualPostsPath) as Array<{ video_id: string; views?: number; posted_at?: string; recorded_at?: string; title?: string }>;

  if (posts.length === 0) {
    return (
      `📅 *Posting History*\n\n` +
      `No posts recorded yet.\n\n` +
      `Start with \`/deliver 1\` to get a video, then \`/record <id> <views>\` after posting.`
    );
  }

  // Group posts by date
  const byDate: Record<string, Array<{ video_id: string; views: number }>> = {};
  for (const p of posts) {
    const date = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    if (!date) continue;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({ video_id: p.video_id, views: p.views ?? 0 });
  }

  const sortedDates = Object.keys(byDate).sort();
  const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);

  // Build timeline bars
  const maxPostsInDay = Math.max(...sortedDates.map(d => byDate[d].length));
  const lines: string[] = [
    `📅 *Posting History*`,
    `${posts.length}/30 posts · ${totalViews}/500 views`,
    '',
    `*Timeline:*`,
  ];

  for (const date of sortedDates) {
    const dayPosts = byDate[date];
    const dayViews = dayPosts.reduce((s, p) => s + p.views, 0);
    const barLength = Math.max(1, Math.round((dayPosts.length / Math.max(maxPostsInDay, 1)) * 8));
    const bar = '█'.repeat(barLength);
    const shortDate = date.slice(5); // MM-DD
    lines.push(`\`${shortDate}\` ${bar} ${dayPosts.length} post${dayPosts.length > 1 ? 's' : ''} · ${dayViews} views`);
  }

  // View trend: compare first half vs second half
  lines.push('');
  if (sortedDates.length >= 2) {
    const mid = Math.floor(sortedDates.length / 2);
    const firstHalfViews = sortedDates.slice(0, mid).reduce((s, d) => s + byDate[d].reduce((vs, p) => vs + p.views, 0), 0);
    const secondHalfViews = sortedDates.slice(mid).reduce((s, d) => s + byDate[d].reduce((vs, p) => vs + p.views, 0), 0);
    const firstHalfPosts = sortedDates.slice(0, mid).reduce((s, d) => s + byDate[d].length, 0);
    const secondHalfPosts = sortedDates.slice(mid).reduce((s, d) => s + byDate[d].length, 0);

    const viewTrend = secondHalfViews > firstHalfViews ? '📈 Views trending UP' :
                      secondHalfViews < firstHalfViews ? '📉 Views trending DOWN' : '➡️ Views steady';
    const paceTrend = secondHalfPosts > firstHalfPosts ? '📈 Pace increasing' :
                      secondHalfPosts < firstHalfPosts ? '📉 Pace slowing' : '➡️ Pace steady';
    lines.push(`*Trends:*`);
    lines.push(`${viewTrend}`);
    lines.push(`${paceTrend}`);
  }

  // Gate projection
  lines.push('');
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / 86_400_000));
  const postsLeft = Math.max(0, 30 - posts.length);
  const viewsLeft = Math.max(0, 500 - totalViews);

  if (postsLeft === 0 && viewsLeft === 0) {
    lines.push(`✅ *Gate: MET* — both targets achieved!`);
  } else {
    // Calculate pace from actual posting history
    const firstDate = new Date(sortedDates[0]);
    const daysSinceStart = Math.max(1, Math.ceil((now.getTime() - firstDate.getTime()) / 86_400_000));
    const postsPerDay = posts.length / daysSinceStart;
    const viewsPerPost = posts.length > 0 ? totalViews / posts.length : 0;

    lines.push(`*Gate Projection (Apr 7):*`);
    lines.push(`📊 Current pace: ${postsPerDay.toFixed(1)} posts/day`);

    if (postsLeft > 0) {
      const daysToComplete = postsPerDay > 0 ? Math.ceil(postsLeft / postsPerDay) : Infinity;
      if (daysToComplete <= daysLeft) {
        lines.push(`✅ Posts: on track (${daysToComplete}d needed, ${daysLeft}d left)`);
      } else {
        const needed = daysLeft > 0 ? (postsLeft / daysLeft).toFixed(1) : '∞';
        lines.push(`⚠️ Posts: need ${needed}/day (${postsLeft} remaining in ${daysLeft}d)`);
      }
    }

    if (viewsLeft > 0 && viewsPerPost > 0) {
      const postsForViews = Math.ceil(viewsLeft / viewsPerPost);
      lines.push(`👁 Avg ${Math.round(viewsPerPost)} views/post → ~${postsForViews} more posts for 500 views`);
    } else if (viewsLeft > 0) {
      lines.push(`👁 ${viewsLeft} more views needed`);
    }
  }

  // Top performers
  const withViews = posts.filter(p => (p.views ?? 0) > 0).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  if (withViews.length > 0) {
    lines.push('');
    lines.push(`*Top Performers:*`);
    for (const p of withViews.slice(0, 3)) {
      const title = p.title ? ` — ${p.title.slice(0, 25)}` : '';
      lines.push(`🏆 \`${p.video_id}\` · ${p.views} views${title}`);
    }
  }

  return lines.join('\n');
}

export function cmdArchive(args: string): string {
  const videoId = args.trim();
  if (!videoId) {
    const archived = loadArchived();
    if (archived.size === 0) {
      return `📁 *Archive*\n\nNo archived videos.\n\nUsage: \`/archive <video_id>\`\nArchived videos won't appear in /deliver or /queue.`;
    }
    const ids = Array.from(archived).slice(0, 10);
    return (
      `📁 *Archive* — ${archived.size} video${archived.size !== 1 ? 's' : ''}\n\n` +
      ids.map(id => `• \`${id}\``).join('\n') +
      (archived.size > 10 ? `\n_...and ${archived.size - 10} more_` : '') +
      `\n\nRestore: \`/unarchive <video_id>\``
    );
  }

  const archived = loadArchived();
  if (archived.has(videoId)) {
    return `⚠️ \`${videoId}\` is already archived.\nUse \`/unarchive ${videoId}\` to restore.`;
  }

  archived.add(videoId);
  saveArchived(archived);
  return `📁 *Archived:* \`${videoId}\`\n\nThis video won't appear in /deliver or /queue.\nRestore: \`/unarchive ${videoId}\``;
}

export function cmdUnarchive(args: string): string {
  const videoId = args.trim();
  if (!videoId) {
    return `Usage: \`/unarchive <video_id>\`\n\nView archived videos: \`/archive\``;
  }

  const archived = loadArchived();
  if (!archived.has(videoId)) {
    return `⚠️ \`${videoId}\` is not in the archive.`;
  }

  archived.delete(videoId);
  saveArchived(archived);
  return `✅ *Restored:* \`${videoId}\`\n\nThis video will appear in /deliver and /queue again.`;
}

export function cmdStale(args: string): string {
  const STALE_DAYS = 14; // Sprint 1065: threshold raised to 14d (topic shelf-life)
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const archivedIds = loadArchived();
  const now = Date.now();

  const withAge = (ledger as any[])
    .filter((e: any) => {
      if (!e.video_id || recordedIds.has(e.video_id) || archivedIds.has(e.video_id)) return false;
      if (!e.published_at) return false;
      return true;
    })
    .map((e: any) => ({
      ...e,
      ageDays: Math.floor((now - new Date(e.published_at).getTime()) / 86_400_000),
    }))
    .filter((e: any) => e.ageDays > STALE_DAYS)
    .sort((a: any, b: any) => b.ageDays - a.ageDays);

  if (withAge.length === 0) {
    return `✅ *No stale content* — all queued videos are <${STALE_DAYS} days old.`;
  }

  if (args.trim() === 'archive') {
    const archived = loadArchived();
    for (const e of withAge) archived.add(e.video_id);
    saveArchived(archived);
    return (
      `📁 *Bulk archived ${withAge.length} stale videos* (>${STALE_DAYS} days old)\n\n` +
      `Queue is now focused on fresh content.\n` +
      `Restore any with \`/unarchive <video_id>\``
    );
  }

  // Show per-item age (up to 10), oldest first
  const lines = [
    `🕰 *Stale Content* — ${withAge.length} video(s) >${STALE_DAYS} days old`,
    '',
  ];
  const shown = withAge.slice(0, 10);
  for (const e of shown) {
    const topic = e.topic ? String(e.topic).slice(0, 45) : e.video_id;
    const archiveTag = e.ageDays >= STALE_DAYS ? ' ⚠️' : '';
    lines.push(`• \`${e.video_id}\` — *${e.ageDays}d* old${archiveTag}`);
    lines.push(`  _${topic}_`);
  }
  if (withAge.length > 10) {
    lines.push(`_…and ${withAge.length - 10} more_`);
  }
  lines.push('');
  lines.push(`Run \`/stale archive\` to bulk-archive all ${withAge.length} stale videos.`);
  lines.push(`_Archived videos can be restored with /unarchive_`);

  return lines.join('\n');
}

export function cmdPurge(args: string): string {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const archivedIds = loadArchived();

  // Load viral scores
  const viralScores = new Map<string, number>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    try {
      for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Get active queue (not posted, not archived)
  const active = (ledger as any[]).filter((e: any) =>
    e.video_id && !recordedIds.has(e.video_id) && !archivedIds.has(e.video_id)
  );

  if (active.length === 0) {
    return '📊 *Queue Quality* — No active videos in queue.';
  }

  // Score each active video
  const scored = active.map((e: any) => ({
    video_id: e.video_id,
    score: viralScores.get(e.video_id) ?? 0,
  }));

  // Quality tiers
  const premium = scored.filter(s => s.score >= 0.6);
  const good = scored.filter(s => s.score >= 0.4 && s.score < 0.6);
  const mediocre = scored.filter(s => s.score >= 0.3 && s.score < 0.4);
  const poor = scored.filter(s => s.score < 0.3);

  const PURGE_THRESHOLD = 0.3;

  if (args.trim() === 'confirm') {
    if (poor.length === 0) {
      return '✅ No low-quality content to purge — queue is clean!';
    }
    const archived = loadArchived();
    for (const item of poor) archived.add(item.video_id);
    saveArchived(archived);
    return (
      `🗑 *Purged ${poor.length} low-quality videos* (score <${PURGE_THRESHOLD})\n\n` +
      `Queue reduced: ${active.length} → ${active.length - poor.length} videos\n` +
      `Restore any with \`/unarchive <video_id>\``
    );
  }

  const avgScore = scored.reduce((s, v) => s + v.score, 0) / scored.length;
  const hasReady = scored.filter(s => findCaptionedMp4(s.video_id) !== null);

  const lines = [
    '📊 *Queue Quality Report*',
    '',
    `Total active: *${active.length}* · Ready (MP4): *${hasReady.length}*`,
    `Avg viral score: *${(avgScore * 100).toFixed(0)}%*`,
    '',
    '*Quality Tiers:*',
    `  🏆 Premium (≥60%): *${premium.length}* videos`,
    `  ✅ Good (40-59%): *${good.length}* videos`,
    `  ⚠️ Mediocre (30-39%): *${mediocre.length}* videos`,
    `  ❌ Poor (<30%): *${poor.length}* videos`,
    '',
  ];

  if (poor.length > 0) {
    lines.push(`_${poor.length} poor-quality clips are diluting your queue._`);
    lines.push(`Run \`/purge confirm\` to archive them.`);
  } else {
    lines.push('✅ Queue is clean — no poor-quality content!');
  }

  return lines.join('\n');
}

export function cmdNote(args: string): string {
  const parts = args.trim().split(/\s+/);
  const videoId = parts[0] || '';
  const noteText = parts.slice(1).join(' ').trim();

  if (!videoId) {
    // Show all notes
    const notes = loadNotes();
    const keys = Object.keys(notes);
    if (keys.length === 0) {
      return `📝 *Video Notes*\n\nNo notes yet.\n\nUsage: \`/note <video_id> <your note>\`\nExample: \`/note video-abc123 Great hook, save for Friday\``;
    }
    const lines = [`📝 *Video Notes* — ${keys.length} entries\n`];
    for (const id of keys.slice(-10)) {
      lines.push(`\`${id}\` — ${notes[id].note}`);
    }
    if (keys.length > 10) lines.push(`\n_...${keys.length - 10} older notes_`);
    lines.push(`\nClear: \`/note <video_id> clear\``);
    return lines.join('\n');
  }

  if (!noteText) {
    // Show note for specific video
    const notes = loadNotes();
    if (notes[videoId]) {
      return `📝 *Note for* \`${videoId}\`:\n${notes[videoId].note}\n_Added: ${notes[videoId].at.slice(0, 10)}_`;
    }
    return `No note for \`${videoId}\`.\n\nAdd one: \`/note ${videoId} your note here\``;
  }

  if (noteText.toLowerCase() === 'clear') {
    const notes = loadNotes();
    if (notes[videoId]) {
      delete notes[videoId];
      saveNotes(notes);
      return `🗑️ Note cleared for \`${videoId}\``;
    }
    return `No note found for \`${videoId}\``;
  }

  const notes = loadNotes();
  notes[videoId] = { note: noteText, at: new Date().toISOString() };
  saveNotes(notes);
  return `📝 *Note saved!*\n\n\`${videoId}\`: ${noteText}`;
}

export function cmdUpdateViews(args: string): string {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    return (
      `*Usage:* \`/updateviews <video_id> <views>\`\n\n` +
      `Example: \`/updateviews clip_abc123 250\`\n\n` +
      `Updates the view count for an already-recorded video.\n` +
      `Use /posted to see your recorded videos.`
    );
  }

  const videoId = parts[0];
  const views = parseInt(parts[1], 10);
  if (isNaN(views) || views < 0) {
    return `❌ Invalid views count: \`${parts[1]}\` — must be a non-negative number.`;
  }

  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const entries = readLines(manualPostsPath);

  const idx = entries.findIndex((e: any) => e.video_id === videoId);
  if (idx === -1) {
    return `❌ Video \`${videoId}\` not found in posted videos.\nRecord it first with \`/record ${videoId} ${views}\``;
  }

  // Update the entry
  const oldViews = entries[idx].views ?? 0;
  entries[idx].views = views;
  entries[idx].views_updated_at = new Date().toISOString();

  // Rewrite the file
  const content = entries.map((e: any) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(manualPostsPath, content, 'utf-8');

  // Gate stats
  const totalViews = entries.reduce((s: number, e: any) => s + (e.views ?? 0), 0);
  const viewsNeeded = Math.max(0, 500 - totalViews);

  return (
    `✅ *Views updated!*\n\n` +
    `Video: \`${videoId}\`\n` +
    `Views: ${oldViews} → *${views}*\n\n` +
    `📊 Total views: ${totalViews}/500 (${viewsNeeded} more needed)\n` +
    `📝 ${entries.length}/30 posts recorded`
  );
}

export function cmdExport(args: string): string {
  const count = Math.min(Math.max(parseInt(args) || 10, 1), 30);

  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));

  // Load viral scores
  const viralScores = new Map<string, number>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
      } catch { /* skip */ }
    }
  }

  // Find unposted videos with captioned mp4
  const ready: Array<{ video_id: string; filePath: string; score: number }> = [];
  for (const e of ledger as any[]) {
    if (!e.video_id || recordedIds.has(e.video_id)) continue;
    const mp4 = findCaptionedMp4(e.video_id);
    if (mp4) {
      ready.push({ video_id: e.video_id, filePath: mp4, score: viralScores.get(e.video_id) ?? -1 });
    }
  }
  ready.sort((a, b) => b.score - a.score);
  const batch = ready.slice(0, count);

  if (batch.length === 0) {
    return '⚠️ No ready videos found. Run /refresh first.';
  }

  // Generate manifest
  const manifestLines: string[] = [
    `# TikTok Posting Manifest`,
    `# Generated: ${new Date().toISOString()}`,
    `# Videos: ${batch.length} (sorted by viral score)`,
    '',
  ];

  for (let i = 0; i < batch.length; i++) {
    const v = batch[i];
    const caption = buildTikTokCaption(v.video_id);
    const exp = getExperimentData(v.video_id);
    manifestLines.push(`--- Video ${i + 1} of ${batch.length} ---`);
    manifestLines.push(`ID: ${v.video_id}`);
    manifestLines.push(`File: ${v.filePath}`);
    manifestLines.push(`Score: ${Math.round(v.score * 100)}%`);
    manifestLines.push(`Speaker: ${exp.speaker}`);
    manifestLines.push(`Hook: ${exp.hook_formula}`);
    manifestLines.push(`Caption:`);
    manifestLines.push(caption);
    manifestLines.push(`After posting: /record ${v.video_id} 0`);
    manifestLines.push('');
  }

  // Write manifest file
  const manifestPath = path.join(ROOT, 'workspace', 'scs001', 'export-manifest.txt');
  fs.writeFileSync(manifestPath, manifestLines.join('\n'), 'utf-8');

  // Also generate a file list for easy AirDrop
  const fileListPath = path.join(ROOT, 'workspace', 'scs001', 'export-files.txt');
  fs.writeFileSync(fileListPath, batch.map(v => v.filePath).join('\n') + '\n', 'utf-8');

  const lines = [
    `📦 *Export Manifest* — ${batch.length} videos`,
    '',
    `📄 Manifest: \`workspace/scs001/export-manifest.txt\``,
    `📁 File list: \`workspace/scs001/export-files.txt\``,
    '',
    '*Top 5 in this batch:*',
  ];

  for (let i = 0; i < Math.min(5, batch.length); i++) {
    const v = batch[i];
    const exp = getExperimentData(v.video_id);
    lines.push(`${i + 1}. \`${v.video_id.slice(0, 16)}\` — ${exp.speaker} (${Math.round(v.score * 100)}%)`);
  }

  lines.push('');
  lines.push('💡 AirDrop: `cat workspace/scs001/export-files.txt | xargs open`');
  lines.push(`📋 After posting each: \`/record <video_id> 0\``);

  return lines.join('\n');
}

export function cmdWeeklyReport(): string {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  // Posts this week
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const thisWeekPosts = posts.filter((p: any) => {
    const d = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    return d >= weekAgoStr && d <= todayStr;
  });
  const totalPosts = posts.length;
  const totalViews = posts.reduce((sum: number, p: any) => sum + (p.views ?? 0), 0);
  const weekViews = thisWeekPosts.reduce((sum: number, p: any) => sum + (p.views ?? 0), 0);

  // Pipeline output this week
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  const weekExperiments = experiments.filter((e: any) => {
    const d = (e.timestamp ?? '').slice(0, 10);
    return d >= weekAgoStr && d <= todayStr;
  });
  const weekQcPassed = weekExperiments.filter((e: any) => e.qc_passed).length;

  // Top hook this week
  const hookCounts: Record<string, { count: number; totalScore: number }> = {};
  for (const e of weekExperiments) {
    const h = e.hook_formula ?? 'unknown';
    if (h === 'unknown') continue;
    if (!hookCounts[h]) hookCounts[h] = { count: 0, totalScore: 0 };
    hookCounts[h].count++;
    if (e.partial_viral_score != null) hookCounts[h].totalScore += e.partial_viral_score;
  }
  const topHook = Object.entries(hookCounts)
    .map(([h, s]) => ({ hook: h, avg: s.count > 0 ? s.totalScore / s.count : 0, count: s.count }))
    .sort((a, b) => b.avg - a.avg)[0];

  // Gate progress
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - totalPosts);
  const paceNeeded = daysLeft > 0 ? (postsNeeded / daysLeft).toFixed(1) : '0';

  // Captioned videos ready
  let captionedCount = 0;
  try {
    const scsDir = path.join(ROOT, 'workspace', 'scs001');
    const seen = new Set<string>();
    for (const dir of fs.readdirSync(scsDir).filter(d => d.startsWith('run-'))) {
      const capDir = path.join(scsDir, dir, 'caption');
      if (!fs.existsSync(capDir)) continue;
      for (const f of fs.readdirSync(capDir)) {
        if (f.endsWith('-captioned.mp4')) seen.add(f);
      }
    }
    captionedCount = seen.size;
  } catch { /* skip */ }

  // Revenue
  const dbPath = path.join(ROOT, 'data', 'telegram-db.json');
  let mrr = 0;
  let paidUsers = 0;
  if (fs.existsSync(dbPath)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      const PRICES: Record<string, number> = { growth: 19, premium: 49 };
      for (const [_, entry] of Object.entries(db) as [string, any][]) {
        const tier = entry.tier ?? 'free';
        if (tier !== 'free' && entry.active !== false) {
          paidUsers++;
          mrr += PRICES[tier] ?? 0;
        }
      }
    } catch { /* skip */ }
  }

  const lines = [
    `📊 *Weekly Report* (${weekAgoStr} → ${todayStr})`,
    '',
    '*📱 Posting:*',
    // Sprint 1121: views per day this week vs target
    (() => {
      const weekViewsPerDay = (weekViews / 7).toFixed(1);
      const viewsNeeded = Math.max(0, 500 - totalViews);
      const viewsPerDayNeeded = daysLeft > 0 ? (viewsNeeded / daysLeft).toFixed(1) : '0';
      return `• This week: ${thisWeekPosts.length} posts · ${weekViews} views (${weekViewsPerDay}/day · need ${viewsPerDayNeeded}/day for gate)`;
    })(),
    // Sprint 1135 (wave 13): views per post average
    (() => {
      const avgViews = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;
      const weekAvgViews = thisWeekPosts.length > 0 ? Math.round(weekViews / thisWeekPosts.length) : 0;
      return `• All time: ${totalPosts}/30 posts · ${totalViews} total views · *${avgViews} views/post avg* · (this week: ${weekAvgViews}/post)`;
    })(),
    // Sprint 1139 (wave 15): average posting time of day
    (() => {
      if (thisWeekPosts.length === 0) return '';
      const hours = thisWeekPosts
        .map((p: any) => { try { return new Date(p.posted_at ?? p.recorded_at).getHours(); } catch { return -1; } })
        .filter((h: number) => h >= 0);
      if (hours.length === 0) return '';
      const avgHour = Math.round(hours.reduce((a: number, b: number) => a + b, 0) / hours.length);
      const period = avgHour < 12 ? 'AM' : 'PM';
      const hour12 = avgHour % 12 || 12;
      return `• Avg post time this week: *${hour12}${period}*`;
    })(),
    `• Gate: ${daysLeft}d left · ${paceNeeded} posts/day needed`,
    // Sprint 1109: gate velocity — this week vs last week
    (() => {
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);
      const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10);
      const lastWeekPosts = posts.filter((p: any) => {
        const d = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
        return d >= twoWeeksAgoStr && d < weekAgoStr;
      });
      const thisRate = (thisWeekPosts.length / 7).toFixed(1);
      const lastRate = (lastWeekPosts.length / 7).toFixed(1);
      const delta = thisWeekPosts.length - lastWeekPosts.length;
      const arrow = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️';
      const lastWeekViews = lastWeekPosts.reduce((sum: number, p: any) => sum + (p.views ?? 0), 0);
      const lastWeekViewsPerDay = (lastWeekViews / 7).toFixed(1);
      const viewsDelta = weekViews - lastWeekViews;
      const viewsArrow = viewsDelta > 0 ? '📈' : viewsDelta < 0 ? '📉' : '➡️';
      return [
        `${arrow} Post velocity: ${thisRate}/day this week vs ${lastRate}/day last week`,
        `${viewsArrow} Views velocity: ${(weekViews / 7).toFixed(1)}/day this week vs ${lastWeekViewsPerDay}/day last week`,
      ].join('\n');
    })(),
    '',
    '*🔬 Pipeline:*',
    `• New experiments: ${weekExperiments.length}`,
    `• QC passed: ${weekQcPassed}`,
    `• Videos ready: ${captionedCount}`,
    topHook ? `• Top hook: *${topHook.hook}* (${Math.round(topHook.avg * 100)}% avg, n=${topHook.count})` : '',
    '',
    '*💰 Revenue:*',
    `• MRR: €${mrr} · Paid users: ${paidUsers}`,
    `• Stripe: ${process.env.STRIPE_SECRET_KEY ? '🟢' : '🔴'}`,
    '',
    '*📈 Next week targets:*',
    `• Post ${Math.min(postsNeeded, 14)} videos (2/day)`,
    `• Run /postnow daily`,
    `• Track views with /updateviews`,
    // Sprint 1143 (wave 18): sprints shipped this week
    (() => {
      try {
        const gitOut = execSync(`git log --oneline --since="${weekAgoStr}" --grep="^Sprint" 2>/dev/null`, { cwd: ROOT, encoding: 'utf-8', timeout: 5000 });
        const sprintLines = gitOut.trim().split('\n').filter(l => l.includes('Sprint'));
        if (sprintLines.length > 0) return `\n*🏃 Dev velocity:* ${sprintLines.length} sprint${sprintLines.length !== 1 ? 's' : ''} shipped this week`;
        return '';
      } catch { return ''; }
    })(),
  ].filter(Boolean);

  return lines.join('\n');
}

export function cmdSpeakerTest(): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  if (experiments.length === 0) return '⚠️ No experiments found.';

  const stats: Record<string, { scores: number[]; hooks: Record<string, number> }> = {};
  for (const e of experiments) {
    const speaker = e.speaker ?? 'unknown';
    if (speaker === 'unknown') continue;
    if (!stats[speaker]) stats[speaker] = { scores: [], hooks: {} };
    if (e.partial_viral_score != null) stats[speaker].scores.push(e.partial_viral_score);
    const hook = e.hook_formula ?? 'unknown';
    if (hook !== 'unknown') stats[speaker].hooks[hook] = (stats[speaker].hooks[hook] ?? 0) + 1;
  }

  const ranked = Object.entries(stats)
    .map(([speaker, s]) => {
      const avg = s.scores.length > 0 ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length : 0;
      const max = s.scores.length > 0 ? Math.max(...s.scores) : 0;
      const bestHook = Object.entries(s.hooks).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';
      return { speaker, avg, max, count: s.scores.length, bestHook };
    })
    .sort((a, b) => b.avg - a.avg);

  if (ranked.length === 0) return '⚠️ No speaker data found.';

  const medals = ['🥇', '🥈', '🥉'];
  const lines = [
    '🎙️ *Speaker A/B Test Rankings*',
    `${experiments.length} experiments · ${ranked.length} speakers`,
    '',
  ];

  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const medal = i < 3 ? medals[i] : `${i + 1}.`;
    const avgPct = Math.round(r.avg * 100);
    const maxPct = Math.round(r.max * 100);
    lines.push(`${medal} *${r.speaker}* — avg ${avgPct}% · max ${maxPct}% · n=${r.count} · best: ${r.bestHook}`);
  }

  lines.push('');
  lines.push('💡 Focus on top speakers for gate acceleration');

  return lines.join('\n');
}

export function cmdFilmKit(): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));

  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - posts.length);

  // Best hook formula
  const hookStats: Record<string, { total: number; count: number }> = {};
  for (const e of experiments) {
    const h = e.hook_formula ?? 'unknown';
    if (h === 'unknown') continue;
    if (!hookStats[h]) hookStats[h] = { total: 0, count: 0 };
    hookStats[h].count++;
    if (e.partial_viral_score != null) hookStats[h].total += e.partial_viral_score;
  }
  const bestHook = Object.entries(hookStats)
    .map(([h, s]) => ({ hook: h, avg: s.count > 0 ? s.total / s.count : 0 }))
    .sort((a, b) => b.avg - a.avg)[0];

  // Best speaker
  const spStats: Record<string, { total: number; count: number }> = {};
  for (const e of experiments) {
    const sp = e.speaker ?? 'unknown';
    if (sp === 'unknown') continue;
    if (!spStats[sp]) spStats[sp] = { total: 0, count: 0 };
    spStats[sp].count++;
    if (e.partial_viral_score != null) spStats[sp].total += e.partial_viral_score;
  }
  const bestSpeaker = Object.entries(spStats)
    .map(([sp, s]) => ({ speaker: sp, avg: s.count > 0 ? s.total / s.count : 0 }))
    .sort((a, b) => b.avg - a.avg)[0];

  // Trending topic
  let topic = 'general trend';
  try {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json'), 'utf-8'));
    const topics: string[] = data.topics ?? [];
    if (topics.length > 0) topic = topics[Math.floor(Math.random() * Math.min(3, topics.length))];
  } catch { /* ignore */ }

  // Best posting time
  let postTime = '12:00';
  try {
    const sched = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'posting-schedule.json'), 'utf-8'));
    const slots: any[] = sched.slots ?? [];
    const todayStr = now.toISOString().slice(0, 10);
    const currentHour = now.getHours();
    const nextSlot = slots
      .filter((s: any) => s.date === todayStr && parseInt(s.time) > currentHour)
      .sort((a: any, b: any) => a.time.localeCompare(b.time))[0];
    if (nextSlot) postTime = nextSlot.slot_label ?? nextSlot.time;
  } catch { /* ignore */ }

  // Hashtags from viral topics
  let hashtags = '#fyp #viral #trending';
  try {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json'), 'utf-8'));
    const topics: string[] = (data.topics ?? []).slice(0, 5);
    if (topics.length > 0) {
      hashtags = topics.map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()).join(' ') + ' #fyp';
    }
  } catch { /* ignore */ }

  const hookName = bestHook?.hook ?? 'curiosity_gap';
  const hookPct = bestHook ? Math.round(bestHook.avg * 100) : 0;
  const opener = HOOK_OPENERS[hookName] ?? HOOK_OPENERS['curiosity_gap'] ?? '"Did you know..."';
  const speakerName = bestSpeaker?.speaker ?? 'TBD';
  const speakerPct = bestSpeaker ? Math.round(bestSpeaker.avg * 100) : 0;

  const lines = [
    '🎬 *FILM KIT — Your Next Video*',
    `${posts.length}/30 posted · ${postsNeeded} to go · ${daysLeft} days left`,
    '',
    `📌 *Topic:* ${topic}`,
    `🪝 *Hook:* ${hookName} (${hookPct}% avg viral)`,
    `💬 *Opener:* ${opener}`,
    `🎤 *Speaker:* ${speakerName} (${speakerPct}% avg)`,
    `⏰ *Post at:* ${postTime}`,
    '',
    '📝 *Script Structure:*',
    `1. Hook (0-3s): ${opener}`,
    `2. Value (3-45s): Key insight about *${topic}*`,
    '3. CTA (45-60s): "Follow for more" / ask question',
    '',
    `🏷️ *Hashtags:*`,
    `\`${hashtags}\``,
    '',
    '📋 *After filming:*',
    '→ /queue to check ready videos',
    '→ /record to log the post',
    '→ /caption to generate TikTok caption',
  ];

  return lines.join('\n');
}

export function cmdContentPlan(): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  const posts = readRealPosts();
  const schedulePath = path.join(ROOT, 'reports', 'posting-schedule.json');

  const now = new Date();
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - posts.length);

  // Top hooks by avg viral score
  const hookStats: Record<string, { scores: number[]; count: number }> = {};
  for (const e of experiments) {
    const h = e.hook_formula ?? 'unknown';
    if (h === 'unknown') continue;
    if (!hookStats[h]) hookStats[h] = { scores: [], count: 0 };
    hookStats[h].count++;
    if (e.partial_viral_score != null) hookStats[h].scores.push(e.partial_viral_score);
  }
  const topHooks = Object.entries(hookStats)
    .map(([hook, s]) => ({
      hook,
      avg: s.scores.length > 0 ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length : 0,
      count: s.count,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // Top speakers by avg viral score
  const speakerStats: Record<string, { scores: number[]; count: number }> = {};
  for (const e of experiments) {
    const sp = e.speaker ?? 'unknown';
    if (sp === 'unknown') continue;
    if (!speakerStats[sp]) speakerStats[sp] = { scores: [], count: 0 };
    speakerStats[sp].count++;
    if (e.partial_viral_score != null) speakerStats[sp].scores.push(e.partial_viral_score);
  }
  const topSpeakers = Object.entries(speakerStats)
    .map(([speaker, s]) => ({
      speaker,
      avg: s.scores.length > 0 ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length : 0,
      count: s.count,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);

  // Best posting times from schedule
  let bestTimes: { time: string; label: string }[] = [];
  if (fs.existsSync(schedulePath)) {
    try {
      const sched = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
      const slots: any[] = sched.slots ?? [];
      const timeScores: Record<string, { totalScore: number; count: number; label: string }> = {};
      for (const s of slots) {
        const t = s.time ?? '?';
        if (!timeScores[t]) timeScores[t] = { totalScore: 0, count: 0, label: s.slot_label ?? t };
        timeScores[t].count++;
        if (s.viral_score != null) timeScores[t].totalScore += s.viral_score;
      }
      bestTimes = Object.entries(timeScores)
        .map(([time, s]) => ({ time, label: s.label, avg: s.count > 0 ? s.totalScore / s.count : 0 }))
        .sort((a: any, b: any) => b.avg - a.avg)
        .slice(0, 3)
        .map(t => ({ time: t.time, label: t.label }));
    } catch { /* ignore */ }
  }

  // Generate 7-day plan
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const lines = [
    '📋 *7-Day Content Plan*',
    `${posts.length}/30 posted · ${postsNeeded} needed · ${daysLeft} days to gate`,
    '',
  ];

  if (postsNeeded > 0 && daysLeft > 0) {
    const dailyPace = Math.ceil(postsNeeded / Math.min(daysLeft, 7));
    lines.push(`🎯 Target: *${dailyPace} posts/day* to stay on track`);
    lines.push('');
  }

  for (let d = 0; d < 7; d++) {
    const date = new Date(now.getTime() + d * 86_400_000);
    const dayName = dayNames[date.getDay()];
    const dateStr = date.toISOString().slice(5, 10); // MM-DD
    const hookIdx = d % Math.max(1, topHooks.length);
    const speakerIdx = d % Math.max(1, topSpeakers.length);
    const hook = topHooks[hookIdx]?.hook ?? 'question-hook';
    const speaker = topSpeakers[speakerIdx]?.speaker ?? 'TBD';
    const hookPct = topHooks[hookIdx] ? Math.round(topHooks[hookIdx].avg * 100) : 0;
    const timeSlot = bestTimes[d % Math.max(1, bestTimes.length)]?.label ?? '12:00';

    const dayIcon = d === 0 ? '📌' : '📅';
    lines.push(`${dayIcon} *${dayName} ${dateStr}* — post at *${timeSlot}*`);
    lines.push(`   🎤 ${speaker} · 🪝 ${hook} (${hookPct}%)`);
    if (d === 0) lines.push('   ⬆️ *TODAY — film this first!*');
    lines.push('');
  }

  // Summary tips
  lines.push('💡 *Tips:*');
  if (topHooks.length > 0) {
    lines.push(`• Best hook: *${topHooks[0].hook}* (${Math.round(topHooks[0].avg * 100)}% avg)`);
  }
  if (topSpeakers.length > 0) {
    lines.push(`• Best speaker: *${topSpeakers[0].speaker}* (${Math.round(topSpeakers[0].avg * 100)}% avg)`);
  }
  if (bestTimes.length > 0) {
    lines.push(`• Best time: *${bestTimes[0].label}*`);
  }
  lines.push(`• Use /queue to pick ready videos`);
  lines.push(`• Use /record after posting to track`);

  return lines.join('\n');
}

export function cmdSuggest(): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  if (experiments.length === 0) return '⚠️ No experiments found — run /refresh first.';

  // Count hook usage
  const hookUsage: Record<string, { count: number; totalScore: number }> = {};
  const speakerUsage: Record<string, { count: number; totalScore: number }> = {};
  for (const e of experiments) {
    const h = e.hook_formula ?? 'unknown';
    const s = e.speaker ?? 'unknown';
    if (h !== 'unknown') {
      if (!hookUsage[h]) hookUsage[h] = { count: 0, totalScore: 0 };
      hookUsage[h].count++;
      if (e.partial_viral_score != null) hookUsage[h].totalScore += e.partial_viral_score;
    }
    if (s !== 'unknown') {
      if (!speakerUsage[s]) speakerUsage[s] = { count: 0, totalScore: 0 };
      speakerUsage[s].count++;
      if (e.partial_viral_score != null) speakerUsage[s].totalScore += e.partial_viral_score;
    }
  }

  // Find highest-value underexplored hook (high avg, low count)
  const hookRanked = Object.entries(hookUsage)
    .map(([hook, s]) => ({
      hook,
      avg: s.count > 0 ? s.totalScore / s.count : 0,
      count: s.count,
      // Value = avg score * (1 / ln(count+2)) — rewards high avg AND low usage
      value: (s.count > 0 ? s.totalScore / s.count : 0) * (1 / Math.log(s.count + 2)),
    }))
    .sort((a, b) => b.value - a.value);

  // Find highest-value underexplored speaker
  const speakerRanked = Object.entries(speakerUsage)
    .map(([speaker, s]) => ({
      speaker,
      avg: s.count > 0 ? s.totalScore / s.count : 0,
      count: s.count,
      value: (s.count > 0 ? s.totalScore / s.count : 0) * (1 / Math.log(s.count + 2)),
    }))
    .sort((a, b) => b.value - a.value);

  // Trending topic
  let topic = 'general trend';
  try {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json'), 'utf-8'));
    const topics: string[] = data.topics ?? [];
    if (topics.length > 0) topic = topics[0];
  } catch { /* ignore */ }

  // Find untested combinations (hook × speaker)
  const combos = new Set(experiments
    .filter((e: any) => e.hook_formula && e.hook_formula !== 'unknown' && e.speaker && e.speaker !== 'unknown')
    .map((e: any) => `${e.hook_formula}|${e.speaker}`));
  const allHooks = Object.keys(hookUsage);
  const allSpeakers = Object.keys(speakerUsage);
  const untested: string[] = [];
  for (const h of allHooks) {
    for (const s of allSpeakers) {
      if (!combos.has(`${h}|${s}`)) untested.push(`${h} + ${s}`);
    }
  }

  const bestHook = hookRanked[0];
  const bestSpeaker = speakerRanked[0];
  const opener = HOOK_OPENERS[bestHook?.hook ?? ''] ?? '"Did you know..."';

  const lines = [
    '💡 *Content Suggestion*',
    `Based on ${experiments.length} experiments`,
    '',
    '🎯 *Recommended Next Video:*',
    '',
    `📌 *Topic:* ${topic}`,
    `🪝 *Hook:* ${bestHook?.hook ?? '?'} — ${Math.round((bestHook?.avg ?? 0) * 100)}% avg, ${bestHook?.count ?? 0} samples`,
    `   (high value: strong performance + room for more data)`,
    `💬 *Opener:* ${opener}`,
    `🎤 *Speaker:* ${bestSpeaker?.speaker ?? '?'} — ${Math.round((bestSpeaker?.avg ?? 0) * 100)}% avg, ${bestSpeaker?.count ?? 0} samples`,
    '',
  ];

  if (untested.length > 0) {
    lines.push(`🧪 *Untested combos* (${untested.length} remaining):`);
    untested.slice(0, 3).forEach(c => lines.push(`  • ${c}`));
    if (untested.length > 3) lines.push(`  • ...and ${untested.length - 3} more`);
    lines.push('');
  }

  // Hook usage distribution
  lines.push('📊 *Hook usage:*');
  for (const h of hookRanked.slice(0, 5)) {
    const bar = '█'.repeat(Math.min(10, Math.round(h.count / 5))) + '░'.repeat(Math.max(0, 10 - Math.round(h.count / 5)));
    lines.push(`  ${h.hook}: \`${bar}\` ${h.count}`);
  }

  lines.push('');
  lines.push('→ /filmkit for full filming brief');
  lines.push('→ /compare to compare options');

  return lines.join('\n');
}

export function cmdCompare(args: string): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  if (experiments.length === 0) return '⚠️ No experiments found.';

  // Parse: /compare hook curiosity_gap vs contrarian
  // Or:    /compare speaker alice vs bob
  const parts = args.toLowerCase().trim().split(/\s+/);
  if (parts.length < 4 || !parts.includes('vs')) {
    return (
      '📊 *Compare — A/B Comparison Tool*\n\n' +
      '*Usage:*\n' +
      '`/compare hook curiosity_gap vs contrarian`\n' +
      '`/compare speaker alice vs bob`\n\n' +
      '*Available hooks:* ' + Array.from(new Set(experiments.map((e: any) => e.hook_formula).filter((h: any) => h && h !== 'unknown'))).join(', ') + '\n' +
      '*Available speakers:* ' + Array.from(new Set(experiments.map((e: any) => e.speaker).filter((s: any) => s && s !== 'unknown'))).join(', ')
    );
  }

  const dimension = parts[0]; // 'hook' or 'speaker'
  const vsIdx = parts.indexOf('vs');
  const nameA = parts.slice(1, vsIdx).join('_');
  const nameB = parts.slice(vsIdx + 1).join('_');

  if (dimension !== 'hook' && dimension !== 'speaker') {
    return '⚠️ First word must be `hook` or `speaker`.\nExample: `/compare hook curiosity_gap vs contrarian`';
  }

  const field = dimension === 'hook' ? 'hook_formula' : 'speaker';

  function getStats(name: string) {
    const matching = experiments.filter((e: any) => (e[field] ?? '').toLowerCase() === name);
    const scores = matching.filter((e: any) => e.partial_viral_score != null).map((e: any) => e.partial_viral_score);
    const qcPassed = matching.filter((e: any) => e.qc_passed).length;
    return {
      count: matching.length,
      avg: scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0,
      max: scores.length > 0 ? Math.max(...scores) : 0,
      min: scores.length > 0 ? Math.min(...scores) : 0,
      qcRate: matching.length > 0 ? Math.round((qcPassed / matching.length) * 100) : 0,
      scored: scores.length,
    };
  }

  const a = getStats(nameA);
  const b = getStats(nameB);

  if (a.count === 0 && b.count === 0) return `⚠️ No data found for "${nameA}" or "${nameB}".`;

  const winner = (va: number, vb: number) => va > vb ? '✅' : va < vb ? '  ' : '🟰';

  const lines = [
    `📊 *${dimension === 'hook' ? 'Hook' : 'Speaker'} Comparison*`,
    '',
    `| Metric | *${nameA}* | *${nameB}* |`,
    `|--------|---------|---------|`,
    `| Samples | ${a.count} ${winner(a.count, b.count)} | ${b.count} ${winner(b.count, a.count)} |`,
    `| Avg Viral | ${Math.round(a.avg * 100)}% ${winner(a.avg, b.avg)} | ${Math.round(b.avg * 100)}% ${winner(b.avg, a.avg)} |`,
    `| Max Viral | ${Math.round(a.max * 100)}% ${winner(a.max, b.max)} | ${Math.round(b.max * 100)}% ${winner(b.max, a.max)} |`,
    `| QC Pass | ${a.qcRate}% ${winner(a.qcRate, b.qcRate)} | ${b.qcRate}% ${winner(b.qcRate, a.qcRate)} |`,
    '',
  ];

  // Verdict
  const aScore = a.avg * 0.6 + (a.qcRate / 100) * 0.2 + (a.count > b.count ? 0.2 : 0);
  const bScore = b.avg * 0.6 + (b.qcRate / 100) * 0.2 + (b.count > a.count ? 0.2 : 0);
  if (a.count === 0) lines.push(`🏆 *Winner: ${nameB}* (no data for ${nameA})`);
  else if (b.count === 0) lines.push(`🏆 *Winner: ${nameA}* (no data for ${nameB})`);
  else if (aScore > bScore) lines.push(`🏆 *Winner: ${nameA}* — higher weighted score`);
  else if (bScore > aScore) lines.push(`🏆 *Winner: ${nameB}* — higher weighted score`);
  else lines.push('🟰 *Tie* — both perform equally');

  if (Math.abs(a.count - b.count) > 10) {
    lines.push('');
    lines.push('⚠️ Sample sizes differ significantly — results may not be reliable');
  }

  return lines.join('\n');
}

export function cmdScorecard(): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  if (experiments.length === 0) return '⚠️ No experiments found — run /refresh first.';

  // 1. Hook diversity (more unique hooks = better, target 4+)
  const hooks = new Set(experiments.map((e: any) => e.hook_formula).filter((h: any) => h && h !== 'unknown'));
  const hookScore = Math.min(100, Math.round((hooks.size / 4) * 100));
  const hookGrade = hookScore >= 80 ? 'A' : hookScore >= 60 ? 'B' : hookScore >= 40 ? 'C' : 'D';

  // 2. Speaker variety (more speakers = better, target 3+)
  const speakers = new Set(experiments.map((e: any) => e.speaker).filter((s: any) => s && s !== 'unknown'));
  const speakerScore = Math.min(100, Math.round((speakers.size / 3) * 100));
  const speakerGrade = speakerScore >= 80 ? 'A' : speakerScore >= 60 ? 'B' : speakerScore >= 40 ? 'C' : 'D';

  // 3. Viral score trend (avg of last 20 vs first 20)
  const scored = experiments.filter((e: any) => e.partial_viral_score != null);
  let trendScore = 50;
  let trendDir = '→';
  if (scored.length >= 20) {
    const first20 = scored.slice(0, 20);
    const last20 = scored.slice(-20);
    const avgFirst = first20.reduce((s: number, e: any) => s + e.partial_viral_score, 0) / 20;
    const avgLast = last20.reduce((s: number, e: any) => s + e.partial_viral_score, 0) / 20;
    const improvement = avgLast - avgFirst;
    trendScore = Math.min(100, Math.max(0, 50 + Math.round(improvement * 200)));
    trendDir = improvement > 0.05 ? '↑' : improvement < -0.05 ? '↓' : '→';
  }
  const trendGrade = trendScore >= 80 ? 'A' : trendScore >= 60 ? 'B' : trendScore >= 40 ? 'C' : 'D';

  // 4. QC pass rate
  const qcPassed = experiments.filter((e: any) => e.qc_passed).length;
  const qcRate = experiments.length > 0 ? Math.round((qcPassed / experiments.length) * 100) : 0;
  const qcGrade = qcRate >= 80 ? 'A' : qcRate >= 60 ? 'B' : qcRate >= 40 ? 'C' : 'D';

  // 5. Pipeline output rate (experiments per day over last 7 days)
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const recentExps = experiments.filter((e: any) => (e.timestamp ?? '').slice(0, 10) >= weekAgo);
  const dailyRate = recentExps.length / 7;
  const outputScore = Math.min(100, Math.round((dailyRate / 10) * 100)); // target 10/day
  const outputGrade = outputScore >= 80 ? 'A' : outputScore >= 60 ? 'B' : outputScore >= 40 ? 'C' : 'D';

  // Overall
  const overall = Math.round((hookScore + speakerScore + trendScore + qcRate + outputScore) / 5);
  const overallGrade = overall >= 80 ? 'A' : overall >= 60 ? 'B' : overall >= 40 ? 'C' : 'D';

  const gradeIcon = (g: string) => g === 'A' ? '🟢' : g === 'B' ? '🟡' : g === 'C' ? '🟠' : '🔴';

  const lines = [
    '📊 *Content Strategy Scorecard*',
    `${experiments.length} experiments analyzed`,
    '',
    `${gradeIcon(overallGrade)} *Overall: ${overallGrade}* (${overall}%)`,
    '',
    `${gradeIcon(hookGrade)} Hook Diversity: *${hookGrade}* — ${hooks.size} hooks (${hookScore}%)`,
    `${gradeIcon(speakerGrade)} Speaker Variety: *${speakerGrade}* — ${speakers.size} speakers (${speakerScore}%)`,
    `${gradeIcon(trendGrade)} Viral Trend: *${trendGrade}* — ${trendDir} (${trendScore}%)`,
    `${gradeIcon(qcGrade)} QC Pass Rate: *${qcGrade}* — ${qcRate}% pass`,
    `${gradeIcon(outputGrade)} Output Rate: *${outputGrade}* — ${dailyRate.toFixed(1)}/day (${outputScore}%)`,
    '',
  ];

  // Recommendations
  const recs: string[] = [];
  if (hookScore < 60) recs.push('• Try new hook formulas: curiosity\\_gap, contrarian, secret');
  if (speakerScore < 60) recs.push('• Add more speakers to A/B test');
  if (trendScore < 50) recs.push('• Viral scores declining — review /hooktest for top formulas');
  if (qcRate < 70) recs.push('• QC rate low — check video quality settings');
  if (outputScore < 40) recs.push('• Pipeline output low — run /refresh more often');
  if (recs.length > 0) {
    lines.push('💡 *Recommendations:*');
    recs.forEach(r => lines.push(r));
  } else {
    lines.push('✅ All metrics look healthy!');
  }

  return lines.join('\n');
}

export function cmdProgress(): string {
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const now = new Date();
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const totalPosts = posts.length;
  const target = 30;
  const postsNeeded = Math.max(0, target - totalPosts);
  const pct = Math.min(100, Math.round((totalPosts / target) * 100));

  // Visual progress bar (20 chars wide)
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);

  // Daily posting history (last 7 days)
  const dailyCounts: Record<string, number> = {};
  for (const p of posts) {
    const d = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    if (d) dailyCounts[d] = (dailyCounts[d] ?? 0) + 1;
  }

  // Streak calculation
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    if ((dailyCounts[d] ?? 0) > 0) streak++;
    else break;
  }

  // Total views
  const totalViews = posts.reduce((sum: number, p: any) => sum + (p.views ?? 0), 0);

  // Urgency level
  let urgency: string;
  const pacePerDay = daysLeft > 0 ? postsNeeded / daysLeft : postsNeeded;
  if (postsNeeded === 0) urgency = '✅ GATE MET';
  else if (pacePerDay <= 1) urgency = '🟢 On track';
  else if (pacePerDay <= 2) urgency = '🟡 Needs attention';
  else if (pacePerDay <= 3) urgency = '🟠 Behind pace';
  else urgency = '🔴 CRITICAL';

  const lines = [
    '📊 *Gate Progress — 30 Posts by Apr 7*',
    '',
    `\`[${bar}]\` ${pct}%`,
    `*${totalPosts}/${target}* posted · ${postsNeeded} remaining · ${daysLeft} days`,
    '',
    `📈 Status: ${urgency}`,
    `🎯 Required pace: *${pacePerDay.toFixed(1)} posts/day*`,
    `🔥 Current streak: *${streak} days*`,
    `👁️ Total views: *${totalViews.toLocaleString()}*`,
    '',
    '*Last 7 days:*',
  ];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000);
    const dateStr = date.toISOString().slice(0, 10);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
    const count = dailyCounts[dateStr] ?? 0;
    const dots = count > 0 ? '●'.repeat(count) : '·';
    const isToday = i === 0 ? ' ←' : '';
    lines.push(`  ${dayName} ${dateStr.slice(5)}: ${dots} (${count})${isToday}`);
  }

  lines.push('');
  if (postsNeeded > 0) {
    lines.push('→ /filmkit for your next video brief');
    lines.push('→ /record after posting');
  } else {
    lines.push('🎉 Gate target reached! Keep posting for momentum.');
  }

  return lines.join('\n');
}

export function cmdCleanup(): string {
  try {
    const { runCleanup, formatCleanupResult } = require('../scs001/cleanup-old-runs');
    const result = runCleanup();
    return formatCleanupResult(result);
  } catch (err: any) {
    return `❌ Cleanup error: ${err.message}`;
  }
}

export function cmdDedup(): string {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const archivedIds = loadArchived();

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && !archivedIds.has(e.video_id));

  if (unposted.length === 0) {
    return '📋 *Dedup* — Queue is empty. Nothing to analyze.';
  }

  // Load content calendar for topic data
  const calPath = path.join(ROOT, 'workspace', 'scs001', 'content-calendar.json');
  const topicMap = new Map<string, string>();
  if (fs.existsSync(calPath)) {
    try {
      const cal = JSON.parse(fs.readFileSync(calPath, 'utf-8'));
      for (const videos of Object.values(cal.schedule ?? {})) {
        for (const v of videos as any[]) {
          if (v.video_id && v.topic) topicMap.set(v.video_id, v.topic);
        }
      }
    } catch { /* skip */ }
  }

  // Load experiment data for speaker + hook
  const speakers = new Map<string, string>();
  const hooks = new Map<string, string>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    try {
      for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id) {
            if (e.speaker) speakers.set(id, e.speaker);
            if (e.hook_formula) hooks.set(id, e.hook_formula);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Speaker distribution
  const speakerCounts: Record<string, number> = {};
  for (const e of unposted) {
    const s = speakers.get(e.video_id) ?? 'unknown';
    speakerCounts[s] = (speakerCounts[s] ?? 0) + 1;
  }
  const speakerEntries = Object.entries(speakerCounts).sort((a, b) => b[1] - a[1]);

  // Hook distribution
  const hookCounts: Record<string, number> = {};
  for (const e of unposted) {
    const h = hooks.get(e.video_id) ?? 'unknown';
    hookCounts[h] = (hookCounts[h] ?? 0) + 1;
  }
  const hookEntries = Object.entries(hookCounts).sort((a, b) => b[1] - a[1]);

  // Topic similarity groups (simple: group by first 30 chars of topic)
  const topicGroups: Record<string, string[]> = {};
  for (const e of unposted) {
    const topic = topicMap.get(e.video_id);
    if (topic) {
      const key = topic.slice(0, 30).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (!topicGroups[key]) topicGroups[key] = [];
      topicGroups[key].push(e.video_id);
    }
  }
  const dupeGroups = Object.entries(topicGroups).filter(([, ids]) => ids.length > 1).sort((a, b) => b[1].length - a[1].length);

  // Diversity score (0-100): penalize if top speaker > 50% or dupe groups > 30%
  const topSpeakerPct = speakerEntries.length > 0 ? (speakerEntries[0][1] / unposted.length) * 100 : 0;
  const dupePct = dupeGroups.reduce((s, [, ids]) => s + ids.length, 0) / Math.max(1, unposted.length) * 100;
  const diversity = Math.max(0, Math.round(100 - topSpeakerPct * 0.5 - dupePct * 0.5));

  const lines: string[] = [
    `🔍 *Content Dedup Scanner*`,
    '',
    `📦 Queue: *${unposted.length}* videos · Diversity: *${diversity}%*`,
    '',
    `*Speaker Distribution:*`,
  ];

  for (const [name, count] of speakerEntries.slice(0, 5)) {
    const pct = Math.round((count / unposted.length) * 100);
    const warn = pct > 40 ? ' ⚠️' : '';
    lines.push(`  ${name}: ${count} (${pct}%)${warn}`);
  }
  if (speakerEntries.length > 5) lines.push(`  _+${speakerEntries.length - 5} more..._`);

  lines.push('');
  lines.push(`*Hook Formula Distribution:*`);
  for (const [name, count] of hookEntries.slice(0, 5)) {
    const pct = Math.round((count / unposted.length) * 100);
    const warn = pct > 50 ? ' ⚠️' : '';
    lines.push(`  ${name}: ${count} (${pct}%)${warn}`);
  }

  if (dupeGroups.length > 0) {
    lines.push('');
    lines.push(`*⚠️ Similar Topics (${dupeGroups.length} groups):*`);
    for (const [key, ids] of dupeGroups.slice(0, 3)) {
      lines.push(`  "${key}..." — ${ids.length} videos`);
      lines.push(`  → Archive ${ids.length - 1}: \`/archive ${ids.slice(1).join(' ')}\``);
    }
  } else {
    lines.push('');
    lines.push('✅ No duplicate topics detected.');
  }

  lines.push('');
  lines.push(`_Post diverse content for better TikTok reach._`);

  return lines.join('\n');
}

export function cmdTop30(): string {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const archivedIds = loadArchived();

  // Load experiment data
  const viralScores = new Map<string, number>();
  const speakerMap = new Map<string, string>();
  const hookMap = new Map<string, string>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    try {
      for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id) {
            if (e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
            if (e.speaker) speakerMap.set(id, e.speaker);
            if (e.hook_formula) hookMap.set(id, e.hook_formula);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Get unposted videos with mp4 on disk
  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && !archivedIds.has(e.video_id))
    .filter((e: any) => findCaptionedMp4(e.video_id) !== null)
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

  if (unposted.length === 0) {
    return '📋 *Top 30* — No ready-to-post videos found.';
  }

  const TARGET = 30 - recorded.length;
  if (TARGET <= 0) {
    return '✅ *Gate target already met!* ' + recorded.length + '/30 posts recorded.';
  }

  // Diversity-aware greedy selection
  const selected: Array<{ video_id: string; score: number; speaker: string; hook: string }> = [];
  const usedSpeakers = new Map<string, number>(); // speaker → count
  const usedHooks = new Map<string, number>();
  const MAX_PER_SPEAKER = Math.max(3, Math.ceil(TARGET / 5)); // at most ~20% per speaker

  for (const e of unposted) {
    if (selected.length >= TARGET) break;
    const vid = e.video_id;
    const speaker = (speakerMap.get(vid) ?? 'unknown').toLowerCase();
    const hook = (hookMap.get(vid) ?? 'unknown').toLowerCase();
    const speakerCount = usedSpeakers.get(speaker) ?? 0;

    // Enforce speaker diversity cap
    if (speakerCount >= MAX_PER_SPEAKER && speaker !== 'unknown') continue;

    selected.push({
      video_id: vid,
      score: viralScores.get(vid) ?? 0,
      speaker: speakerMap.get(vid) ?? 'unknown',
      hook: hookMap.get(vid) ?? 'unknown',
    });
    usedSpeakers.set(speaker, speakerCount + 1);
    usedHooks.set(hook, (usedHooks.get(hook) ?? 0) + 1);
  }

  // Stats
  const avgScore = selected.length > 0 ? selected.reduce((s, v) => s + v.score, 0) / selected.length : 0;
  const uniqueSpeakers = new Set(selected.map(v => v.speaker.toLowerCase())).size;
  const uniqueHooks = new Set(selected.map(v => v.hook.toLowerCase())).size;

  const lines: string[] = [
    `🏆 *Top ${selected.length} Videos — Optimized for Gate*`,
    '',
    `📊 Avg viral score: *${avgScore.toFixed(2)}*`,
    `🎙️ Speakers: *${uniqueSpeakers}* unique`,
    `🎣 Hooks: *${uniqueHooks}* unique`,
    `📦 From: ${unposted.length} available`,
    '',
  ];

  // Show top 10 with details
  const showCount = Math.min(10, selected.length);
  for (let i = 0; i < showCount; i++) {
    const v = selected[i];
    lines.push(`${i + 1}. \`${v.video_id}\` 🧬${v.score} · ${v.speaker} · ${v.hook}`);
  }
  if (selected.length > showCount) {
    lines.push(`_... and ${selected.length - showCount} more_`);
  }

  lines.push('');
  lines.push(`_Use /pickup to start posting these in order._`);

  return lines.join('\n');
}

export function cmdAbResults(): string {
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));

  if (posts.length === 0) {
    return '📊 *A/B Results* — No posts recorded yet.\n\nStart posting with `/session` or `/deliver`, then check back!';
  }

  const postsWithViews = posts.filter((p: any) => (p.views ?? 0) > 0);
  const totalViews = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const avgViews = posts.length > 0 ? Math.round(totalViews / posts.length) : 0;

  const lines: string[] = [
    '📊 *A/B Content Performance*',
    '',
    `📦 Posts: ${posts.length} · Views: ${totalViews} · Avg: ${avgViews}/post`,
    '',
  ];

  // Speaker analysis
  const speakerStats: Record<string, { views: number; count: number }> = {};
  for (const p of posts) {
    const sp = p.speaker ?? 'unknown';
    if (!speakerStats[sp]) speakerStats[sp] = { views: 0, count: 0 };
    speakerStats[sp].views += p.views ?? 0;
    speakerStats[sp].count++;
  }
  const speakerRank = Object.entries(speakerStats)
    .filter(([k]) => k !== 'unknown')
    .map(([sp, s]) => ({ speaker: sp, avg: s.count > 0 ? Math.round(s.views / s.count) : 0, count: s.count, total: s.views }))
    .sort((a, b) => b.avg - a.avg);

  if (speakerRank.length > 0) {
    lines.push('*🎙️ By Speaker:*');
    for (const s of speakerRank.slice(0, 5)) {
      const medal = s === speakerRank[0] ? '🥇' : s === speakerRank[1] ? '🥈' : s === speakerRank[2] ? '🥉' : '  ';
      lines.push(`${medal} ${s.speaker}: ${s.avg} avg views (${s.count} posts)`);
    }
    lines.push('');
  }

  // Hook formula analysis
  const hookStats: Record<string, { views: number; count: number }> = {};
  for (const p of posts) {
    const h = p.hook_formula ?? 'unknown';
    if (!hookStats[h]) hookStats[h] = { views: 0, count: 0 };
    hookStats[h].views += p.views ?? 0;
    hookStats[h].count++;
  }
  const hookRank = Object.entries(hookStats)
    .filter(([k]) => k !== 'unknown')
    .map(([h, s]) => ({ hook: h, avg: s.count > 0 ? Math.round(s.views / s.count) : 0, count: s.count }))
    .sort((a, b) => b.avg - a.avg);

  if (hookRank.length > 0) {
    lines.push('*🎣 By Hook Formula:*');
    for (const h of hookRank.slice(0, 5)) {
      const medal = h === hookRank[0] ? '🥇' : h === hookRank[1] ? '🥈' : h === hookRank[2] ? '🥉' : '  ';
      lines.push(`${medal} ${h.hook}: ${h.avg} avg views (${h.count} posts)`);
    }
    lines.push('');
  }

  // Topic analysis
  const topicStats: Record<string, { views: number; count: number }> = {};
  for (const p of posts) {
    const t = p.topic ?? 'unknown';
    if (!topicStats[t]) topicStats[t] = { views: 0, count: 0 };
    topicStats[t].views += p.views ?? 0;
    topicStats[t].count++;
  }
  const topicRank = Object.entries(topicStats)
    .filter(([k]) => k !== 'unknown')
    .map(([t, s]) => ({ topic: t, avg: s.count > 0 ? Math.round(s.views / s.count) : 0, count: s.count }))
    .sort((a, b) => b.avg - a.avg);

  if (topicRank.length > 0) {
    lines.push('*📝 By Topic:*');
    for (const t of topicRank.slice(0, 5)) {
      lines.push(`  ${t.topic}: ${t.avg} avg views (${t.count} posts)`);
    }
    lines.push('');
  }

  // Best single post
  const bestPost = posts.reduce((best: any, p: any) => (p.views ?? 0) > (best.views ?? 0) ? p : best, posts[0]);
  if (bestPost && (bestPost.views ?? 0) > 0) {
    lines.push(`🏆 *Best post:* \`${bestPost.video_id}\` — ${bestPost.views} views`);
    if (bestPost.speaker) lines.push(`   🎙️ ${bestPost.speaker} · 🎣 ${bestPost.hook_formula ?? 'unknown'}`);
  }

  if (postsWithViews.length === 0) {
    lines.push('');
    lines.push('⚠️ _No view data yet. Update views with_ `/updateviews <id> <views>`');
  }

  lines.push('');
  lines.push('_Post more + update views to get better insights!_');

  return lines.join('\n');
}

export function cmdStatus(): string {
  const allPosts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const posts = readRealPosts();
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recordedIds = new Set(allPosts.map((e: any) => e.video_id).filter(Boolean));
  const archivedIds = loadArchived();

  // Gate stats
  const now = new Date();
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const totalPosts = posts.length;
  const target = 30;
  const postsNeeded = Math.max(0, target - totalPosts);
  const pct = Math.min(100, Math.round((totalPosts / target) * 100));

  // Progress bar
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);

  // Total views
  const totalViews = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);

  // Queue stats
  const viralScores = new Map<string, number>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    try {
      for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && !archivedIds.has(e.video_id));
  const readyCount = unposted.filter((e: any) => findCaptionedMp4(e.video_id) !== null).length;

  // Streak
  const dailyCounts: Record<string, number> = {};
  for (const p of posts) {
    const d = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    if (d) dailyCounts[d] = (dailyCounts[d] ?? 0) + 1;
  }
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    if ((dailyCounts[d] ?? 0) > 0) streak++;
    else break;
  }

  // Sprint 1090: days since last post when streak = 0
  let daysSinceLastPost = 0;
  if (streak === 0 && posts.length > 0) {
    const lastDate = Object.keys(dailyCounts).sort().slice(-1)[0];
    if (lastDate) {
      daysSinceLastPost = Math.round((now.getTime() - new Date(lastDate).getTime()) / 86_400_000);
    }
  }

  // Today's posts
  const today = now.toISOString().slice(0, 10);
  const todayPosts = dailyCounts[today] ?? 0;

  // Pace
  const paceNeeded = daysLeft > 0 ? postsNeeded / daysLeft : postsNeeded;
  const dailyObligation = Math.ceil(paceNeeded);

  // Urgency indicator
  let urgency: string;
  if (postsNeeded === 0) urgency = '✅ GATE MET';
  else if (paceNeeded <= 1) urgency = '🟢 On track';
  else if (paceNeeded <= 2) urgency = '🟡 Needs attention';
  else if (paceNeeded <= 3) urgency = '🟠 Behind pace';
  else urgency = '🔴 CRITICAL';

  // Next video preview
  const sortedUnposted = unposted
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));
  const nextReady = sortedUnposted.find((e: any) => findCaptionedMp4(e.video_id) !== null);
  let nextLine = '⚠️ No videos ready — run /refresh';
  if (nextReady) {
    const vs = viralScores.get(nextReady.video_id);
    const vsStr = vs != null ? ` · 🧬${vs}` : '';
    nextLine = `\`${nextReady.video_id}\`${vsStr}`;
  }

  // Sprint 998: Critical cron health check
  // Sprint 1021: count stopped/launching as healthy — cron jobs are stopped between runs
  const CRITICAL_CRONS = ['telegram-bot', 'kognai-daily-digest', 'kognai-gate-tracker-update', 'kognai-post-noon', 'kognai-post-evening'];
  const PERSISTENT_PROCS = new Set(['telegram-bot']); // must be 'online'; crons are ok if 'stopped'
  let cronLine = '';
  try {
    const procs = getPm2List();
    const registeredNames = new Set(procs.map(p => p.name));
    const onlineNames = new Set(procs.filter(p => p.status === 'online').map(p => p.name));
    const downCrons = CRITICAL_CRONS.filter(n => {
      if (!registeredNames.has(n)) return true; // not in PM2 at all
      if (PERSISTENT_PROCS.has(n)) return !onlineNames.has(n); // persistent must be online
      return false; // cron jobs: registered = healthy
    });
    if (downCrons.length === 0) {
      cronLine = `⚙️ Crons: *${CRITICAL_CRONS.length}/${CRITICAL_CRONS.length}* critical registered`;
    } else {
      cronLine = `⚠️ Crons: *${CRITICAL_CRONS.length - downCrons.length}/${CRITICAL_CRONS.length}* — missing: ${downCrons.join(', ')}\n_Run /boot to register_`;
    }
  } catch {
    cronLine = '⚠️ Crons: PM2 not available';
  }

  // Sprint 1036: Launch countdowns
  const godmanDate = new Date('2026-04-14T00:00:00Z');
  const achiriDate = new Date('2026-04-25T00:00:00Z'); // alpha launch target
  const godmanDays = Math.max(0, Math.ceil((godmanDate.getTime() - now.getTime()) / 86_400_000));
  const achiriDays = Math.max(0, Math.ceil((achiriDate.getTime() - now.getTime()) / 86_400_000));
  // Sprint 1079: Add npm login status to Godman countdown
  let npmLoggedIn = false;
  try {
    const whoami = execSync('npm whoami 2>/dev/null', { encoding: 'utf-8', timeout: 3000, stdio: ['pipe','pipe','pipe'] }).trim();
    npmLoggedIn = !!whoami;
  } catch {}
  // Sprint 1144 (wave 25): show if Godman Protocols npm packages are published (declared here — used in godmanLine)
  let godmanNpmLine = '';
  try {
    const godmanPkgs = ['@godman/pact', '@godman/amf', '@godman/signal', '@godman/soul', '@godman/score', '@godman/lax', '@godman/drs', '@godman/sdk'];
    let publishedCount = 0;
    for (const pkg of godmanPkgs) {
      try {
        execSync(`npm view ${pkg} version 2>/dev/null`, { timeout: 5000, encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] });
        publishedCount++;
      } catch { /* not published */ }
    }
    godmanNpmLine = ` · 📦 ${publishedCount}/${godmanPkgs.length} pkgs published`;
  } catch { /* skip */ }
  const godmanLine = `🚀 Godman launch: *${godmanDays}d* — ${npmLoggedIn ? '✅ npm ready' : '❌ npm login needed'} · /godman${godmanNpmLine}`;
  // Sprint 1144 (wave 22): Achiri readiness score from achiri-readiness.json
  let achiriReadinessStr2 = '';
  try {
    const rPath2 = path.join(ROOT, 'reports', 'achiri-readiness.json');
    if (fs.existsSync(rPath2)) {
      const rData2 = JSON.parse(fs.readFileSync(rPath2, 'utf-8'));
      const score2 = rData2.score ?? rData2.readiness_score;
      if (score2 != null) {
        const rIcon2 = score2 >= 90 ? '✅' : score2 >= 70 ? '⚠️' : '❌';
        achiriReadinessStr2 = ` · ${rIcon2} ${score2}% ready`;
      }
    }
  } catch { /* skip */ }
  const achiriLine = `🤖 Achiri alpha: *${achiriDays}d*${achiriReadinessStr2} — /achiri`;

  // Sprint 1136 (wave 26): show pending Achiri waitlist request count
  let waitlistCountLine = '';
  try {
    const waitlistPath = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
    const whitelistPath = path.join(ROOT, 'workspace', 'achiri', 'user-premium.jsonl');
    if (fs.existsSync(waitlistPath)) {
      const waitlistEntries = fs.readFileSync(waitlistPath, 'utf-8').trim().split('\n').filter(Boolean);
      let whitelistedIds = new Set<string>();
      if (fs.existsSync(whitelistPath)) {
        for (const l of fs.readFileSync(whitelistPath, 'utf-8').trim().split('\n').filter(Boolean)) {
          try { const e = JSON.parse(l); if (e.user_id ?? e.userId ?? e.id) whitelistedIds.add(String(e.user_id ?? e.userId ?? e.id)); } catch {}
        }
      }
      const pendingWaitlist = waitlistEntries.filter(l => {
        try { const e = JSON.parse(l); const uid = String(e.user_id ?? e.userId ?? e.id ?? ''); return uid && !whitelistedIds.has(uid); } catch { return false; }
      });
      if (pendingWaitlist.length > 0) {
        const wlIcon = pendingWaitlist.length >= 10 ? '🔥' : pendingWaitlist.length >= 5 ? '📋' : '👤';
        waitlistCountLine = `\n${wlIcon} *Achiri waitlist:* ${pendingWaitlist.length} pending approval`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1144 (wave 26): show count of unread Telegram bot messages (backlog)
  let unreadBotLine = '';
  try {
    const offsetPath = path.join(ROOT, 'data', 'telegram-bot-offset.txt');
    const botOutLogPath = path.join(ROOT, 'logs', 'telegram-bot-out.log');
    // Check if there's a queue of unprocessed messages by looking at offset vs latest update
    if (fs.existsSync(botOutLogPath)) {
      const logStat = fs.statSync(botOutLogPath);
      const logAgeMin = (Date.now() - logStat.mtimeMs) / 60000;
      const logLines = fs.readFileSync(botOutLogPath, 'utf-8').split('\n').filter(Boolean);
      const recentQueueLines = logLines.filter(l => l.toLowerCase().includes('queued') || l.toLowerCase().includes('pending') || l.toLowerCase().includes('backlog'));
      if (recentQueueLines.length > 0) {
        const numMatch = recentQueueLines[recentQueueLines.length - 1].match(/\d+/);
        const count = numMatch ? parseInt(numMatch[0]) : recentQueueLines.length;
        const qIcon = count >= 10 ? '🔴' : count >= 3 ? '⚠️' : '📨';
        unreadBotLine = `\n${qIcon} *Bot backlog:* ${count} messages queued`;
      } else if (logAgeMin > 60) {
        unreadBotLine = `\n⚠️ *Bot log:* last activity ${Math.round(logAgeMin)}m ago`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1060: Watchdog alerts
  let watchdogLine = '';
  try {
    const wdPath = path.join(ROOT, 'reports', 'watchdog-latest.json');
    if (fs.existsSync(wdPath)) {
      const wd = JSON.parse(fs.readFileSync(wdPath, 'utf-8'));
      const critical = wd.critical_count ?? 0;
      const warning = wd.warning_count ?? 0;
      if (critical > 0) {
        const critAlerts = (wd.alerts ?? []).filter((a: any) => a.severity === 'critical').slice(0, 2)
          .map((a: any) => a.title).join(', ');
        watchdogLine = `🚨 Watchdog: *${critical}* critical — ${critAlerts} · /health`;
      } else if (warning > 0) {
        watchdogLine = `⚠️ Watchdog: *${warning}* warning(s) · /health for details`;
      } else {
        watchdogLine = `🔭 Watchdog: all clear`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1057: Trust score health check
  const TRUST_THRESHOLD = 60; // scores are 0-100; flag below 60
  let trustLine = '';
  try {
    const trustPath = path.join(ROOT, 'acp', 'trust-scores.json');
    if (fs.existsSync(trustPath)) {
      const trustData = JSON.parse(fs.readFileSync(trustPath, 'utf-8'));
      const scores: Record<string, any> = trustData.scores ?? {};
      const lowTrust = Object.entries(scores)
        .filter(([, s]: [string, any]) => typeof s.composite === 'number' && s.composite < TRUST_THRESHOLD)
        .map(([name, s]: [string, any]) => `${name}(${s.composite})`);
      if (lowTrust.length === 0) {
        const agentCount = Object.keys(scores).length;
        trustLine = `🛡 Trust: *${agentCount}/${agentCount}* agents ≥${TRUST_THRESHOLD} — healthy`;
      } else {
        trustLine = `⚠️ Trust: *${lowTrust.length}* agent${lowTrust.length > 1 ? 's' : ''} below ${TRUST_THRESHOLD}: ${lowTrust.slice(0, 3).join(', ')}`;
      }
    }
  } catch { /* skip if unreadable */ }

  // Sprint 1114: last pipeline run timestamp
  let pipelineLine = '';
  try {
    const pRunPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
    if (fs.existsSync(pRunPath)) {
      const pRun = JSON.parse(fs.readFileSync(pRunPath, 'utf-8'));
      const ts = pRun.completed_at ?? pRun.started_at;
      if (ts) {
        const ageH = (Date.now() - new Date(ts).getTime()) / 3600000;
        const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : `${Math.round(ageH)}h ago`;
        const stale = ageH > 25 ? ' ⚠️ stale' : '';
        pipelineLine = `🎬 Pipeline: last run *${ageStr}*${stale}`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1081: Smoke test status line
  let smokeLine = '';
  try {
    const smokePath = path.join(ROOT, 'reports', 'smoke-test-latest.json');
    if (fs.existsSync(smokePath)) {
      const smoke = JSON.parse(fs.readFileSync(smokePath, 'utf-8'));
      const pass = smoke.passed ?? smoke.pass ?? smoke.status === 'pass';
      const fail = smoke.failed ?? smoke.fail ?? smoke.failures?.length ?? 0;
      // Sprint 1131 (wave 14): show smoke test age
      let ageStr = '';
      const smokeTs = smoke.timestamp ? new Date(smoke.timestamp).getTime() : 0;
      if (smokeTs > 0) {
        const ageH = (Date.now() - smokeTs) / 3600000;
        ageStr = ` · ${ageH < 1 ? `${Math.round(ageH * 60)}m ago` : `${Math.round(ageH)}h ago`}`;
        if (ageH > 24) ageStr += ' ⚠️ stale';
      }
      if (pass && fail === 0) {
        smokeLine = `🧪 Smoke: ✅ clean${ageStr}`;
      } else {
        smokeLine = `🧪 Smoke: ❌ ${fail} failing${ageStr} · /smoke`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1119: gate ETA — project date when posts will hit 30 at current pace
  let gateEtaStr = '';
  if (postsNeeded > 0 && posts.length > 1) {
    const dates = posts
      .map((p: any) => new Date(p.posted_at ?? p.recorded_at))
      .filter((d: Date) => !isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    if (dates.length > 1) {
      const daysSinceFirst = Math.max(1, (now.getTime() - dates[0].getTime()) / 86_400_000);
      const actualPace = posts.length / daysSinceFirst;
      if (actualPace > 0) {
        const daysToComplete = Math.ceil(postsNeeded / actualPace);
        const etaDate = new Date(now.getTime() + daysToComplete * 86_400_000);
        const missed = etaDate > GATE_DATE;
        gateEtaStr = ` · ETA: ${missed ? '⚠️' : ''}${etaDate.toISOString().slice(0, 10)}`;
      }
    }
  }

  // Sprint 1119 (wave 12): time since last post for queue line
  let lastPostAge = '';
  if (posts.length > 0) {
    const lastTs = posts
      .map((p: any) => new Date(p.posted_at ?? p.recorded_at).getTime())
      .filter((t: number) => !isNaN(t))
      .reduce((a: number, b: number) => Math.max(a, b), 0);
    if (lastTs > 0) {
      const ageH = (now.getTime() - lastTs) / 3600000;
      lastPostAge = ageH < 1
        ? ` · last: ${Math.round(ageH * 60)}m ago`
        : ageH < 24
          ? ` · last: ${Math.round(ageH)}h ago`
          : ` · last: ${Math.round(ageH / 24)}d ago`;
    }
  }

  // Sprint 1101: views progress bar
  const viewPct = Math.min(100, Math.round((totalViews / 500) * 100));
  const viewFilled = Math.round(viewPct / 5);
  const viewBar = '█'.repeat(viewFilled) + '░'.repeat(20 - viewFilled);

  // Sprint 1144 (wave 23): sprint queue empty warning (declared here — used in activeSprintStr below)
  let queueEmptyWarning = '';
  try {
    const qPathEW = path.join(ROOT, 'workspace', 'sprint-queue.json');
    if (fs.existsSync(qPathEW)) {
      const qEW = JSON.parse(fs.readFileSync(qPathEW, 'utf-8'));
      const pendingCountEW = (qEW.queue ?? []).filter((i: any) => i.status === 'pending').length;
      if (pendingCountEW === 0) {
        queueEmptyWarning = ` ⚠️ queue empty — /replenish`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1136 (wave 17): active sprint number from sprint-queue.json
  let activeSprintStr = '';
  try {
    const qPath = path.join(ROOT, 'workspace', 'sprint-queue.json');
    if (fs.existsSync(qPath)) {
      const q = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
      const pending = (q.queue ?? []).filter((i: any) => i.status === 'pending');
      const lastDone = (q.queue ?? []).filter((i: any) => i.status === 'done').slice(-1)[0];
      const nextSprint = pending[0]?.sprint ?? lastDone?.sprint;
      if (nextSprint) activeSprintStr = ` · Sprint *#${nextSprint}*${queueEmptyWarning}`;
    }
  } catch { /* skip */ }

  // Sprint 1137 (wave 18): .env modified today alert
  let envAlertStr = '';
  try {
    const envPath = path.join(ROOT, '.env');
    if (fs.existsSync(envPath)) {
      const stat = fs.statSync(envPath);
      const ageH = (Date.now() - stat.mtimeMs) / 3600000;
      if (ageH < 24) {
        envAlertStr = ` · ⚠️ .env modified ${ageH < 1 ? `${Math.round(ageH * 60)}m` : `${Math.round(ageH)}h`} ago`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1141 (wave 21): best hook type by avg views
  let bestHookLine = '';
  try {
    const hookViews = new Map<string, { total: number; count: number }>();
    for (const p of posts as any[]) {
      const hook = p.hook_formula ?? p.hook_type;
      if (!hook) continue;
      const v = p.views ?? 0;
      const cur = hookViews.get(hook) ?? { total: 0, count: 0 };
      hookViews.set(hook, { total: cur.total + v, count: cur.count + 1 });
    }
    const ranked = Array.from(hookViews.entries())
      .filter(([, d]) => d.count >= 2)
      .map(([hook, d]) => ({ hook, avg: d.total / d.count, count: d.count }))
      .sort((a, b) => b.avg - a.avg);
    if (ranked.length > 0) {
      const best = ranked[0];
      bestHookLine = `\n🎯 *Best hook:* \`${best.hook}\` — avg ${best.avg.toFixed(0)} views (${best.count} posts)`;
    }
  } catch { /* skip */ }

  // Sprint 1136 (wave 23): views-per-post trend (last 5 vs prior 5)
  let viewsTrendLine = '';
  try {
    if (posts.length >= 4) {
      const sortedPosts = [...posts as any[]].sort((a: any, b: any) =>
        new Date(b.posted_at ?? b.recorded_at).getTime() - new Date(a.posted_at ?? a.recorded_at).getTime()
      );
      const last5 = sortedPosts.slice(0, 5);
      const prior5 = sortedPosts.slice(5, 10);
      const last5Avg = last5.reduce((s: number, p: any) => s + (p.views ?? 0), 0) / last5.length;
      if (prior5.length >= 2) {
        const prior5Avg = prior5.reduce((s: number, p: any) => s + (p.views ?? 0), 0) / prior5.length;
        const trendIcon = last5Avg > prior5Avg * 1.1 ? '📈' : last5Avg < prior5Avg * 0.9 ? '📉' : '➡️';
        viewsTrendLine = `\n${trendIcon} *Views/post:* last 5 = ${last5Avg.toFixed(0)} · prior 5 = ${prior5Avg.toFixed(0)}`;
      } else {
        viewsTrendLine = `\n📊 *Views/post:* ${last5Avg.toFixed(0)} avg (last 5 posts)`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1136 (wave 25): show last 3 error log filenames that spiked today
  let errorSpikeLine = '';
  try {
    const logDir = path.join(ROOT, 'logs');
    const todayMidnightMs2 = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const logFiles = fs.existsSync(logDir) ? fs.readdirSync(logDir).filter((f: string) => f.endsWith('-error.log')) : [];
    const spiked = logFiles
      .map((f: string) => {
        try {
          const stat = fs.statSync(path.join(logDir, f));
          if (stat.mtimeMs < todayMidnightMs2) return null;
          const content = fs.readFileSync(path.join(logDir, f), 'utf-8').trim();
          const count = content.split('\n').filter((l: string) => {
            const lower = l.toLowerCase();
            return lower.includes('error') || lower.includes('fatal') || lower.includes('fail');
          }).length;
          return { name: f.replace('-error.log', ''), count };
        } catch { return null; }
      })
      .filter((x): x is {name: string; count: number} => x !== null && x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    if (spiked.length > 0) {
      errorSpikeLine = `\n⚠️ *Errors today:* ${spiked.map(s => `\`${s.name}\`(${s.count})`).join(' · ')}`;
    }
  } catch { /* skip */ }

  // Sprint 1136 (wave 24): show whether today is a posting obligation day
  let todayObligationLine = '';
  try {
    if (daysLeft > 0 && postsNeeded > 0) {
      const obligationToday = Math.ceil(postsNeeded / daysLeft);
      const remaining = Math.max(0, obligationToday - todayPosts);
      if (remaining > 0) {
        todayObligationLine = `\n📅 *Today:* post *${remaining} more* (${todayPosts}/${obligationToday} done)`;
      } else {
        todayObligationLine = `\n📅 *Today's target met* — ${todayPosts}/${obligationToday} ✅`;
      }
    } else if (postsNeeded === 0) {
      todayObligationLine = `\n📅 *Gate complete* — no posting obligation`;
    }
  } catch { /* skip */ }

  // Sprint 1143 (wave 24): TikTok warmup score from warmup-status.json
  let warmupScoreLine = '';
  try {
    const warmupPath = path.join(ROOT, 'workspace', 'scs001', 'warmup-status.json');
    if (fs.existsSync(warmupPath)) {
      const ws = JSON.parse(fs.readFileSync(warmupPath, 'utf-8'));
      const days = ws.days_active ?? 0;
      const alignment = ws.niche_alignment;
      const verified = ws.verified;
      const warmupIcon = verified ? '✅' : days >= 3 ? '⚠️' : '🔴';
      const alignStr = alignment != null ? ` · align ${alignment}/10` : '';
      warmupScoreLine = `\n🎯 *TikTok warmup:* ${warmupIcon} ${days}d active${alignStr}${verified ? ' — verified' : ''}`;
    }
  } catch { /* skip */ }

  // Sprint 1136 (wave 22): viral score distribution in queue (High/Medium/Low)
  let viralDistLine = '';
  try {
    const HIGH_THRESH = 0.7, MED_THRESH = 0.4;
    let highCount = 0, medCount = 0, lowCount = 0;
    for (const e of unposted as any[]) {
      const vs = viralScores.get(e.video_id);
      if (vs == null) { lowCount++; continue; }
      if (vs >= HIGH_THRESH) highCount++;
      else if (vs >= MED_THRESH) medCount++;
      else lowCount++;
    }
    if (unposted.length > 0 && (highCount + medCount + lowCount) > 0) {
      viralDistLine = ` (H:${highCount} M:${medCount} L:${lowCount})`;
    }
  } catch { /* skip */ }

  // Sprint 1139 (wave 20): count PM2 crons that fired today
  let cronsFiredLine = '';
  try {
    const out = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const pm2List: any[] = JSON.parse(out);
    const todayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const cronsFired = pm2List.filter((p: any) => {
      if (!p.pm2_env?.cron_restart) return false;
      const lastRestart = p.pm2_env?.pm_uptime ?? p.pm2_env?.created_at ?? 0;
      return lastRestart >= todayStart;
    }).length;
    const totalCrons = pm2List.filter((p: any) => !!p.pm2_env?.cron_restart).length;
    if (totalCrons > 0) {
      cronsFiredLine = `\n⚙️ *Crons fired today:* ${cronsFired}/${totalCrons}`;
    }
  } catch { /* skip */ }

  // Sprint 1179: Achiri user growth from workspace/achiri/daily-counts.json
  let achiriGrowthLine = '';
  try {
    const dcPath = path.join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
    if (fs.existsSync(dcPath)) {
      const dc: Record<string, Record<string, number>> = JSON.parse(fs.readFileSync(dcPath, 'utf-8'));
      const isTestId = (id: string) =>
        id.startsWith('validate-') || id.startsWith('smoke-') ||
        id.startsWith('e2e-') || id === 'tarek-test';
      // Distinct real users ever seen
      const allRealUsers = new Set<string>();
      const todayStr = now.toISOString().slice(0, 10);
      let todayDau = 0;
      // Build 7-day trend
      const trendDays: { date: string; dau: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
        const entries = dc[d] ?? {};
        const realUsers = Object.keys(entries).filter(k => !isTestId(k));
        realUsers.forEach(u => allRealUsers.add(u));
        trendDays.push({ date: d, dau: realUsers.length });
        if (d === todayStr) todayDau = realUsers.length;
      }
      // Also count users from older dates for total
      for (const [d, entries] of Object.entries(dc)) {
        Object.keys(entries).filter(k => !isTestId(k)).forEach(u => allRealUsers.add(u));
      }
      const totalUsers = allRealUsers.size;
      const trend7 = trendDays.map(t => t.dau).join('→');
      achiriGrowthLine = `\n👤 *Achiri users:* ${totalUsers} total · DAU ${todayDau} · 7d: ${trend7}`;
    }
  } catch { /* skip */ }

  // Sprint 1184: Last YouTube post from crossplatform-publish.jsonl
  let ytLastPostedLine = '';
  try {
    const cpPath = path.join(ROOT, 'workspace', 'scs001', 'crossplatform-publish.jsonl');
    if (fs.existsSync(cpPath)) {
      const cpLines = fs.readFileSync(cpPath, 'utf-8').trim().split('\n').filter(Boolean);
      const ytPosts = cpLines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter((p): p is any => p !== null && p.platform === 'youtube' && p.success);
      if (ytPosts.length > 0) {
        const last = ytPosts[ytPosts.length - 1];
        const ageH = last.timestamp ? (Date.now() - new Date(last.timestamp).getTime()) / 3600000 : null;
        const ageStr = ageH == null ? ''
          : ageH < 1 ? `${Math.round(ageH * 60)}m ago`
          : ageH < 24 ? `${Math.round(ageH)}h ago`
          : `${Math.round(ageH / 24)}d ago`;
        ytLastPostedLine = `\n📺 *YouTube:* ${ytPosts.length} total · last: \`${last.video_id}\` ${ageStr}`;
      }
    }
  } catch { /* skip */ }

  const lines = [
    `📊 *Kognai Status Dashboard*${activeSprintStr}${envAlertStr}`,
    '',
    `\`[${bar}]\` ${pct}% posts`,
    `\`[${viewBar}]\` ${viewPct}% views`,
    `*${totalPosts}/${target}* posts · *${totalViews}/500* views · *${daysLeft}d* left${gateEtaStr}`,
    `${urgency}`,
    // Sprint 1131 (wave 13): Achiri alpha countdown in header
    (() => { const aIcon = achiriDays <= 3 ? '🔴' : achiriDays <= 7 ? '🟠' : achiriDays <= 14 ? '🟡' : ''; return aIcon ? `${aIcon} Achiri alpha: *${achiriDays}d*` : ''; })(),
    '',
    // Sprint 1119: bold obligation status line
    todayPosts >= dailyObligation
      ? `✅ *OBLIGATION MET* — ${todayPosts}/${dailyObligation} today · ${paceNeeded.toFixed(1)}/day needed`
      : `⚠️ *OBLIGATION UNMET* — ${todayPosts}/${dailyObligation} today · post *${dailyObligation - todayPosts} more now*`,
    streak > 0 ? `🔥 Streak: *${streak}* days` : (daysSinceLastPost > 0 ? `💤 Streak: 0 — last post *${daysSinceLastPost}d ago*` : `💤 Streak: 0 — no posts yet`),
    // Sprint 1138 (wave 19): obligation met streak
    (() => {
      let oblStreak = 0;
      for (let i = 0; i < 14; i++) {
        const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
        const obligationForDay = daysLeft > 0 ? Math.ceil(postsNeeded / daysLeft) : 0;
        const postedThatDay = dailyCounts[d] ?? 0;
        if (postedThatDay >= obligationForDay && obligationForDay > 0) oblStreak++;
        else break;
      }
      return oblStreak >= 2 ? `📋 Obligation streak: *${oblStreak}d* met in a row ✅` : '';
    })(),
    `📦 Queue: *${readyCount}* ready · ${unposted.length} total${viralDistLine}${lastPostAge}${bestHookLine}${viewsTrendLine}${todayObligationLine}${warmupScoreLine}${errorSpikeLine}`,
    pipelineLine,
    cronLine + cronsFiredLine,
    watchdogLine,
    trustLine,
    smokeLine,
    '',
    `🎬 Next: ${nextLine}`,
    '',
    godmanLine,
    achiriLine + waitlistCountLine + unreadBotLine + (() => {
      // Sprint 1148 (wave 27+): Achiri analytics compact from reports/achiri-analytics.json
      try {
        const aaPath = require('path').join(ROOT, 'reports', 'achiri-analytics.json');
        if (require('fs').existsSync(aaPath)) {
          const aa = JSON.parse(require('fs').readFileSync(aaPath, 'utf-8'));
          const totalUsers = aa.overview?.total_users ?? 0;
          const dau = aa.today?.dau ?? 0;
          const retention = aa.overview?.retention_pct ?? 0;
          const errors7d = aa.overview?.errors_7d ?? 0;
          const errStr = errors7d > 0 ? ` · ⚠️ ${errors7d} err/7d` : '';
          return `\n👥 *Achiri users:* ${totalUsers} total · DAU ${dau} · ${retention}% retention${errStr}`;
        }
      } catch {}
      return '';
    })() + achiriGrowthLine + ytLastPostedLine,
    '',
    // Sprint 1134 (wave 15): Phase 2 readiness when gate is met
    ...(postsNeeded === 0 && totalViews >= 500 ? [
      '',
      '🎉 *Phase 1.5 gate MET!* Transitioning to Phase 2:',
      `  ${godmanDays === 0 ? '✅' : '⏳'} Godman launch: *${godmanDays}d* — /godman`,
      `  ${achiriDays === 0 ? '✅' : '⏳'} Achiri alpha: *${achiriDays}d* — /achiri`,
    ] : [
      `_Tap /pickup to post · /blockers for action items_`,
    ]),
  ];

  // Sprint 1121: compact mode — filter consecutive empty lines
  const compact: string[] = [];
  for (const l of lines) {
    if (l === undefined || l === null) continue;
    if (l === '' && compact.length > 0 && compact[compact.length - 1] === '') continue;
    compact.push(l);
  }

  return compact.join('\n');
}

// Sprint 591: /replenish — auto-generate sprint queue items when queue is empty
export function cmdReplenish(): string {
  try {
    const output = execSync(
      'npx ts-node --transpile-only scripts/replenish-sprint-queue.ts',
      { cwd: ROOT, timeout: 30000, encoding: 'utf-8', env: { ...process.env, REPLENISH_DRY_RUN: '0' } }
    );
    const lines = output.trim().split('\n').filter(l => l.trim());
    const itemLines = lines.filter(l => l.includes('Sprint ') && l.includes(':'));
    if (itemLines.length === 0 && output.includes('No replenishment needed')) {
      return '✅ Queue still has pending items. No replenishment needed.';
    }
    const summary = [
      '🔄 *Sprint Queue Replenished*',
      '',
      ...itemLines.slice(0, 10).map(l => l.trim()),
      '',
      `_${itemLines.length} items added to sprint-queue.json_`,
    ];
    return summary.join('\n');
  } catch (e: any) {
    return `❌ Replenish failed: ${(e.message ?? '').slice(0, 200)}`;
  }
}

export function cmdEnrich(): string {
  try {
    const { runEnrich, formatEnrichResult } = require('../scs001/enrich-ledger');
    const result = runEnrich();
    return formatEnrichResult(result);
  } catch (err: any) {
    return `❌ Enrich error: ${err.message}`;
  }
}

// Sprint 1035: /blockers — all pending human-action items across active tracks
export function cmdBlockers(): string {
  // Sprint 1097: Sort by severity — CRITICAL (gate) → HIGH (godman) → MEDIUM (achiri)
  const lines: string[] = ['*🚧 Human-Action Blockers*\n'];
  let totalBlocked = 0;

  // ── GATE: PHASE 1.5 (CRITICAL — earliest deadline) ───────────────────────
  lines.push('*🔴 GATE: Phase 1.5 (April 7)*');
  const gate = readJSON<any>(path.join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json'));
  if (gate) {
    const postsRemaining = gate.raw?.posts_remaining ?? gate.posts_remaining ?? '?';
    const urgency = gate.urgency ?? 'UNKNOWN';
    const daysLeft = gate.days_remaining ?? '?';
    const urgencyIcon = urgency === 'WARNING' ? '⚠️' : urgency === 'ON_TRACK' ? '✅' : '🔴';
    lines.push(`  ${urgencyIcon} ${urgency}: ${postsRemaining} posts needed in ${daysLeft} days`);
    if (urgency !== 'DONE') {
      lines.push(`  ❌ Manual TikTok posting required (2/day pace)`);
      totalBlocked++;
    }
  } else {
    lines.push(`  ❓ Gate file not found`);
  }
  lines.push('');

  // ── GODMAN-LAUNCH (HIGH — Apr 14) ────────────────────────────────────────
  lines.push('*🟠 GODMAN-LAUNCH — April 14*');
  let npmWhoami = '';
  try { npmWhoami = execSync('npm whoami', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe','pipe','pipe'] }).trim(); } catch {}
  if (npmWhoami) {
    lines.push(`  ✅ npm login: ${npmWhoami}`);
  } else {
    lines.push(`  ❌ npm login: run \`npm login\` on launch machine`);
    totalBlocked++;
  }
  lines.push(`  ℹ️  Then: \`bash scripts/godman-launch-day.sh --dry-run\``);
  lines.push(`  ℹ️  Launch day: \`bash scripts/godman-launch-day.sh\``);
  lines.push('');

  // ── ACHIRI-ALPHA (MEDIUM — Apr 25) ───────────────────────────────────────
  lines.push('*🟡 ACHIRI-ALPHA — April 25*');
  const envPath = path.join(ROOT, '.env');
  let envContent = '';
  try { envContent = fs.readFileSync(envPath, 'utf-8'); } catch {}

  const hasAchiriToken = envContent.includes('ACHIRI_TELEGRAM_BOT_TOKEN=') &&
    !envContent.match(/ACHIRI_TELEGRAM_BOT_TOKEN=\s*$/m);
  const hasAchiriUrl = envContent.includes('ACHIRI_BASE_URL=') &&
    !envContent.match(/ACHIRI_BASE_URL=\s*$/m);

  if (hasAchiriToken) {
    lines.push(`  ✅ ACHIRI_TELEGRAM_BOT_TOKEN: set`);
  } else {
    lines.push(`  ❌ ACHIRI_TELEGRAM_BOT_TOKEN: not set in .env`);
    lines.push(`  ℹ️  Add: ACHIRI_TELEGRAM_BOT_TOKEN=<bot_token> to .env`);
    totalBlocked++;
  }
  if (hasAchiriUrl) {
    lines.push(`  ✅ ACHIRI_BASE_URL: set`);
  } else {
    lines.push(`  ℹ️  ACHIRI_BASE_URL: not set (defaults to localhost:3420 — ok for local mode)`);
  }
  if (hasAchiriToken) {
    lines.push(`  ℹ️  Deploy: \`pm2 start ecosystem.config.js --only achiri-telegram\``);
  } else {
    lines.push(`  ℹ️  After setting token, run: \`pm2 start ecosystem.config.js --only achiri-telegram\``);
  }
  lines.push('');

  // ── Sprint 1143 (wave 16): Auto-scan blockers from errors + watchdog + smoke + gate ──
  lines.push('*🔍 Auto-scan:*');
  let autoFound = 0;

  // Check smoke test
  try {
    const smokePath = path.join(ROOT, 'reports', 'smoke-test-latest.json');
    if (fs.existsSync(smokePath)) {
      const smoke = JSON.parse(fs.readFileSync(smokePath, 'utf-8'));
      const ageH = smoke.timestamp ? (Date.now() - new Date(smoke.timestamp).getTime()) / 3600000 : 999;
      if (smoke.pass === false || smoke.status === 'fail') {
        lines.push(`  ❌ Smoke test failing (${smoke.failed ?? '?'} failed) — run /smoke`);
        autoFound++;
      } else if (ageH > 24) {
        lines.push(`  ⚠️ Smoke test stale (${Math.round(ageH)}h ago) — run /smoke`);
        autoFound++;
      } else {
        lines.push(`  ✅ Smoke: pass (${Math.round(ageH)}h ago)`);
      }
    } else {
      lines.push(`  ⚠️ No smoke test found — run /smoke`);
      autoFound++;
    }
  } catch { /* skip */ }

  // Check watchdog
  try {
    const wdPath = path.join(ROOT, 'reports', 'watchdog-latest.json');
    if (fs.existsSync(wdPath)) {
      const wd = JSON.parse(fs.readFileSync(wdPath, 'utf-8'));
      const ts = wd.timestamp ?? wd.generated_at;
      const ageH = ts ? (Date.now() - new Date(ts).getTime()) / 3600000 : 999;
      if (ageH > 25) {
        lines.push(`  ⚠️ Watchdog stale (${Math.round(ageH)}h) — check PM2 watchdog cron`);
        autoFound++;
      } else {
        lines.push(`  ✅ Watchdog: ${Math.round(ageH)}h ago`);
      }
    } else {
      lines.push(`  ⚠️ No watchdog report — run pm2 start scs001-watchdog`);
      autoFound++;
    }
  } catch { /* skip */ }

  // Check recent errors (any in last 1h)
  try {
    const logDir = path.join(ROOT, 'logs');
    const cutoff = Date.now() - 3600000;
    const errorFiles = fs.readdirSync(logDir).filter((f: string) => f.endsWith('-error.log'));
    const recentErrors = errorFiles.filter((f: string) => {
      try { return fs.statSync(path.join(logDir, f)).mtimeMs > cutoff; } catch { return false; }
    });
    if (recentErrors.length > 0) {
      lines.push(`  ⚠️ Recent errors (${recentErrors.length} logs updated in last 1h) — /errors to inspect`);
      autoFound++;
    } else {
      lines.push(`  ✅ No recent errors (last 1h)`);
    }
  } catch { /* skip */ }

  lines.push('');
  if (autoFound > 0) totalBlocked += autoFound;

  // ── Summary ───────────────────────────────────────────────────────────────
  if (totalBlocked === 0) {
    lines.push('✅ *No blockers* — all human actions complete!');
  } else {
    lines.push(`🔴 *${totalBlocked} blocker${totalBlocked > 1 ? 's' : ''} need your attention*`);
  }

  return lines.join('\n');
}

// Sprint 1044: /bottest — run command + posting flow smoke tests
export function cmdBotTest(): string {
  const results: string[] = ['*🧪 Bot Test Results*\n'];
  let totalPass = 0;
  let totalFail = 0;

  // Test 1: command smoke test
  try {
    const out = execSync('npx ts-node scripts/test-telegram-commands.ts 2>&1', {
      cwd: ROOT, encoding: 'utf-8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const match = out.match(/(\d+) PASS \/ (\d+) FAIL/);
    if (match) {
      const p = parseInt(match[1]), f = parseInt(match[2]);
      totalPass += p; totalFail += f;
      results.push(f === 0 ? `✅ Commands: ${p}/${p + f} PASS` : `❌ Commands: ${p}/${p + f} (${f} FAIL)`);
    } else {
      results.push('⚠️ Commands: output parse error');
    }
  } catch (err: any) {
    const out = err.stdout || err.message || '';
    const match = out.match(/(\d+) PASS \/ (\d+) FAIL/);
    if (match) {
      const p = parseInt(match[1]), f = parseInt(match[2]);
      totalPass += p; totalFail += f;
      results.push(`❌ Commands: ${p}/${p + f} (${f} FAIL)`);
    } else {
      results.push(`❌ Commands: error — ${(err.message || '').slice(0, 60)}`);
      totalFail++;
    }
  }

  // Test 2: posting flow test
  try {
    const out = execSync('npx ts-node scripts/test-posting-flow.ts 2>&1', {
      cwd: ROOT, encoding: 'utf-8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const match = out.match(/(\d+) PASS \/ (\d+) FAIL/);
    if (match) {
      const p = parseInt(match[1]), f = parseInt(match[2]);
      totalPass += p; totalFail += f;
      results.push(f === 0 ? `✅ Posting flow: ${p}/${p + f} PASS` : `❌ Posting flow: ${p}/${p + f} (${f} FAIL)`);
    } else {
      results.push('⚠️ Posting flow: output parse error');
    }
  } catch (err: any) {
    const out = err.stdout || err.message || '';
    const match = out.match(/(\d+) PASS \/ (\d+) FAIL/);
    if (match) {
      const p = parseInt(match[1]), f = parseInt(match[2]);
      totalPass += p; totalFail += f;
      results.push(`❌ Posting flow: ${p}/${p + f} (${f} FAIL)`);
    } else {
      results.push(`❌ Posting flow: error — ${(err.message || '').slice(0, 60)}`);
      totalFail++;
    }
  }

  // Sprint 1116: env var smoke check
  const REQUIRED_ENVS = [
    { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram bot token' },
    { key: 'OWNER_TELEGRAM_CHAT_ID', label: 'Owner chat ID' },
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key' },
    { key: 'SUPABASE_URL', label: 'Supabase URL' },
  ];
  const missingEnvs = REQUIRED_ENVS.filter(e => !process.env[e.key]);
  if (missingEnvs.length === 0) {
    results.push(`✅ Env vars: all ${REQUIRED_ENVS.length} required vars set`);
    totalPass++;
  } else {
    results.push(`❌ Env vars: ${missingEnvs.length} missing — ${missingEnvs.map(e => e.label).join(', ')}`);
    totalFail++;
  }

  // Sprint 1125: /gate command smoke test
  try {
    const { cmdGate } = require('./cmd-gate');
    const gateOut: string = cmdGate();
    if (gateOut.includes('Phase 1.5 Gate')) {
      results.push(`✅ /gate: responds with gate status`);
      totalPass++;
    } else {
      results.push(`❌ /gate: unexpected output — missing "Phase 1.5 Gate"`);
      totalFail++;
    }
  } catch (err: any) {
    results.push(`❌ /gate: error — ${(err.message || '').slice(0, 60)}`);
    totalFail++;
  }

  // Sprint 1137 (wave 15): /record arg-parse smoke test
  try {
    const { cmdRecord } = require('./cmd-content');
    // Test 1: missing args
    const helpOut: string = cmdRecord('');
    if (helpOut.includes('Usage:')) {
      results.push(`✅ /record: returns usage when no args`);
      totalPass++;
    } else {
      results.push(`❌ /record: expected usage message, got: ${helpOut.slice(0, 60)}`);
      totalFail++;
    }
    // Test 2: invalid views
    const invalidOut: string = cmdRecord('clip_test abc');
    if (invalidOut.includes('Invalid views')) {
      results.push(`✅ /record: rejects non-numeric views`);
      totalPass++;
    } else {
      results.push(`❌ /record: did not reject non-numeric views`);
      totalFail++;
    }
  } catch (err: any) {
    results.push(`❌ /record: error — ${(err.message || '').slice(0, 60)}`);
    totalFail++;
  }

  // Sprint 1140 (wave 18): /pace output completeness test
  try {
    const { cmdPace } = require('./cmd-gate');
    const paceOut: string = cmdPace();
    const hasSlots = paceOut.includes('7:00') || paceOut.includes('posting slots');
    const hasEta = paceOut.includes('ETA') || paceOut.includes('on track') || paceOut.includes('behind');
    if (hasSlots && hasEta) {
      results.push(`✅ /pace: contains time slots and gate ETA`);
      totalPass++;
    } else {
      const missing = [!hasSlots && 'slots', !hasEta && 'ETA'].filter(Boolean).join(', ');
      results.push(`❌ /pace: missing ${missing}`);
      totalFail++;
    }
  } catch (err: any) {
    results.push(`❌ /pace: error — ${(err.message || '').slice(0, 60)}`);
    totalFail++;
  }

  results.push('');
  results.push(totalFail === 0
    ? `✅ *All ${totalPass} tests PASS*`
    : `🔴 *${totalFail} failures* out of ${totalPass + totalFail} tests`);

  return results.join('\n');
}

// Sprint 1056: /sprint-next — show next planned sprint from queue
export function cmdSprintNext(): string {
  const queuePath = path.join(ROOT, 'workspace', 'sprint-queue.json');
  if (!fs.existsSync(queuePath)) return '❌ sprint-queue.json not found.';

  let q: any;
  try { q = JSON.parse(fs.readFileSync(queuePath, 'utf-8')); } catch {
    return '❌ Could not parse sprint-queue.json';
  }

  const pending = (q.queue || []).filter((i: any) => i.status === 'pending');
  if (pending.length === 0) {
    return '📭 *Sprint queue is empty*\n\nNo pending items. Run /replenish to generate new sprint ideas.';
  }

  const next = pending[0];
  const lines = [
    '🎯 *Next Planned Sprint*',
    '',
    `*Sprint ${next.sprint}*`,
    `📌 ${next.title}`,
    `🏷 Block: ${next.block || 'untagged'}`,
    `⚡️ Priority: ${next.priority || 'medium'}`,
    '',
    next.rationale ? `📝 ${next.rationale}` : '',
    '',
    `📦 *${pending.length}* sprints in queue`,
  ].filter(Boolean);

  if (pending.length > 1) {
    lines.push('');
    lines.push('*Up next:*');
    for (const item of pending.slice(1, 4)) {
      lines.push(`  ${item.sprint} — ${item.title}`);
    }
  }

  return lines.join('\n');
}

// Sprint 1064: /log — pre-filled session log template
export function cmdLog(): string {
  const today = new Date().toISOString().slice(0, 10);
  const timeUtc = new Date().toISOString().slice(11, 16);

  // Latest sprint
  let latestSprint = '???';
  let nextSprint = '???';
  try {
    const q = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace/sprint-queue.json'), 'utf-8'));
    const done = (q.queue as any[]).filter((i: any) => i.status === 'done');
    if (done.length > 0) latestSprint = String(done[done.length - 1].sprint);
    const pending = (q.queue as any[]).filter((i: any) => !['done', 'skipped', 'skip'].includes(i.status));
    if (pending.length > 0) nextSprint = String(pending[0].sprint);
  } catch {}

  // Gate state
  let postsDone = 0, postsNeeded = 30, daysLeft = 14, deadline = 'Apr 7';
  try {
    const gate = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace/gates/phase1-5-gate.json'), 'utf-8'));
    postsDone = gate.raw?.posts_count ?? 0;
    postsNeeded = gate.raw?.posts_target ?? 30;
    daysLeft = gate.days_remaining ?? 14;
    deadline = gate.deadline ?? 'Apr 7';
  } catch {}

  const template = [
    `${today} ${timeUtc} CET - Session log`,
    ``,
    `## Sprints shipped`,
    `- Sprint ${latestSprint}: [TITLE] — [brief outcome]`,
    ``,
    `## Gate`,
    `- Posts: ${postsDone}/${postsNeeded} · ${daysLeft}d to ${deadline}`,
    `- Today: [N] posted`,
    ``,
    `## Blockers / notes`,
    `- [none]`,
    ``,
    `## Next session`,
    `- Sprint ${nextSprint} · [focus]`,
  ].join('\n');

  return [
    '📝 *Session Log Template*',
    '',
    '_Copy and paste into_ `workspace/agents/memory/' + today + '.md`_:_',
    '',
    '```',
    template,
    '```',
  ].join('\n');
}

// Sprint 1130: /launches — unified 3-launch countdown + action matrix
export function cmdLaunches(): string {
  const now = new Date();
  const launches = [
    {
      name: 'Phase 1.5 Gate',
      date: new Date('2026-04-07T00:00:00Z'),
      icon: '🎯',
      checks: [] as Array<{ label: string; pass: boolean; detail: string }>,
    },
    {
      name: 'Godman Protocols',
      date: new Date('2026-04-14T00:00:00Z'),
      icon: '🚀',
      checks: [] as Array<{ label: string; pass: boolean; detail: string }>,
    },
    {
      name: 'Achiri Alpha',
      date: new Date('2026-04-25T00:00:00Z'),
      icon: '🤖',
      checks: [] as Array<{ label: string; pass: boolean; detail: string }>,
    },
  ];

  // Phase 1.5 Gate checks
  const posts = readRealPosts();
  const totalPosts = posts.length;
  const totalViews = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  launches[0].checks.push(
    { label: 'Posts', pass: totalPosts >= 30, detail: `${totalPosts}/30` },
    { label: 'Views', pass: totalViews >= 500, detail: `${totalViews}/500` },
    { label: 'TikTok token', pass: !!process.env.TIKTOK_ACCESS_TOKEN, detail: process.env.TIKTOK_ACCESS_TOKEN ? 'SET' : 'MISSING' },
  );

  // Godman Protocols checks
  let npmLoggedIn = false;
  try { npmLoggedIn = !!execSync('npm whoami 2>/dev/null', { encoding: 'utf-8', timeout: 3000 }).trim(); } catch {}
  const protocolsPath = path.join(ROOT, 'workspace', 'godman-protocols');
  const protocolsExist = ['pact', 'lax', 'score', 'signal', 'soul', 'amf', 'drs'].map(p => {
    const corePath = path.join(protocolsPath, p, 'src');
    return { name: p, exists: fs.existsSync(corePath) };
  });
  const allProtocols = protocolsExist.every(p => p.exists);
  launches[1].checks.push(
    { label: 'npm login', pass: npmLoggedIn, detail: npmLoggedIn ? 'ready' : 'run `npm login`' },
    { label: '7 protocols', pass: allProtocols, detail: `${protocolsExist.filter(p => p.exists).length}/7 repos` },
    { label: 'Launch script', pass: fs.existsSync(path.join(ROOT, 'scripts', 'godman-launch-day.sh')), detail: 'godman-launch-day.sh' },
  );

  // Achiri Alpha checks
  const wlPath = path.join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl');
  const wlCount = fs.existsSync(wlPath) ? fs.readFileSync(wlPath, 'utf-8').split('\n').filter(l => l.trim()).length : 0;
  const readinessPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
  let readinessScore = 0;
  if (fs.existsSync(readinessPath)) {
    try { readinessScore = JSON.parse(fs.readFileSync(readinessPath, 'utf-8')).score ?? 0; } catch {}
  }
  const envContent = (() => { try { return fs.readFileSync(path.join(ROOT, '.env'), 'utf-8'); } catch { return ''; } })();
  const hasAchiriToken = envContent.includes('ACHIRI_TELEGRAM_BOT_TOKEN=') && !envContent.match(/ACHIRI_TELEGRAM_BOT_TOKEN=\s*$/m);
  // Sprint 1198: Hetzner server check
  const hetznerLive = (() => {
    try {
      execSync('curl -sf --max-time 3 http://65.108.90.178:3420/stats/health > /dev/null 2>&1', { timeout: 5000 });
      return true;
    } catch { return false; }
  })();
  launches[2].checks.push(
    { label: 'Readiness', pass: readinessScore >= 70, detail: `${readinessScore}%` },
    { label: 'Whitelist', pass: wlCount > 0, detail: `${wlCount} users` },
    { label: 'Bot token', pass: hasAchiriToken, detail: hasAchiriToken ? 'SET' : 'MISSING' },
    { label: 'Hetzner API', pass: hetznerLive, detail: hetznerLive ? 'LIVE :3420' : 'DOWN — init-hetzner.sh' },
  );

  const lines: string[] = ['🗓 *Launch Calendar*\n'];

  for (const launch of launches) {
    const daysLeft = Math.max(0, Math.ceil((launch.date.getTime() - now.getTime()) / 86_400_000));
    const passCount = launch.checks.filter(c => c.pass).length;
    const allPass = passCount === launch.checks.length;
    const urgency = daysLeft <= 3 ? '🔴' : daysLeft <= 7 ? '🟠' : daysLeft <= 14 ? '🟡' : '🟢';

    lines.push(`${launch.icon} *${launch.name}* — ${urgency} *${daysLeft}d* (${launch.date.toISOString().slice(0, 10)})`);
    for (const c of launch.checks) {
      lines.push(`  ${c.pass ? '✅' : '❌'} ${c.label}: ${c.detail}`);
    }
    if (allPass) {
      lines.push(`  ✅ *Ready to launch*`);
    }
    lines.push('');
  }

  const totalChecks = launches.reduce((s, l) => s + l.checks.length, 0);
  const totalPass = launches.reduce((s, l) => s + l.checks.filter(c => c.pass).length, 0);
  lines.push(`_${totalPass}/${totalChecks} checks pass · /blockers for action items_`);

  return lines.join('\n');
}

/**
 * Sprint 1193: /post-pulse — 24h posting velocity snapshot
 * Shows: posts today, views gained, last post time, on-track status, next action.
 */
export function cmdPostPulse(): string {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const oneDayAgoStr = oneDayAgo.toISOString();
  const todayStr = now.toISOString().slice(0, 10);

  // Load posts (excluding dry runs)
  const postsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const allPosts: any[] = fs.existsSync(postsPath)
    ? fs.readFileSync(postsPath, 'utf-8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];

  const realPosts = allPosts.filter(p => !['browser-post-dry', 'batch-browser-dry'].includes(p.method ?? ''));
  const postsLast24h = realPosts.filter(p => (p.posted_at ?? p.recorded_at ?? '') >= oneDayAgoStr);
  const viewsLast24h = postsLast24h.reduce((sum, p) => sum + (p.views ?? 0), 0);
  const totalPosts = realPosts.length;
  const totalViews = realPosts.reduce((sum, p) => sum + (p.views ?? 0), 0);

  // Last post time
  const sorted = [...realPosts].sort((a, b) => (b.posted_at ?? b.recorded_at ?? '').localeCompare(a.posted_at ?? a.recorded_at ?? ''));
  const lastPost = sorted[0];
  let lastPostLine = 'No posts recorded';
  if (lastPost) {
    const ts = lastPost.posted_at ?? lastPost.recorded_at ?? '';
    const diffH = Math.round((now.getTime() - new Date(ts).getTime()) / 3_600_000);
    lastPostLine = `${diffH}h ago — \`${lastPost.video_id ?? 'unknown'}\``;
  }

  // Gate math
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - totalPosts);
  const paceNeeded = daysLeft > 0 ? (postsNeeded / daysLeft).toFixed(1) : '0';
  const onTrack = postsLast24h.length >= 1; // minimum 1 post/day to be moving

  // Next action
  const urgency = daysLeft <= 7 ? '🔴' : daysLeft <= 14 ? '🟡' : '🟢';
  const statusLine = onTrack
    ? `✅ On track — ${postsLast24h.length} post${postsLast24h.length !== 1 ? 's' : ''} in 24h`
    : `⚠️ Behind — 0 posts in 24h (need ${paceNeeded}/day)`;

  return [
    `📊 *Post Pulse* — ${todayStr}`,
    '',
    `*Last 24h:* ${postsLast24h.length} posts · ${viewsLast24h} views`,
    `*Last post:* ${lastPostLine}`,
    `*All time:* ${totalPosts}/30 posts · ${totalViews} views`,
    '',
    `*Gate:* ${urgency} ${postsNeeded} posts needed · ${daysLeft}d left · ${paceNeeded}/day pace`,
    statusLine,
    '',
    `_Next: /caption-next to get video + caption · /deliver-next to send mp4_`,
  ].join('\n');
}
