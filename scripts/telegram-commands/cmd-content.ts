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
  loadTopicMap, getNicheDiversityScore,
} from './shared';

export function cmdRecord(args: string): string {
  // Usage: /record <video_id> <views> [tiktok_url | title...]
  // Sprint 1023: 3rd arg starting with https:// is stored as tiktok_url for view tracking
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    return (
      `*Usage:* \`/record <video_id> <views> [tiktok_url | title]\`\n\n` +
      `Example: \`/record clip_abc123 0 https://tiktok.com/@you/video/123\`\n` +
      `Example: \`/record clip_abc123 0 My first TikTok\`\n\n` +
      `Records a manually-posted TikTok video for gate tracking.`
    );
  }

  const videoId = parts[0];
  const views = parseInt(parts[1], 10);
  if (isNaN(views) || views < 0) {
    return `❌ Invalid views count: \`${parts[1]}\` — must be a non-negative number.`;
  }
  const rest = parts.slice(2).join(' ') || undefined;
  // Sprint 1125: warn if views unusually high (possible typo)
  if (views > 5000 && !args.includes('--confirm')) {
    return (
      `⚠️ *Unusually high view count: ${views.toLocaleString()}*\n\n` +
      `This seems high — are you sure? If correct, add \`--confirm\` to record:\n` +
      `\`/record ${videoId} ${views}${rest ? ' ' + rest : ''} --confirm\``
    );
  }
  const tiktokUrl = rest?.startsWith('https://') ? rest : undefined;
  const title = !tiktokUrl ? rest : undefined;

  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const dir = path.dirname(manualPostsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Check for duplicate
  const existing = readLines(manualPostsPath);
  if (existing.some((e: any) => e.video_id === videoId)) {
    return `⚠️ Video \`${videoId}\` already recorded. Use /queue to see unposted videos.`;
  }

  // Sprint 1071: warn if video_id not found in ledger or auto-delivered (likely a typo)
  const isForced = args.includes('--force');
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const autoDelivered = readLines(path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl'));
  const knownVideo = ledger.some((e: any) => e.video_id === videoId || e.clip_id === videoId) ||
    autoDelivered.some((e: any) => e.video_id === videoId || e.clip_id === videoId);
  if (!knownVideo && !isForced) {
    return (
      `⚠️ *Video ID not found in pipeline.*\n\n` +
      `\`${videoId}\` is not in auto-delivered or publish-ledger.\n` +
      `This may be a typo — check with /queue.\n\n` +
      `To record anyway (non-pipeline post):\n` +
      `\`/record ${videoId} ${views}${rest ? ' ' + rest : ''} --force\``
    );
  }

  // Sprint 404: Enrich with experiment metadata for A/B analysis
  const expData = getExperimentData(videoId);
  const entry: Record<string, unknown> = {
    video_id: videoId,
    views,
    title,
    tiktok_url: tiktokUrl, // Sprint 1023: store for future oEmbed view tracking
    speaker: expData.speaker !== 'unknown' ? expData.speaker : undefined,
    hook_formula: expData.hook_formula !== 'unknown' ? expData.hook_formula : undefined,
    viral_score: expData.viral_score,
    topic: expData.topic,
    format: expData.format,  // Sprint 615: track video format for A/B analysis
    posted_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
  };
  fs.appendFileSync(manualPostsPath, JSON.stringify(entry) + '\n', 'utf-8');

  const updated = readRealPosts();
  const postCount = updated.length;
  const totalViews = updated.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const postsLeft = Math.max(0, 30 - postCount);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

  const unknownWarn = !knownVideo ? `\n⚠️ _Video ID not found in ledger — recording anyway_` : '';

  // Sprint 1138 (wave 14): views progress bar
  const viewPct = Math.min(100, Math.round((totalViews / 500) * 100));
  const viewFilled = Math.round(viewPct / 5);
  const viewBar = '█'.repeat(viewFilled) + '░'.repeat(20 - viewFilled);

  return (
    `✅ *Post recorded!*\n\n` +
    `Video: \`${videoId}\`\n` +
    `Views: ${views}${title ? `\nTitle: ${title}` : ''}${tiktokUrl ? `\n🔗 TikTok URL saved (views will update automatically)` : ''}${unknownWarn}\n\n` +
    `📊 *Gate progress:* ${postCount}/30 posts · ${totalViews}/500 views\n` +
    `\`[${viewBar}]\` ${viewPct}% views toward gate\n` +
    `${postsLeft > 0 ? `⏳ ${postsLeft} more posts needed · ${daysLeft}d to Apr 7` : '✅ Post target met!'}` +
    // Sprint 1129: suggest view-update if URL was saved
    (tiktokUrl ? `\n\n💡 _To update views later: \`/updateviews ${videoId}\`_` : '')
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

  // Sprint 778: Show curated post manifest at top (if exists)
  const manifestPath = path.join(ROOT, 'workspace', 'scs001', 'manual-post-queue', 'post-manifest.json');
  let manifestSection = '';
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const unpostedManifest = (manifest.videos ?? []).filter((v: any) => !v.posted);
      if (unpostedManifest.length > 0) {
        const mLines = unpostedManifest.slice(0, 5).map((v: any) => {
          const fmt = (v.format ?? '').toUpperCase().slice(0, 3);
          const topic = (v.topic ?? '').slice(0, 45);
          return `  ${v.order}. [${fmt}] ${topic}`;
        });
        manifestSection = `🎯 *Curated Post Queue* (${unpostedManifest.length} videos)\n` +
          mLines.join('\n') + '\n\n';
      }
    } catch { /* ignore */ }
  }

  // Sprint 392: Filter archived videos from queue
  const archivedIds = loadArchived();
  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && !archivedIds.has(e.video_id))
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

  if (unposted.length === 0) {
    return (
      manifestSection +
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
    manifestSection +
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

  // Sprint 1093: views-needed line when gate is not met
  const totalViews = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const viewsNeeded = Math.max(0, 500 - totalViews);

  // Sprint 1120 (wave 12): yesterday views
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const yesterdayViews = posts
    .filter((p: any) => (p.posted_at ?? p.recorded_at ?? '').startsWith(yesterday))
    .reduce((s: number, p: any) => s + (p.views ?? 0), 0);

  if (posts.length >= 30 && totalViews >= 500) {
    lines.push('🎉 *Phase 1.5 gate met!* Posts: 30/30 · Views: 500/500 — proceed to Phase 2.\n');
  } else {
    lines.push(`📊 *Gate:* ${posts.length}/30 posts · ${daysLeft}d left · ${dailyTarget}/day needed`);
    if (viewsNeeded > 0) {
      lines.push(`👁️ *Views:* ${totalViews}/500 — *${viewsNeeded} more views needed* · Yesterday: ${yesterdayViews} views`);
    } else {
      lines.push(`👁️ *Views:* ${totalViews}/500 ✅ · Yesterday: ${yesterdayViews} views`);
    }
    // Sprint 1132 (wave 13): pace comparison (actual posts/day vs needed/day)
    const DRY_METHODS_PACE = ['browser-post-dry', 'batch-browser-dry', 'dry'];
    const allPostsForPace = posts.filter((p: any) => !DRY_METHODS_PACE.some((d: string) => String(p.method || '').includes(d)));
    if (allPostsForPace.length > 1) {
      const firstTs = allPostsForPace
        .map((p: any) => new Date(p.posted_at ?? p.recorded_at).getTime())
        .filter((t: number) => !isNaN(t))
        .sort((a: number, b: number) => a - b)[0];
      if (firstTs) {
        const daysSinceFirst = Math.max(1, (Date.now() - firstTs) / 86_400_000);
        const actualPace = allPostsForPace.length / daysSinceFirst;
        const paceIcon = actualPace >= dailyTarget ? '✅' : actualPace >= dailyTarget * 0.75 ? '⚠️' : '❌';
        lines.push(`${paceIcon} *Pace:* ${actualPace.toFixed(1)}/day actual vs *${dailyTarget}/day* needed`);
      }
    }
    // Sprint 1110: bold warning when obligation unmet
    if (!goalMet && dailyTarget > 0) {
      lines.push(`📅 *Today:* ${todayPosts}/${dailyTarget} posted — ⚠️ *OBLIGATION UNMET — post ${dailyTarget - todayPosts} more*\n`);
    } else {
      lines.push(`📅 *Today:* ${todayPosts}/${dailyTarget} posted ✅ ON TRACK\n`);
    }
  }

  // Sprint 1142 (wave 16): ready vs captioned breakdown
  const captionedCount = ready.length;
  const uncaptionedCount = unposted.length - captionedCount;
  lines.push(`📦 *Queue:* ${captionedCount} ready (captioned) · ${uncaptionedCount} uncaptioned · ${unposted.length} total unposted`);

  // Sprint 1142 (wave 18): warn if top ready video is >48h old (stale trend topic)
  try {
    if (ready.length > 0) {
      const topId = ready[0].video_id;
      const topEntry = (ledger as any[]).find((e: any) => e.video_id === topId);
      const topTs = topEntry?.delivered_at ?? topEntry?.created_at ?? topEntry?.timestamp;
      if (topTs) {
        const ageH = (Date.now() - new Date(topTs).getTime()) / 3600000;
        if (ageH > 48) {
          lines.push(`⚠️ *Top video is ${Math.round(ageH / 24)}d old* (\`${topId}\`) — trending topics may have expired`);
        }
      }
    }
  } catch { /* skip */ }

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
    // Sprint 1125: pre-filled /record commands for top videos
    lines.push('*📋 After posting, record each one:*');
    for (let i = 0; i < topN; i++) {
      lines.push(`\`/record ${ready[i].video_id} 0\``);
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

  // Sprint 1144 (wave 17): next posting slot countdown
  try {
    const nowMs = Date.now();
    const todayBase = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
    const slots = [
      { label: '7:00 AM', ms: todayBase.getTime() + 7 * 3600000 },
      { label: '12:00 PM', ms: todayBase.getTime() + 12 * 3600000 },
      { label: '7:00 PM', ms: todayBase.getTime() + 19 * 3600000 },
    ];
    const next = slots.find(s => s.ms > nowMs);
    if (next) {
      const diffMs = next.ms - nowMs;
      const diffH = Math.floor(diffMs / 3600000);
      const diffM = Math.floor((diffMs % 3600000) / 60000);
      const countdownStr = diffH > 0 ? `${diffH}h ${diffM}m` : `${diffM}m`;
      lines.push(`\n⏱ *Next slot:* ${next.label} — in *${countdownStr}*`);
    }
  } catch { /* skip */ }

  // Sprint 1141 (wave 15): Telegram bot env check
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    const missing = [!botToken && 'TELEGRAM_BOT_TOKEN', !chatId && 'OWNER_TELEGRAM_CHAT_ID'].filter(Boolean);
    lines.push(`\n⚠️ *Bot config missing:* ${missing.join(', ')} not set — Telegram commands may not work`);
  }

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

// Sprint 478: /diversity — niche distribution analysis
export function cmdDiversity(): string {
  const topicMap = loadTopicMap();
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));

  // Last 10 posts diversity
  const recent10 = posts.slice(-10);
  const postDiversity = getNicheDiversityScore(recent10, topicMap);

  // Queue diversity (ready to post)
  const recordedIds = new Set(posts.map((p: any) => p.video_id).filter(Boolean));
  const ready = (ledger as any[]).filter((e: any) => !recordedIds.has(e.video_id) && e.video_id);
  const queueDiversity = getNicheDiversityScore(ready.slice(0, 20), topicMap);

  const lines = [
    '🎯 *Content Diversity Report*',
    '',
    `*Last 10 Posts* (score: ${postDiversity.score}/100):`,
  ];

  const sortedPost = Object.entries(postDiversity.distribution).sort((a, b) => b[1] - a[1]);
  for (const [topic, count] of sortedPost) {
    const pct = Math.round((count / Math.max(postDiversity.total, 1)) * 100);
    const warn = pct > 30 ? ' ⚠️' : '';
    lines.push(`  ${topic}: ${count} (${pct}%)${warn}`);
  }

  lines.push('');
  lines.push(`*Queue (next 20)* (score: ${queueDiversity.score}/100):`);
  const sortedQueue = Object.entries(queueDiversity.distribution).sort((a, b) => b[1] - a[1]);
  for (const [topic, count] of sortedQueue.slice(0, 8)) {
    const pct = Math.round((count / Math.max(queueDiversity.total, 1)) * 100);
    const warn = pct > 30 ? ' ⚠️' : '';
    lines.push(`  ${topic}: ${count} (${pct}%)${warn}`);
  }

  lines.push('');
  lines.push('_Target: no niche >30% in any 10-post window_');
  if (postDiversity.score < 50) {
    lines.push('⚠️ Low diversity — consider varying topics before next post');
  }

  return lines.join('\n');
}

// Sprint 468: /thumbnail — generate YouTube Shorts thumbnail
export function cmdThumbnail(args: string): string {
  const videoId = args.trim();
  if (!videoId) {
    return '🖼 *Thumbnail Generator*\n\nUsage: `/thumbnail <video_id>`\n\nExtracts hook-moment frame + adds text overlay.';
  }

  try {
    const { generateThumbnail } = require('../scs001/generate-thumbnail');
    const result = generateThumbnail(videoId);
    if (result) {
      const size = require('fs').statSync(result).size;
      return `🖼 *Thumbnail Generated*\n\n🎬 \`${videoId}\`\n📁 ${result}\n📊 ${Math.round(size / 1024)}KB\n\n_Use with YouTube Shorts upload._`;
    } else {
      return `❌ Failed to generate thumbnail for \`${videoId}\`.\n\nCheck: video exists and has captioned mp4.`;
    }
  } catch (err: any) {
    return `❌ Thumbnail error: ${err.message}`;
  }
}

// Sprint 479: Competitor analysis feed
export function cmdCompetitor(args: string): string {
  const COMP_PATH = path.join(ROOT, 'workspace', 'scs001', 'competitors.json');

  const parts = args.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    // Show competitor summary
    try {
      const { competitorSummary } = require('../../agents/scs001-trend/competitor-feed');
      return competitorSummary();
    } catch (e: any) {
      return `❌ Error loading competitors: ${e.message}`;
    }
  }

  if (sub === 'add') {
    // /competitor add @handle niche followers avg_views freq hook1,hook2 topic1|topic2
    if (parts.length < 4) {
      return '📋 Usage: /competitor add @handle niche followers [avg_views] [freq] [hooks] [topics]\n\nExample: /competitor add @techguru ai 150000 30000 2/day curiosity-gap,tutorial AI tools|ChatGPT';
    }
    const handle = parts[1];
    const niche = parts[2];
    const followers = parseInt(parts[3]) || 0;
    const avg_views = parseInt(parts[4]) || 0;
    const freq = parts[5] || '1/day';
    const hooks = parts[6]?.split(',') ?? [];
    const topics = parts[7]?.split('|') ?? [];

    try {
      const { addCompetitor } = require('../../agents/scs001-trend/competitor-feed');
      addCompetitor({
        handle, niche, followers, avg_views,
        posting_frequency: freq,
        hook_formulas: hooks,
        top_topics: topics,
        last_updated: new Date().toISOString().slice(0, 10),
      });
      return `✅ Competitor ${handle} added to ${niche} niche.\n\n👥 ${followers.toLocaleString()} followers | 👁 ${avg_views.toLocaleString()} avg views\n🎣 Hooks: ${hooks.join(', ') || 'none'}\n📌 Topics: ${topics.join(', ') || 'none'}`;
    } catch (e: any) {
      return `❌ Error adding competitor: ${e.message}`;
    }
  }

  if (sub === 'remove') {
    const handle = parts[1];
    if (!handle) return 'Usage: /competitor remove @handle';
    try {
      const { removeCompetitor } = require('../../agents/scs001-trend/competitor-feed');
      const removed = removeCompetitor(handle);
      return removed ? `✅ Removed ${handle} from competitor feed.` : `❌ ${handle} not found.`;
    } catch (e: any) {
      return `❌ Error: ${e.message}`;
    }
  }

  if (sub === 'topics') {
    try {
      const { getCompetitorTopics } = require('../../agents/scs001-trend/competitor-feed');
      const topics: string[] = getCompetitorTopics();
      if (topics.length === 0) return 'No competitor topics yet.';
      return `🔥 Competitor-sourced topics (${topics.length}):\n\n${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
    } catch (e: any) {
      return `❌ Error: ${e.message}`;
    }
  }

  return '📊 /competitor commands:\n• /competitor list — show all tracked competitors\n• /competitor add @handle niche followers [avg_views] [freq] [hooks] [topics]\n• /competitor remove @handle\n• /competitor topics — show competitor-sourced topics';
}

// Sprint 536: Production + delivery stats summary
export function cmdStats(): string {
  try {
    const { execSync } = require('child_process');
    execSync('npx ts-node --transpile-only scripts/scs001/generate-stats-report.ts', {
      cwd: ROOT, timeout: 30000, stdio: 'pipe',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    });

    const reportPath = path.join(ROOT, 'reports', 'stats-latest.json');
    if (!fs.existsSync(reportPath)) return '❌ Stats report not generated.';

    const r = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const totalDelivered = r.delivery.auto_delivered_total + r.delivery.telegram_sent_total;

    return [
      `📊 *Kognai Stats*\n`,
      `*Production*`,
      `  Videos: ${r.production.total_videos} total | ${r.production.videos_today} today | ${r.production.videos_this_week} this week`,
      `  Runs: ${r.production.pipeline_runs_total} total | ${r.production.pipeline_runs_today} today\n`,
      `*Delivery*`,
      `  Auto: ${r.delivery.auto_delivered_total} | Manual: ${r.delivery.telegram_sent_total} | Total: ${totalDelivered}\n`,
      `*Cost*`,
      `  Total: $${r.costs.total_usd} | Today: $${r.costs.today_usd} | Per video: $${r.costs.avg_per_video_usd}\n`,
      `*Quality*`,
      `  Diversity: ${r.quality.diversity_score}/100 | Topics: ${r.quality.unique_topics} | Hooks: ${r.quality.hook_types}\n`,
      `*Gate (Apr 7)*`,
      `  ${totalDelivered}/${r.gate.posts_target} delivered | ${r.gate.days_remaining} days left | ${r.gate.on_track ? '✅ ON TRACK' : '⚠️ BEHIND'}`,
    ].join('\n');
  } catch (e: any) {
    return `❌ Stats error: ${e.message}`;
  }
}

// Sprint 565: Script quality check results
export function cmdQuality(): string {
  try {
    const output = execSync('npx ts-node --transpile-only scripts/scs001/script-quality-check.ts', {
      cwd: ROOT, timeout: 30000, encoding: 'utf-8',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    });
    return `🔍 *Script Quality*\n\n${output.trim()}`;
  } catch (e: any) {
    return `❌ Quality check error: ${e.message}`;
  }
}

// Sprint 590: /radar — show latest trending topics from topic radar
export function cmdRadar(): string {
  const radarDir = path.join(ROOT, 'workspace', 'scs001', 'topic-radar');
  if (!fs.existsSync(radarDir)) return '❌ *Topic Radar* — no radar data yet. Run: `npx ts-node scripts/scs001/topic-radar.ts`';

  const files = fs.readdirSync(radarDir)
    .filter(f => f.startsWith('radar-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) return '❌ *Topic Radar* — no radar scans found.';

  const latest = readJSON<any>(path.join(radarDir, files[0]));
  if (!latest) return '❌ *Topic Radar* — could not parse latest scan.';

  const topics = latest.topics || [];
  const scanTime = latest.collected_at ? new Date(latest.collected_at).toLocaleString('en-GB', { timeZone: 'UTC' }) : 'unknown';
  const sourceHits = latest.sources_hit || [];
  const errors = latest.errors || [];

  if (topics.length === 0) {
    return [
      `📡 *Topic Radar* — Last scan: ${scanTime}`,
      `Sources: ${sourceHits.join(', ') || 'none'}`,
      errors.length > 0 ? `⚠️ Errors: ${errors.length}` : '',
      '',
      '_No trending topics found. Try again later._',
    ].filter(Boolean).join('\n');
  }

  const formatEmoji: Record<string, string> = { explainer: '📝', debate: '⚔️', vision: '🔮' };
  const topicLines = topics.slice(0, 10).map((t: any, i: number) => {
    const emoji = formatEmoji[t.format] || '📌';
    const conf = t.confidence != null ? ` (${t.confidence}%)` : '';
    const src = t.source ? ` _[${t.source}]_` : '';
    return `${i + 1}. ${emoji} *${t.title}*${conf}${src}`;
  });

  return [
    `📡 *Topic Radar* — ${topics.length} topics | ${scanTime}`,
    `Sources: ${sourceHits.join(', ') || 'various'}${errors.length > 0 ? ` | ⚠️ ${errors.length} errors` : ''}`,
    `Scans on file: ${files.length}`,
    '',
    ...topicLines,
    '',
    '_Run /radar to refresh • Topics feed into pipeline-cron_',
  ].join('\n');
}

// Sprint 597: /backtest — compare hook formulas by QC pass rate and viral score
export function cmdBacktest(): string {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (!fs.existsSync(expPath)) {
    return '🧪 *Backtest* — no experiments.jsonl found.';
  }

  const entries = readLines(expPath) as Array<{
    hook_formula?: string;
    qc_passed?: boolean;
    partial_viral_score?: number;
    clip_id?: string;
  }>;

  if (entries.length === 0) {
    return '🧪 *Backtest* — no experiment data.';
  }

  // Aggregate by hook formula
  const stats: Record<string, { count: number; passed: number; scores: number[]; ids: string[] }> = {};
  for (const e of entries) {
    const formula = e.hook_formula ?? 'unknown';
    if (!stats[formula]) stats[formula] = { count: 0, passed: 0, scores: [], ids: [] };
    stats[formula].count++;
    if (e.qc_passed) stats[formula].passed++;
    if (e.partial_viral_score != null) stats[formula].scores.push(e.partial_viral_score);
    if (e.clip_id) stats[formula].ids.push(e.clip_id);
  }

  // Sort by QC pass rate (desc), then by count (desc)
  const sorted = Object.entries(stats)
    .sort((a, b) => {
      const rateA = a[1].count > 0 ? a[1].passed / a[1].count : 0;
      const rateB = b[1].count > 0 ? b[1].passed / b[1].count : 0;
      if (rateB !== rateA) return rateB - rateA;
      return b[1].count - a[1].count;
    });

  const lines: string[] = ['🧪 *Hook Formula Backtest*', ''];

  for (const [formula, s] of sorted.slice(0, 10)) {
    const passRate = s.count > 0 ? Math.round((s.passed / s.count) * 100) : 0;
    const avgScore = s.scores.length > 0
      ? (s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(2)
      : 'n/a';
    const icon = passRate >= 80 ? '🟢' : passRate >= 50 ? '🟡' : '🔴';
    lines.push(`${icon} *${formula}*`);
    lines.push(`  QC: ${s.passed}/${s.count} (${passRate}%) | Viral: ${avgScore} | n=${s.count}`);
  }

  lines.push('');
  lines.push(`_${entries.length} experiments | ${sorted.length} formulas_`);

  return lines.join('\n');
}

// Sprint 615: /formatstats — Video format performance breakdown
export function cmdFormatStats(): string {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const manualPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

  const formatStats: Record<string, { produced: number; published: number; posted: number; totalViews: number; totalViral: number; viralCount: number }> = {};
  const knownFormats = ['explainer', 'debate', 'vision', 'listicle'];

  for (const f of knownFormats) {
    formatStats[f] = { produced: 0, published: 0, posted: 0, totalViews: 0, totalViral: 0, viralCount: 0 };
  }

  // Count from experiments (produced)
  if (fs.existsSync(expPath)) {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const fmt = e.format || 'explainer';
        if (!formatStats[fmt]) formatStats[fmt] = { produced: 0, published: 0, posted: 0, totalViews: 0, totalViral: 0, viralCount: 0 };
        formatStats[fmt].produced++;
        if (e.partial_viral_score != null) {
          formatStats[fmt].totalViral += e.partial_viral_score;
          formatStats[fmt].viralCount++;
        }
      } catch { /* skip */ }
    }
  }

  // Count from ledger (published = ready)
  if (fs.existsSync(ledgerPath)) {
    for (const line of fs.readFileSync(ledgerPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const exp = getExperimentData(e.video_id);
        const fmt = exp.format || 'explainer';
        if (formatStats[fmt]) formatStats[fmt].published++;
      } catch { /* skip */ }
    }
  }

  // Count from manual posts (posted + views)
  if (fs.existsSync(manualPath)) {
    for (const line of fs.readFileSync(manualPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const fmt = e.format || 'explainer';
        if (formatStats[fmt]) {
          formatStats[fmt].posted++;
          formatStats[fmt].totalViews += e.views ?? 0;
        }
      } catch { /* skip */ }
    }
  }

  const lines: string[] = ['🎬 *Format Performance Stats*', ''];

  for (const [fmt, s] of Object.entries(formatStats)) {
    const avgViral = s.viralCount > 0 ? (s.totalViral / s.viralCount).toFixed(2) : '—';
    const avgViews = s.posted > 0 ? Math.round(s.totalViews / s.posted) : '—';
    const icon = fmt === 'explainer' ? '📝' : fmt === 'debate' ? '⚔️' : fmt === 'vision' ? '🔮' : '📋';
    lines.push(`${icon} *${fmt.toUpperCase()}*`);
    lines.push(`  Produced: ${s.produced} | Ready: ${s.published} | Posted: ${s.posted}`);
    lines.push(`  Avg viral: ${avgViral} | Avg views: ${avgViews}`);
    lines.push('');
  }

  const totalProduced = Object.values(formatStats).reduce((a, s) => a + s.produced, 0);
  lines.push(`_Total: ${totalProduced} experiments across ${Object.keys(formatStats).length} formats_`);

  return lines.join('\n');
}

// Sprint 670: /manifesto — preview X manifesto thread
export function cmdManifesto(): string {
  const threadPath = path.join(ROOT, 'workspace', 'launch', 'manifesto-thread.json');
  if (!fs.existsSync(threadPath)) return '❌ *Manifesto Thread* — not built yet.';
  try {
    const data = JSON.parse(fs.readFileSync(threadPath, 'utf-8'));
    const posts: Array<{ id: number; text: string }> = data.posts ?? [];
    if (posts.length === 0) return '❌ *Manifesto Thread* — no posts found.';

    const lines = [
      `📜 *Kognai Manifesto No.1* — ${posts.length} posts`,
      `Status: ${data.status ?? 'unknown'} | Source: ${data.source ?? 'unknown'}`,
      '',
    ];
    for (const p of posts) {
      const text = (p.text ?? '').replace(/[*_`]/g, '');
      const preview = text.length > 120 ? text.slice(0, 117) + '...' : text;
      lines.push(`*${p.id}/${posts.length}*  ${preview}`);
    }
    lines.push('');
    lines.push('_Ready for April 8-15 launch window_');
    return lines.join('\n');
  } catch { return '❌ *Manifesto Thread* — parse error.'; }
}

// Sprint 672: /valerrors — show recent script validation errors
export function cmdValErrors(): string {
  const errPath = path.join(ROOT, 'workspace', 'scs001', 'validation-errors.jsonl');
  if (!fs.existsSync(errPath)) return '✅ No validation errors recorded.';
  const lines = fs.readFileSync(errPath, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length === 0) return '✅ No validation errors recorded.';

  const errors = lines.slice(-10).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (errors.length === 0) return '✅ No validation errors (parse failed).';

  const out: string[] = ['📋 *Validation Errors* (last ' + errors.length + '/' + lines.length + ')'];
  for (const e of errors) {
    const ts = e.timestamp ? new Date(e.timestamp).toISOString().slice(5, 16).replace('T', ' ') : '?';
    out.push(`\n*${e.clip_id ?? e.script_id ?? '?'}* (${ts})`);
    for (const err of (e.errors ?? [])) out.push(`  • ${err}`);
  }
  out.push('\n_Thresholds: 4-7 segments, 20-60s, 6+ interrupts_'); // Sprint 1215: max widened 35→60
  return out.join('\n');
}

// Sprint 1016: /caption-next — auto-pick top unposted video and show caption
export function cmdCaptionNext(): string {
  const deliveredPath = path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');

  if (!fs.existsSync(deliveredPath)) return '⚠️ No auto-delivered.jsonl found. Generate videos first.';

  // Load posted IDs (excluding dry runs)
  const postedIds = new Set<string>(readRealPosts().map((e: any) => e.video_id).filter(Boolean));

  // Find top unposted candidate with an mp4
  const candidates: Array<{ video_id: string; viral_score: number; mp4: string; topic?: string }> = [];
  fs.readFileSync(deliveredPath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
    try {
      const e = JSON.parse(l);
      if (!e.video_id || postedIds.has(e.video_id)) return;
      const mp4 = e.mp4_path && fs.existsSync(e.mp4_path) ? e.mp4_path : findCaptionedMp4(e.video_id);
      if (mp4) candidates.push({ video_id: e.video_id, viral_score: e.viral_score ?? 0, mp4, topic: e.topic });
    } catch {}
  });

  if (candidates.length === 0) return '⚠️ No unposted videos with mp4 found. Check /postnext.';

  candidates.sort((a, b) => b.viral_score - a.viral_score);
  const top = candidates[0];
  const caption = buildTikTokCaption(top.video_id);
  const exp = getExperimentData(top.video_id);

  const lines: string[] = [
    `🎯 *Next video to post*`,
    `\`${top.video_id}\` · score: ${top.viral_score.toFixed(2)}`,
    '',
    top.topic ? `📝 ${top.topic.slice(0, 70)}` : '',
    '',
    `*Caption (copy & paste into TikTok):*`,
    `\`\`\``,
    caption,
    `\`\`\``,
    '',
    `📁 File: \`${top.mp4}\``,
    '',
    `_After posting, record it:_`,
    `\`/record ${top.video_id} 0\``,
    '',
    `(${candidates.length - 1} more unposted · ${postedIds.size}/30 gate posts)`,
  ].filter(l => l !== undefined);

  return lines.join('\n');
}
