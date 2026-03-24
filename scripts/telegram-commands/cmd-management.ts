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
  const STALE_DAYS = 7;
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const archivedIds = loadArchived();
  const now = Date.now();

  const stale = (ledger as any[]).filter((e: any) => {
    if (!e.video_id || recordedIds.has(e.video_id) || archivedIds.has(e.video_id)) return false;
    if (!e.published_at) return false;
    const ageDays = (now - new Date(e.published_at).getTime()) / 86_400_000;
    return ageDays > STALE_DAYS;
  });

  if (stale.length === 0) {
    return `✅ *No stale content* — all queued videos are <${STALE_DAYS} days old.`;
  }

  if (args.trim() === 'archive') {
    const archived = loadArchived();
    for (const e of stale) archived.add(e.video_id);
    saveArchived(archived);
    return (
      `📁 *Bulk archived ${stale.length} stale videos* (>${STALE_DAYS} days old)\n\n` +
      `Queue is now focused on fresh content.\n` +
      `Restore any with \`/unarchive <video_id>\``
    );
  }

  // Show stale summary grouped by age
  const byAge: Record<string, number> = {};
  for (const e of stale) {
    const ageDays = Math.round((now - new Date(e.published_at).getTime()) / 86_400_000);
    const bucket = ageDays <= 10 ? '7-10d' : ageDays <= 14 ? '11-14d' : '15d+';
    byAge[bucket] = (byAge[bucket] ?? 0) + 1;
  }

  const lines = [
    `🕰 *Stale Content* — ${stale.length} videos >${STALE_DAYS} days old`,
    '',
  ];
  for (const [bucket, count] of Object.entries(byAge)) {
    lines.push(`• ${bucket}: ${count} videos`);
  }
  lines.push('');
  lines.push(`Run \`/stale archive\` to bulk-archive all ${stale.length} stale videos.`);
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
    `• This week: ${thisWeekPosts.length} posts · ${weekViews} views`,
    `• All time: ${totalPosts}/30 posts · ${totalViews} total views`,
    `• Gate: ${daysLeft}d left · ${paceNeeded} posts/day needed`,
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

  // Today's posts
  const today = now.toISOString().slice(0, 10);
  const todayPosts = dailyCounts[today] ?? 0;

  // Pace
  const paceNeeded = daysLeft > 0 ? postsNeeded / daysLeft : postsNeeded;

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

  const lines = [
    '📊 *Kognai Status Dashboard*',
    '',
    `\`[${bar}]\` ${pct}%`,
    `*${totalPosts}/${target}* posts · *${totalViews}/500* views · *${daysLeft}d* left`,
    `${urgency} · Pace needed: *${paceNeeded.toFixed(1)}/day*`,
    '',
    `📅 Today: *${todayPosts}* posted`,
    `🔥 Streak: *${streak}* days`,
    `📦 Queue: *${readyCount}* ready · ${unposted.length} total`,
    cronLine,
    '',
    `🎬 Next: ${nextLine}`,
    '',
    `_Tap /pickup to post next video_`,
  ];

  return lines.join('\n');
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
  const lines: string[] = ['*🚧 Human-Action Blockers*\n'];
  let totalBlocked = 0;

  // ── GODMAN-LAUNCH (April 14) ─────────────────────────────────────────────
  lines.push('*🚀 GODMAN-LAUNCH — April 14*');
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

  // ── ACHIRI-ALPHA ─────────────────────────────────────────────────────────
  lines.push('*🤖 ACHIRI-ALPHA*');
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
    totalBlocked++;
  }
  if (hasAchiriUrl) {
    lines.push(`  ✅ ACHIRI_BASE_URL: set`);
  } else {
    lines.push(`  ❌ ACHIRI_BASE_URL: not set in .env`);
    totalBlocked++;
  }
  lines.push('');

  // ── GATE: PHASE 1.5 ──────────────────────────────────────────────────────
  lines.push('*📊 GATE: Phase 1.5 (April 7)*');
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

  // ── Summary ───────────────────────────────────────────────────────────────
  if (totalBlocked === 0) {
    lines.push('✅ *No blockers* — all human actions complete!');
  } else {
    lines.push(`🔴 *${totalBlocked} blocker${totalBlocked > 1 ? 's' : ''} need your attention*`);
  }

  return lines.join('\n');
}
