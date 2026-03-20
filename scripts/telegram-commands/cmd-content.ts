/**
 * Telegram bot commands — extracted from telegram-bot.ts (Sprint 455)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ROOT, readJSON, readLines, getPm2List, fmtUptime, fmtMem, latestSprintFile,
  findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived, saveArchived, ARCHIVE_PATH,
} from './shared';

export function cmdRecord(args: string): string {
  // Usage: /record <video_id> <views> [title...]
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    return (
      `*Usage:* \`/record <video_id> <views> [title]\`\n\n` +
      `Example: \`/record clip_abc123 0 My first TikTok\`\n\n` +
      `Records a manually-posted TikTok video for gate tracking.`
    );
  }

  const videoId = parts[0];
  const views = parseInt(parts[1], 10);
  if (isNaN(views) || views < 0) {
    return `❌ Invalid views count: \`${parts[1]}\` — must be a non-negative number.`;
  }
  const title = parts.slice(2).join(' ') || undefined;

  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const dir = path.dirname(manualPostsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Check for duplicate
  const existing = readLines(manualPostsPath);
  if (existing.some((e: any) => e.video_id === videoId)) {
    return `⚠️ Video \`${videoId}\` already recorded. Use /queue to see unposted videos.`;
  }

  // Sprint 404: Enrich with experiment metadata for A/B analysis
  const expData = getExperimentData(videoId);
  const entry = {
    video_id: videoId,
    views,
    title,
    speaker: expData.speaker !== 'unknown' ? expData.speaker : undefined,
    hook_formula: expData.hook_formula !== 'unknown' ? expData.hook_formula : undefined,
    viral_score: expData.viral_score,
    topic: expData.topic,
    posted_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
  };
  fs.appendFileSync(manualPostsPath, JSON.stringify(entry) + '\n', 'utf-8');

  // Compute updated gate stats
  const updated = readLines(manualPostsPath);
  const postCount = updated.length;
  const totalViews = updated.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const postsLeft = Math.max(0, 30 - postCount);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

  return (
    `✅ *Post recorded!*\n\n` +
    `Video: \`${videoId}\`\n` +
    `Views: ${views}${title ? `\nTitle: ${title}` : ''}\n\n` +
    `📊 *Gate progress:* ${postCount}/30 posts · ${totalViews}/500 views\n` +
    `${postsLeft > 0 ? `⏳ ${postsLeft} more posts needed · ${daysLeft}d to Apr 7` : '✅ Post target met!'}`
  );
}

export function cmdQueue(): string {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));

  // Sprint 434: Load viral scores + metadata for ranking and display
  const viralScores = new Map<string, number>();
  const queueSpeakers = new Map<string, string>();
  const queueHooks = new Map<string, string>();
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
            if (e.speaker && e.speaker !== 'unknown') queueSpeakers.set(id, e.speaker);
            if (e.hook_formula && e.hook_formula !== 'unknown') queueHooks.set(id, e.hook_formula);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Sprint 434: Build publish date map for age display
  const publishDates = new Map<string, string>();
  for (const e of ledger as any[]) {
    if (e.video_id && e.published_at) publishDates.set(e.video_id, e.published_at);
  }

  // Check for captioned mp4 on disk
  function hasCaptionedMp4(videoId: string): boolean {
    try {
      const scsDir = path.join(ROOT, 'workspace', 'scs001');
      const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
      for (const dir of runDirs) {
        const p = path.join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
        if (fs.existsSync(p)) return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  // Sprint 392: Filter archived videos from queue
  const archivedIds = loadArchived();
  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && !archivedIds.has(e.video_id))
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

  if (unposted.length === 0) {
    return (
      `📋 *Posting Queue — Empty*\n\n` +
      `No unposted videos in the ledger.\n` +
      `Pipeline total: ${ledger.length} | Posted: ${recorded.length}` +
      (archivedIds.size > 0 ? ` | Archived: ${archivedIds.size}` : '')
    );
  }

  const top5 = unposted.slice(0, 5);
  const readyCount = unposted.filter((e: any) => hasCaptionedMp4(e.video_id)).length;

  // Sprint 434: Show speaker, hook, and age alongside score
  const lines = top5.map((e: any, i: number) => {
    const vs = viralScores.get(e.video_id);
    const vsStr = vs != null ? ` 🧬${vs.toFixed(2)}` : '';
    const ready = hasCaptionedMp4(e.video_id) ? ' ✅' : ' ⏳';
    const spk = queueSpeakers.get(e.video_id);
    const hook = queueHooks.get(e.video_id);
    const pubAt = publishDates.get(e.video_id);
    const ageDays = pubAt ? Math.round((Date.now() - new Date(pubAt).getTime()) / 86_400_000) : 0;
    const ageStr = ageDays > 0 ? `${ageDays}d` : 'new';
    const meta: string[] = [];
    if (spk) meta.push(`🎙️${spk}`);
    if (hook) meta.push(`🎣${hook}`);
    meta.push(`⏱${ageStr}`);
    return `${i + 1}. \`${e.video_id}\`${vsStr}${ready}\n   ${meta.join(' · ')}`;
  });

  // Sprint 434: Unique speaker count for diversity indicator
  const uniqueSpeakers = new Set(unposted.map((e: any) => queueSpeakers.get(e.video_id) ?? 'unknown')).size;

  return (
    `📋 *Posting Queue* — ${unposted.length} unposted (${readyCount} ready)\n` +
    `🎙️ ${uniqueSpeakers} speakers in queue\n\n` +
    lines.join('\n') +
    `\n\n_To record: \`/record <video_id> <views>\`_` +
    `\n_✅ = mp4 ready · 🧬 = viral score · ⏱ = age_`
  );
}

export function cmdReview(): string {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  if (ledger.length === 0) {
    return `📹 *Review* — No videos in pipeline yet.`;
  }

  // Get latest entry
  const latest = ledger[ledger.length - 1];
  const videoId = latest.video_id ?? 'unknown';

  // Check for captioned mp4
  let mp4Status = '❌ not found';
  try {
    const scsDir = path.join(ROOT, 'workspace', 'scs001');
    const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = path.join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        mp4Status = `✅ ready (${Math.round(stat.size / 1024)}KB)`;
        break;
      }
    }
  } catch { /* ignore */ }

  // Check experiments for QC/viral data
  let qcStatus = 'no data';
  let viralScore: string = 'n/a';
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    try {
      for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id === videoId) {
            if (e.qc_passed != null) qcStatus = e.qc_passed ? '✅ passed' : '❌ failed';
            if (e.partial_viral_score != null) viralScore = String(e.partial_viral_score);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Check if already posted
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const isPosted = recorded.some((e: any) => e.video_id === videoId);

  return (
    `📹 *Latest Video Review*\n\n` +
    `ID: \`${videoId}\`\n` +
    `Published: ${latest.published_at ?? 'unknown'}\n` +
    `MP4: ${mp4Status}\n` +
    `QC: ${qcStatus}\n` +
    `Viral score: ${viralScore}\n` +
    `Posted: ${isPosted ? '✅ yes' : '❌ not yet'}\n\n` +
    (isPosted ? '' : `_To post: \`/record ${videoId} 0\`_`)
  );
}

export function cmdCaption(args: string): string {
  const videoId = args.trim();
  if (!videoId) {
    return `❌ Usage: \`/caption <video_id>\`\n\nExample: \`/caption video-28a77329\``;
  }

  const exp = getExperimentData(videoId);
  const caption = buildTikTokCaption(videoId);
  const mp4Path = findCaptionedMp4(videoId);

  return (
    `📝 *TikTok Caption for* \`${videoId}\`\n\n` +
    `\`\`\`\n${caption}\n\`\`\`\n\n` +
    `🎙️ Speaker: ${exp.speaker}\n` +
    `🎣 Hook: ${exp.hook_formula}\n` +
    `🧬 Viral score: ${exp.viral_score ?? 'n/a'}\n` +
    `🎬 MP4: ${mp4Path ? '✅ ready' : '❌ not found'}\n\n` +
    `_Copy the caption above and paste into TikTok._\n` +
    `_After posting: \`/record ${videoId} 0\`_`
  );
}

export function cmdPosted(): string {
  const deliveredPath = path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
  if (!fs.existsSync(deliveredPath)) {
    return `⚠️ No auto-delivered videos found. Use \`/deliver\` first, then \`/record <id> 0\`.`;
  }

  const lines = fs.readFileSync(deliveredPath, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length === 0) {
    return `⚠️ No auto-delivered videos found. Use \`/deliver\` first.`;
  }

  // Get most recent delivery
  let latest: any = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try { latest = JSON.parse(lines[i]); break; } catch { /* skip */ }
  }
  if (!latest || !latest.video_id) {
    return `⚠️ Could not parse last delivery. Use \`/record <id> 0\` manually.`;
  }

  const videoId = latest.video_id;
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

  // Check for duplicate
  const existing = readLines(manualPostsPath);
  if (existing.some((e: any) => e.video_id === videoId)) {
    return `⚠️ \`${videoId}\` already recorded. Send \`/posted\` again after posting the next delivered video.`;
  }

  // Record the post (Sprint 404: enriched with experiment metadata)
  const expData = getExperimentData(videoId);
  const entry = {
    video_id: videoId,
    views: 0,
    speaker: expData.speaker !== 'unknown' ? expData.speaker : undefined,
    hook_formula: expData.hook_formula !== 'unknown' ? expData.hook_formula : undefined,
    viral_score: expData.viral_score,
    topic: expData.topic,
    posted_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    source: 'auto-deliver',
  };
  const dir = path.dirname(manualPostsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(manualPostsPath, JSON.stringify(entry) + '\n', 'utf-8');

  // Gate stats
  const updated = readLines(manualPostsPath);
  const postCount = updated.length;
  const totalViews = updated.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const postsLeft = Math.max(0, 30 - postCount);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

  return (
    `✅ *Posted!* \`${videoId}\`\n\n` +
    `📊 *Gate:* ${postCount}/30 posts · ${totalViews}/500 views\n` +
    `${postsLeft > 0 ? `⏳ ${postsLeft} more · ${daysLeft}d to Apr 7` : '🎉 Post target met!'}\n\n` +
    `_Next video will auto-deliver at the next posting time._`
  );
}

export function cmdOnboard(): string {
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const daysLeft = Math.max(1, Math.ceil((new Date('2026-04-07').getTime() - Date.now()) / 86400000));
  const postsLeft = Math.max(0, 30 - posts.length);

  if (posts.length >= 30) {
    return `✅ *You've already hit 30 posts!* Gate progress is on track.\n\nUse \`/gate\` to check full status.`;
  }

  return (
    `📖 *First-Time Posting Guide*\n\n` +
    `You have *${postsLeft} posts* to make in *${daysLeft} days*.\n` +
    `Here's how to post your first video:\n\n` +
    `*Step 1 — Get a video*\n` +
    `Send \`/deliver 1\` and I'll send you the best-scoring video with a ready-to-use caption.\n\n` +
    `*Step 2 — Save to phone*\n` +
    `Tap the video in Telegram → Save to gallery/camera roll.\n\n` +
    `*Step 3 — Post on TikTok*\n` +
    `Open TikTok → + → Upload → Select the video → Paste the caption from the message → Post.\n\n` +
    `*Step 4 — Record it*\n` +
    `Come back here and send:\n` +
    `\`/record <video_id> 0\`\n` +
    `(The video ID is in the caption I sent you)\n\n` +
    `*Step 5 — Update views later*\n` +
    `After 24h, check your TikTok views and update:\n` +
    `\`/record <video_id> <views>\`\n\n` +
    `*Daily workflow:*\n` +
    `\`/deliver 3\` → save → post → \`/record\` × 3\n` +
    `Do this morning + evening = 6 posts/day = gate in 5 days 🚀\n\n` +
    `_Pipeline has ${ledger.length} videos (76 captioned, ready to post)._\n` +
    `_Ready? Send \`/deliver 1\` now!_`
  );
}

export function cmdPipeline(): string {
  const lines: string[] = ['*📊 Content Pipeline Status*\n'];

  // 1. Last pipeline run
  const latestRunPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
  let lastRun: any = null;
  if (fs.existsSync(latestRunPath)) {
    try { lastRun = JSON.parse(fs.readFileSync(latestRunPath, 'utf-8')); } catch {}
  }

  if (lastRun) {
    const completedAt = lastRun.completed_at ? new Date(lastRun.completed_at) : null;
    const ageMs = completedAt ? Date.now() - completedAt.getTime() : Infinity;
    const ageHrs = Math.round(ageMs / 3_600_000);
    const health = ageHrs < 6 ? '🟢 FRESH' : ageHrs < 24 ? '🟡 STALE' : '🔴 OLD';
    const elapsed = lastRun.total_elapsed_ms ? `${Math.round(lastRun.total_elapsed_ms / 1000)}s` : '?';
    lines.push(`*Last Run:* ${lastRun.run_id ?? 'unknown'}`);
    lines.push(`⏱ ${elapsed} · ${health} (${ageHrs}h ago)\n`);

    // Stage summary from latest run
    const s = lastRun.summary ?? {};
    lines.push('*Latest Run Output:*');
    lines.push(`  🔍 Topics: ${s.topics_found ?? 0}`);
    lines.push(`  📹 Clips discovered: ${s.clips_discovered ?? 0}`);
    lines.push(`  ✂️ Clips qualified: ${s.clips_qualified ?? 0}`);
    lines.push(`  📝 Scripts: ${s.scripts_produced ?? 0}`);
    lines.push(`  🎬 Videos edited: ${s.videos_edited ?? 0}`);
    lines.push(`  💬 Videos captioned: ${s.videos_captioned ?? 0}`);
    lines.push(`  ✅ QC passed: ${s.qc_passed ?? 0}`);
    lines.push(`  📦 Published to queue: ${s.published ?? 0}`);
    lines.push('');
  } else {
    lines.push('⚠️ No pipeline run report found.\n');
  }

  // 2. Total inventory
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const unposted = (ledger as any[]).filter((e: any) => !recordedIds.has(e.video_id) && e.video_id);

  // Count captioned mp4s available
  let captionedCount = 0;
  for (const entry of unposted) {
    if (findCaptionedMp4(entry.video_id) !== null) captionedCount++;
  }

  // Count experiment scores
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  let scoredCount = 0;
  if (fs.existsSync(expPath)) {
    try {
      const expLines = fs.readFileSync(expPath, 'utf-8').split('\n').filter(l => l.trim());
      scoredCount = expLines.length;
    } catch {}
  }

  // Count run directories
  const scsDir = path.join(ROOT, 'workspace', 'scs001');
  let runCount = 0;
  try {
    runCount = fs.readdirSync(scsDir).filter(d => d.startsWith('run-')).length;
  } catch {}

  lines.push('*Total Inventory:*');
  lines.push(`  📂 Pipeline runs: ${runCount}`);
  lines.push(`  📋 Ledger entries: ${ledger.length}`);
  lines.push(`  🧬 Scored experiments: ${scoredCount}`);
  lines.push(`  🎬 Ready-to-post (captioned MP4): ${captionedCount}`);
  lines.push(`  ✅ Posted: ${recorded.length}`);
  lines.push(`  📦 Unposted in queue: ${unposted.length}`);
  lines.push('');

  // 3. Action line
  if (captionedCount > 0 && recorded.length < 30) {
    const needed = 30 - recorded.length;
    lines.push(`💡 *${captionedCount} videos ready!* Send \`/deliver 3\` to get your next batch.`);
    lines.push(`📊 ${needed} more posts needed for Phase 1.5 gate.`);
  } else if (captionedCount === 0) {
    lines.push('⚠️ No captioned videos ready. Run the pipeline first.');
  } else {
    lines.push('🎉 Phase 1.5 post target reached!');
  }

  return lines.join('\n');
}

export function cmdToday(): string {
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recordedIds = new Set(posts.map((e: any) => e.video_id).filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);
  const todayPosts = posts.filter((p: any) => (p.posted_at ?? p.recorded_at ?? '').startsWith(today)).length;

  // Gate math
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(1, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));
  const postsLeft = Math.max(0, 30 - posts.length);
  const dailyTarget = Math.ceil(postsLeft / daysLeft);

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
        } catch {}
      }
    } catch {}
  }

  // Get top unposted videos with captioned mp4
  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));
  const ready = unposted.filter((e: any) => findCaptionedMp4(e.video_id) !== null);

  const lines: string[] = [];
  const goalMet = todayPosts >= dailyTarget;
  const icon = goalMet ? '✅' : '🎯';

  lines.push(`${icon} *Today's Posting Brief* — ${today}\n`);

  if (posts.length >= 30) {
    lines.push('🎉 *Phase 1.5 post target reached!* Keep posting to build momentum.\n');
  } else {
    lines.push(`📊 *Gate:* ${posts.length}/30 posts · ${daysLeft}d left · ${dailyTarget}/day needed`);
    lines.push(`📅 *Today:* ${todayPosts}/${dailyTarget} posted ${goalMet ? '✅ ON TRACK' : '⏳ NEEDS POSTS'}\n`);
  }

  // Recommended videos
  const topN = Math.min(3, ready.length);
  if (topN > 0) {
    lines.push(`*🏆 Top ${topN} Videos to Post Today:*`);
    for (let i = 0; i < topN; i++) {
      const v = ready[i];
      const vs = viralScores.get(v.video_id);
      const vsStr = vs != null ? ` · 🧬${vs.toFixed(1)}` : '';
      lines.push(`${i + 1}. \`${v.video_id}\`${vsStr}`);
    }
    lines.push('');
    lines.push(`💡 Send \`/deliver ${topN}\` to get ${topN === 1 ? 'this video' : 'these videos'} now.`);
  } else {
    lines.push('⚠️ No captioned videos ready to post. Run the pipeline first.');
  }

  // Optimal posting times
  lines.push('\n*⏰ Best Posting Times:*');
  lines.push('• 7:00 AM — morning commute');
  lines.push('• 12:00 PM — lunch break');
  lines.push('• 7:00 PM — evening scroll');

  return lines.join('\n');
}

export function cmdAnalytics(): string {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (!fs.existsSync(expPath)) return `📊 *Analytics* — No experiment data found.`;

  const experiments: any[] = [];
  for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try { experiments.push(JSON.parse(line)); } catch { /* skip */ }
  }

  if (experiments.length === 0) return `📊 *Analytics* — No experiments found.`;

  // Score distribution
  const scores = experiments.map(e => e.partial_viral_score).filter((s: any) => s != null) as number[];
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const topScores = scores.sort((a, b) => b - a).slice(0, 5);
  const qcPassed = experiments.filter(e => e.qc_passed).length;
  const qcRate = Math.round(qcPassed / experiments.length * 100);

  // Top speakers by avg score
  const speakerStats: Record<string, { count: number; totalScore: number }> = {};
  for (const e of experiments) {
    const s = e.speaker ?? 'unknown';
    if (s === 'unknown') continue;
    if (!speakerStats[s]) speakerStats[s] = { count: 0, totalScore: 0 };
    speakerStats[s].count++;
    if (e.partial_viral_score != null) speakerStats[s].totalScore += e.partial_viral_score;
  }
  const topSpeakers = Object.entries(speakerStats)
    .map(([name, stats]) => ({ name, avg: stats.count > 0 ? stats.totalScore / stats.count : 0, count: stats.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // Top hook formulas by avg score
  const hookStats: Record<string, { count: number; totalScore: number }> = {};
  for (const e of experiments) {
    const h = e.hook_formula ?? 'unknown';
    if (h === 'unknown') continue;
    if (!hookStats[h]) hookStats[h] = { count: 0, totalScore: 0 };
    hookStats[h].count++;
    if (e.partial_viral_score != null) hookStats[h].totalScore += e.partial_viral_score;
  }
  const topHooks = Object.entries(hookStats)
    .map(([name, stats]) => ({ name, avg: stats.count > 0 ? stats.totalScore / stats.count : 0, count: stats.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // Pipeline stats
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));

  const lines = [
    `📊 *Content Analytics*`,
    '',
    `*Pipeline:*`,
    `• ${experiments.length} experiments | ${ledger.length} in ledger`,
    `• QC pass rate: ${qcRate}%`,
    `• Avg viral score: ${avgScore.toFixed(2)}`,
    `• Top scores: ${topScores.slice(0, 3).map(s => s.toFixed(2)).join(', ')}`,
    '',
  ];

  if (topSpeakers.length > 0) {
    lines.push(`*🎙️ Top Speakers:*`);
    for (const s of topSpeakers) {
      lines.push(`• ${s.name}: 🧬${s.avg.toFixed(2)} (${s.count} videos)`);
    }
    lines.push('');
  }

  if (topHooks.length > 0) {
    lines.push(`*🎣 Top Hook Formulas:*`);
    for (const h of topHooks) {
      lines.push(`• ${h.name}: 🧬${h.avg.toFixed(2)} (${h.count} videos)`);
    }
    lines.push('');
  }

  lines.push(`*Posting:*`);
  lines.push(`• Recorded: ${recorded.length}/30 | Ready: ~76 captioned`);
  lines.push(`• Use \`/deliver\` to post top-scored content first`);

  return lines.join('\n');
}
