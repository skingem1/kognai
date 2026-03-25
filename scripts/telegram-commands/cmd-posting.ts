/**
 * Telegram bot commands — extracted from telegram-bot.ts (Sprint 455)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';
import {
  ROOT, readJSON, readLines, readRealPosts, getPm2List, fmtUptime, fmtMem, latestSprintFile,
  findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived, saveArchived, ARCHIVE_PATH,
} from './shared';

export function cmdMetrics(): string {
  const metricsPath = path.join(ROOT, 'reports', 'pipeline-metrics.json');

  // Auto-regenerate if missing
  if (!fs.existsSync(metricsPath)) {
    try {
      const { execSync } = require('child_process');
      execSync('npx ts-node --transpile-only scripts/scs001/aggregate-pipeline-metrics.ts', {
        cwd: ROOT, timeout: 30000, stdio: 'pipe'
      });
    } catch { /* will still try to read whatever exists */ }
  }

  if (!fs.existsSync(metricsPath)) {
    return '⚠️ No pipeline metrics available.\nRun: `npx ts-node scripts/scs001/aggregate-pipeline-metrics.ts`';
  }

  let m: any;
  try {
    m = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
  } catch {
    return '⚠️ Could not parse pipeline-metrics.json';
  }

  const lines: string[] = [];
  lines.push('📊 *Pipeline Performance Metrics*');
  lines.push(`Period: ${m.period?.first ?? '?'} → ${m.period?.last ?? '?'}`);
  lines.push('');

  const avgMin = m.avg_duration_ms ? (m.avg_duration_ms / 60000).toFixed(1) : '?';
  lines.push('*Overview:*');
  lines.push(`• Runs: ${m.total_runs ?? 0} (${m.runs_per_day ?? 0}/day)`);
  lines.push(`• Avg duration: ${avgMin} min`);
  lines.push(`• Error rate: ${m.error_runs ?? 0}/${m.total_runs ?? 0}`);
  lines.push('');

  const c = m.cumulative ?? {};
  lines.push('*Cumulative Output:*');
  lines.push(`• Topics: ${c.topics_found ?? 0}`);
  lines.push(`• Clips: ${c.clips_discovered ?? 0}`);
  lines.push(`• Edited: ${c.videos_edited ?? 0}`);
  lines.push(`• Captioned: ${c.videos_captioned ?? 0}`);
  lines.push(`• QC passed: ${c.qc_passed ?? 0} (${c.qc_pass_rate_pct ?? 0}%)`);
  lines.push(`• Published: ${c.published ?? 0}`);
  lines.push('');

  const stageAvgs = m.stage_averages ?? {};
  const sorted = Object.entries(stageAvgs)
    .map(([stage, data]: [string, any]) => ({ stage, avgMs: data.avg_ms ?? 0 }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 3);

  if (sorted.length > 0) {
    lines.push('*Slowest Stages:*');
    for (const s of sorted) {
      const sec = (s.avgMs / 1000).toFixed(1);
      lines.push(`• ${s.stage}: ${sec}s avg`);
    }
  }

  return lines.join('\n');
}

export function cmdPostPlan(): string {
  const schedulePath = path.join(ROOT, 'reports', 'posting-schedule.json');

  // Sprint 1133: auto-generate schedule if missing or stale (>12h)
  const shouldGenerate = !fs.existsSync(schedulePath) || (() => {
    try { return Date.now() - fs.statSync(schedulePath).mtimeMs > 12 * 3600000; } catch { return true; }
  })();
  if (shouldGenerate) {
    try {
      const { generateSchedule } = require('../scs001/generate-posting-schedule');
      generateSchedule();
    } catch { /* fall through to read attempt */ }
  }

  if (!fs.existsSync(schedulePath)) {
    return '⚠️ No posting schedule found and auto-generation failed. Check /queue for available videos.';
  }

  let sched: any;
  try {
    sched = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
  } catch {
    return '⚠️ Could not parse posting-schedule.json.';
  }

  const lines: string[] = [
    '📅 *7-Day Posting Plan*',
    '',
    `🎯 Gate: *${sched.posts_needed ?? 30}* posts needed in *${sched.days_to_gate ?? '?'}* days`,
    `📊 Pace: *${sched.pace_needed ?? '?'}* posts/day`,
    `✅ Posted: *${sched.posts_done ?? 0}* / *${sched.gate_target ?? 30}*`,
    `📦 Queue: *${sched.queue_remaining ?? 0}* videos ready`,
    '',
  ];

  const slots: any[] = sched.slots ?? [];
  if (slots.length === 0) {
    lines.push('⚠️ No videos scheduled. Run /refresh first.');
  } else {
    let currentDate = '';
    for (const slot of slots) {
      if (slot.date !== currentDate) {
        currentDate = slot.date;
        const dayName = new Date(slot.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short' });
        lines.push(`*${dayName} ${slot.date}*`);
      }
      const score = Math.round((slot.viral_score ?? 0) * 100);
      const vid = (slot.video_id ?? '?').slice(0, 16);
      lines.push(`  ${slot.time} — \`${vid}\` · ${slot.speaker ?? '?'} (${slot.hook ?? '?'}, ${score}%)`);
    }
    lines.push('');
    lines.push(`_${slots.length} posts planned. /caption <id> for full caption._`);
  }

  return lines.join('\n');
}

export function cmdYouTube(): string {
  try {
    const { formatYouTubeStatus } = require('../scs001/youtube-shorts');
    return formatYouTubeStatus();
  } catch (e: any) {
    return `❌ YouTube status error: ${e.message}`;
  }
}

export function cmdAutoPost(): string {
  const hasClientKey = !!process.env.TIKTOK_CLIENT_KEY;
  const hasClientSecret = !!process.env.TIKTOK_CLIENT_SECRET;
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;
  const dryRun = process.env.AUTO_POST_DRY_RUN === '1';

  const lines = [
    `🤖 *Auto-Post Status*`,
    '',
    `*Credentials:*`,
    `${hasClientKey ? '✅' : '❌'} TIKTOK\\_CLIENT\\_KEY`,
    `${hasClientSecret ? '✅' : '❌'} TIKTOK\\_CLIENT\\_SECRET`,
    `${hasToken ? '✅' : '❌'} TIKTOK\\_ACCESS\\_TOKEN`,
    '',
  ];

  // Token expiry check
  const metaPath = path.join(ROOT, 'data', 'tiktok-token-meta.json');
  if (hasToken && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.expires_at) {
        const expiresAt = new Date(meta.expires_at);
        const hoursLeft = Math.round((expiresAt.getTime() - Date.now()) / 3600000);
        if (hoursLeft <= 0) {
          lines.push(`⏰ Token: *EXPIRED* ${Math.abs(hoursLeft)}h ago`);
          lines.push(`→ Run: \`npx ts-node scripts/tiktok-refresh-token.ts\``);
        } else {
          lines.push(`⏰ Token expires in: *${hoursLeft}h*`);
          if (meta.refresh_expires_at) {
            const refreshLeft = Math.round((new Date(meta.refresh_expires_at).getTime() - Date.now()) / 86400000);
            lines.push(`🔄 Refresh token: *${refreshLeft}d* remaining`);
          }
        }
      }
      lines.push('');
    } catch { /* skip */ }
  }

  // Mode
  if (hasToken) {
    if (dryRun) {
      lines.push(`*Mode:* 🟡 DRY-RUN (set AUTO\\_POST\\_DRY\\_RUN=0 to go live)`);
    } else {
      lines.push(`*Mode:* 🟢 LIVE — posting 2x/day via PM2`);
    }
  } else if (hasClientKey && hasClientSecret) {
    lines.push(`*Mode:* 🔴 BLOCKED — token needed`);
    lines.push('');
    lines.push(`*To fix:*`);
    lines.push(`1. SSH to server or open terminal`);
    lines.push(`2. Run: \`npx ts-node scripts/tiktok-oauth.ts\``);
    lines.push(`3. Open the URL in browser, authorize`);
    lines.push(`4. Token auto-saves to .env`);
    lines.push(`5. Auto-posting starts within 1 hour`);
  } else {
    lines.push(`*Mode:* 🔴 NOT CONFIGURED`);
    lines.push(`Add TIKTOK\\_CLIENT\\_KEY and TIKTOK\\_CLIENT\\_SECRET to .env first.`);
  }

  // Queue stats
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const unposted = ledger.filter((e: any) => !recordedIds.has(e.video_id) && e.video_id).length;

  lines.push('');
  lines.push(`📋 Queue: *${unposted}* unposted videos`);
  lines.push(`📊 Gate: *${recorded.length}/30* posts | *18d* to Apr 7`);

  return lines.join('\n');
}

export function cmdLastRun(): string {
  const latestPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
  if (!fs.existsSync(latestPath)) {
    return '⚠️ No pipeline run data found. Run /refresh first.';
  }

  let run: any;
  try {
    run = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
  } catch {
    return '⚠️ Could not parse latest.json';
  }

  const lines: string[] = [];
  const startedAt = run.started_at ? new Date(run.started_at).toLocaleString('en-GB', { timeZone: 'UTC' }) : '?';
  const totalMin = run.total_elapsed_ms ? (run.total_elapsed_ms / 60000).toFixed(1) : '?';

  lines.push('🔄 *Latest Pipeline Run*');
  lines.push(`ID: \`${run.run_id ?? '?'}\` · Mode: ${run.mode ?? '?'}`);
  lines.push(`Started: ${startedAt} UTC · Duration: ${totalMin} min`);
  lines.push('');

  const stages: any[] = run.stages ?? [];
  if (stages.length > 0) {
    lines.push('*Stages:*');
    for (const s of stages) {
      const icon = s.status === 'ok' ? '✅' : s.status === 'skipped' ? '⏭️' : '❌';
      const elapsed = s.elapsed_ms ? `${(s.elapsed_ms / 1000).toFixed(1)}s` : '';
      const count = s.count != null ? ` (${s.count})` : '';
      lines.push(`${icon} ${s.stage}${count} ${elapsed}`);
    }
  }

  if (run.summary) {
    const sm = run.summary;
    lines.push('');
    lines.push('*Output:*');
    if (sm.topics_found != null) lines.push(`📊 Topics: ${sm.topics_found}`);
    if (sm.clips_discovered != null) lines.push(`🎬 Clips: ${sm.clips_discovered}`);
    if (sm.videos_edited != null) lines.push(`✂️ Edited: ${sm.videos_edited}`);
    if (sm.videos_captioned != null) lines.push(`📝 Captioned: ${sm.videos_captioned}`);
    if (sm.qc_passed != null) lines.push(`✅ QC: ${sm.qc_passed}`);
    if (sm.published != null) lines.push(`📤 Published: ${sm.published}`);
  }

  if (run.error_count > 0) {
    lines.push('');
    lines.push(`⚠️ *${run.error_count} errors detected*`);
  }

  // Sprint 429: Speaker and hook distribution from this run's experiments
  if (run.run_id) {
    const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
    if (fs.existsSync(expPath)) {
      const speakers: Record<string, number> = {};
      const hooks: Record<string, number> = {};
      let runClips = 0;
      for (const l of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!l.trim()) continue;
        try {
          const e = JSON.parse(l);
          if (e.run_id !== run.run_id) continue;
          runClips++;
          const spk = e.speaker ?? 'unknown';
          const hook = e.hook_formula ?? 'unknown';
          speakers[spk] = (speakers[spk] ?? 0) + 1;
          hooks[hook] = (hooks[hook] ?? 0) + 1;
        } catch { /* skip */ }
      }
      if (runClips > 0) {
        const uniqueSpeakers = Object.keys(speakers).length;
        const diversityPct = Math.round((uniqueSpeakers / runClips) * 100);
        lines.push('');
        lines.push(`*Diversity (${runClips} clips):*`);
        lines.push(`🎙️ ${uniqueSpeakers} speakers (${diversityPct}% diversity)`);
        const topSpeakers = Object.entries(speakers).sort((a, b) => b[1] - a[1]).slice(0, 4);
        lines.push(topSpeakers.map(([s, c]) => `  • ${s}: ${c}`).join('\n'));
        const hookList = Object.entries(hooks).sort((a, b) => b[1] - a[1]);
        lines.push(`🎣 Hooks: ${hookList.map(([h, c]) => `${h}(${c})`).join(', ')}`);
      }
    }
  }

  return lines.join('\n');
}

export function cmdViral(): string {
  const topicsPath = path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
  if (!fs.existsSync(topicsPath)) {
    return '⚠️ No viral topics yet — run /refresh first.';
  }

  let topics: string[] = [];
  try {
    const data = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
    topics = (Array.isArray(data.topics) ? data.topics : []).slice(0, 10);
  } catch {
    return '⚠️ Failed to read viral-topics.json.';
  }

  if (topics.length === 0) return '⚠️ No viral topics yet — run /refresh first.';

  let freshness = '?';
  try {
    const stat = fs.statSync(topicsPath);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageH = Math.floor(ageMs / 3600000);
    if (ageH === 0) freshness = `${Math.floor(ageMs / 60000)}m ago`;
    else if (ageH < 24) freshness = `${ageH}h ago`;
    else freshness = `${Math.floor(ageH / 24)}d ago`;
  } catch { /* ignore */ }

  const lines: string[] = [
    `🔥 *Viral Topics* — top ${topics.length} trending`,
    `_(Updated: ${freshness})_`,
    '',
  ];
  topics.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  lines.push('');
  lines.push('💡 Use these for your next videos.');
  lines.push('→ /postnow for ready content | /queue for queue');

  return lines.join('\n');
}

export function cmdDashboard(): string {
  const lines: string[] = ['🏠 *Kognai Dashboard*', ''];

  // 1. TikTok Gate
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const posts = readLines(manualPostsPath);
  const posted = posts.length;
  const totalViews = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const gateDate = new Date('2026-04-07');
  const daysToGate = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));
  const gateIcon = posted >= 30 && totalViews >= 500 ? '✅' : posted === 0 ? '🔴' : '🟡';
  lines.push(`${gateIcon} *TikTok Gate* (Apr 7, ${daysToGate}d)`);
  lines.push(`  Posts: ${posted}/30 | Views: ${totalViews}/500`);

  // 2. Achiri Alpha
  const achiriAlpha = new Date('2026-04-25');
  const daysToAlpha = Math.max(0, Math.ceil((achiriAlpha.getTime() - Date.now()) / 86_400_000));
  let readinessScore = '?';
  const readinessPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
  if (fs.existsSync(readinessPath)) {
    try { readinessScore = `${JSON.parse(fs.readFileSync(readinessPath, 'utf-8')).score ?? '?'}%`; } catch {}
  }
  let waitlistCount = 0;
  const waitlistPath = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
  if (fs.existsSync(waitlistPath)) {
    waitlistCount = fs.readFileSync(waitlistPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  }
  lines.push('');
  lines.push(`🤖 *Achiri Alpha* (Apr 25, ${daysToAlpha}d)`);
  lines.push(`  Readiness: ${readinessScore} | Waitlist: ${waitlistCount}`);

  // 3. Stripe
  const stripeReady = !!process.env.STRIPE_SECRET_KEY;
  lines.push('');
  lines.push(`💳 *Stripe:* ${stripeReady ? '✅ Ready' : '❌ Not configured'}`);

  // 4. Upcoming Gates
  const gates = [
    { name: 'Phase 1.5', date: '2026-04-07', desc: '30 posts + 500 views' },
    { name: 'Phase 2A', date: '2026-04-11', desc: 'TikTok → Achiri' },
    { name: 'Achiri Alpha', date: '2026-04-25', desc: 'Lite launch' },
    { name: 'Voice Gate', date: '2026-05-01', desc: 'Voice works?' },
    { name: 'Memory Gate', date: '2026-05-14', desc: 'Memory works?' },
  ];
  lines.push('');
  lines.push('📅 *Upcoming Gates*');
  for (const g of gates) {
    const d = Math.max(0, Math.ceil((new Date(g.date).getTime() - Date.now()) / 86_400_000));
    if (d > 0) {
      lines.push(`  ${d <= 7 ? '⚠️' : '📌'} ${g.name}: ${d}d — ${g.desc}`);
    }
  }

  // 5. Missing env
  const missing = ['TIKTOK_ACCESS_TOKEN'].filter(k => !process.env[k]);
  if (missing.length > 0) {
    lines.push('');
    lines.push(`⚠️ *Missing:* ${missing.join(', ')}`);
  }

  // 6. Latest sprint
  try {
    const { execSync } = require('child_process');
    const gitLog = execSync('git log --oneline -1 2>/dev/null', { cwd: ROOT }).toString().trim();
    lines.push('');
    lines.push(`🔧 *Latest:* ${gitLog}`);
  } catch { /* skip */ }

  return lines.join('\n');
}

export function cmdDigest(): string {
  // Gate status (Sprint 1220: exclude dry-runs)
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const realPosts = readRealPosts();
  const postCount = realPosts.length;
  const totalViews = realPosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - postCount);
  const viewsNeeded = Math.max(0, 500 - totalViews);
  const postsPerDay = daysLeft > 0 && postsNeeded > 0 ? (postsNeeded / daysLeft).toFixed(1) : '0';

  let urgency = '🟢 ON TRACK';
  if (postsNeeded <= 0 && viewsNeeded <= 0) urgency = '✅ GATE MET';
  else if (daysLeft <= 3 && postsNeeded > 0) urgency = '🔴 KILL SWITCH IMMINENT';
  else if (daysLeft <= 7 && postsNeeded > 0) urgency = '🟠 CRITICAL';
  else if (postCount === 0) urgency = '🟡 WARNING — 0 posts';
  else if (daysLeft <= 14 && postsNeeded > 0) urgency = '🟡 WARNING';

  // Queue — top 3
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));

  const viralScores = new Map<string, number>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
      } catch {}
    }
  }

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));
  const queueCount = unposted.length;
  const top3 = unposted.slice(0, 3);

  // Stripe
  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_PORT'];
  const stripeMissing = stripeKeys.filter(k => !process.env[k]);
  const stripeReady = stripeMissing.length === 0;

  // TikTok token
  const tiktokReady = Boolean(process.env.TIKTOK_ACCESS_TOKEN);

  // Sprint 1107: yesterday's post count
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yesterdayPosts = realPosts.filter((e: any) => (e.posted_at ?? e.recorded_at ?? '').startsWith(yesterdayStr)).length;

  // Build message
  const out: string[] = [
    `📋 *Daily Digest* — ${now.toISOString().slice(0, 10)}`,
    `📌 Yesterday: *${yesterdayPosts}* posts`,
    '',
    `*Gate:* ${urgency}`,
    `📅 Apr 7 · ${daysLeft} days left`,
    `📊 Posts: ${postCount}/30 · Views: ${totalViews}/500`,
  ];

  if (postsNeeded > 0 && daysLeft > 0) {
    out.push(`⏱ Pace: ${postsPerDay} posts/day needed`);
  }

  // Sprint 1212: Godman + Achiri alpha launch countdown
  const godmanDays = Math.max(0, Math.ceil((new Date('2026-04-14T00:00:00Z').getTime() - now.getTime()) / 86_400_000));
  const achiriAlphaDays = Math.max(0, Math.ceil((new Date('2026-04-25T00:00:00Z').getTime() - now.getTime()) / 86_400_000));
  if (godmanDays > 0 || achiriAlphaDays > 0) {
    out.push('');
    if (godmanDays > 0) {
      const gIcon = godmanDays <= 3 ? '🔴' : godmanDays <= 7 ? '🟠' : godmanDays <= 14 ? '🟡' : '🚀';
      out.push(`${gIcon} *Godman launch:* ${godmanDays}d — April 14 · /godman-launch`);
    }
    if (achiriAlphaDays > 0) {
      const aIcon = achiriAlphaDays <= 3 ? '🔴' : achiriAlphaDays <= 7 ? '🟠' : achiriAlphaDays <= 14 ? '🟡' : '🤖';
      out.push(`${aIcon} *Achiri alpha:* ${achiriAlphaDays}d — April 25 · /achiri-launch`);
    }
  }

  out.push('');
  if (top3.length > 0) {
    out.push(`📦 *Queue:* ${queueCount} videos`);
    out.push('🎬 *Top 3 to post:*');
    for (let i = 0; i < top3.length; i++) {
      const v = top3[i];
      const vs = viralScores.get(v.video_id);
      const vsStr = vs != null ? ` 🧬${vs}` : '';
      out.push(`  ${i + 1}. \`${v.video_id}\`${vsStr}`);
    }
  } else {
    out.push(`📦 *Queue:* EMPTY — run /refresh to generate content`);
  }

  // Sprint 625: Achiri stats section
  const achiriCountsPath = path.join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
  const achiriWaitlistPath = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
  const achiriTiersPath = path.join(ROOT, 'workspace', 'achiri', 'user-tiers.json');
  let achiriDau = 0, achiriMsgToday = 0, achiriTotalUsers = 0, achiriWaitlist = 0, achiriPaid = 0;
  try {
    if (fs.existsSync(achiriCountsPath)) {
      const counts = JSON.parse(fs.readFileSync(achiriCountsPath, 'utf-8')) as Record<string, Record<string, number>>;
      const today = now.toISOString().slice(0, 10);
      const todayCounts = counts[today] ?? {};
      achiriDau = Object.keys(todayCounts).length;
      achiriMsgToday = Object.values(todayCounts).reduce((s, n) => s + n, 0);
      achiriTotalUsers = new Set(Object.values(counts).flatMap(d => Object.keys(d))).size;
    }
  } catch {}
  try {
    if (fs.existsSync(achiriWaitlistPath)) {
      achiriWaitlist = fs.readFileSync(achiriWaitlistPath, 'utf-8').split('\n').filter(l => l.trim()).length;
    }
  } catch {}
  try {
    if (fs.existsSync(achiriTiersPath)) {
      const tiers = JSON.parse(fs.readFileSync(achiriTiersPath, 'utf-8'));
      achiriPaid = Object.values(tiers).filter((t: any) => t.tier !== 'free').length;
    }
  } catch {}

  out.push('');
  out.push(`🤖 *Achiri:* ${achiriTotalUsers} users · ${achiriDau} DAU · ${achiriMsgToday} msg today`);
  if (achiriWaitlist > 0 || achiriPaid > 0) {
    out.push(`  Waitlist: ${achiriWaitlist} · Paid: ${achiriPaid}`);
  }

  // Sprint 640: Achiri test pass rate
  const achiriTestPath = path.join(ROOT, 'reports', 'achiri-test-suite.json');
  try {
    if (fs.existsSync(achiriTestPath)) {
      const tr = JSON.parse(fs.readFileSync(achiriTestPath, 'utf-8'));
      const icon = tr.failed === 0 ? '✅' : tr.failed <= 2 ? '⚠️' : '❌';
      out.push(`  ${icon} Tests: ${tr.passed}/${tr.total} pass`);
    }
  } catch {}

  // Sprint 626: Viral topic trends
  const viralTopicsPath = path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
  try {
    if (fs.existsSync(viralTopicsPath)) {
      const vt = JSON.parse(fs.readFileSync(viralTopicsPath, 'utf-8'));
      const topics: string[] = (vt.topics ?? []).slice(0, 5);
      if (topics.length > 0) {
        out.push('');
        out.push(`🔥 *Viral Topics:* ${topics.map(t => `#${t}`).join(' ')}`);
        if (vt.updated_at) {
          const age = Math.round((now.getTime() - new Date(vt.updated_at).getTime()) / 3_600_000);
          out.push(`  Updated ${age}h ago${age > 24 ? ' ⚠️ stale — run /refresh' : ''}`);
        }
      }
    }
  } catch {}

  // Sprint 626: Sprint velocity (last 5 from git log)
  try {
    const gitOut = execSync('git log --oneline -5 --grep="^Sprint" 2>/dev/null', { cwd: ROOT, encoding: 'utf-8', timeout: 5000 });
    const sprintLines = gitOut.trim().split('\n').filter(l => l.includes('Sprint'));
    if (sprintLines.length > 0) {
      out.push('');
      out.push(`🏃 *Velocity:* ${sprintLines.length} recent sprints`);
      for (const sl of sprintLines.slice(0, 3)) {
        const msg = sl.replace(/^[a-f0-9]+ /, '');
        out.push(`  • ${msg}`);
      }
    }
  } catch {}

  out.push('');
  out.push(`💳 *Stripe:* ${stripeReady ? '✅ Ready' : '❌ Not Ready'}`);
  // Sprint 1116: Stripe webhook health — last event age
  try {
    const whLogPath = path.join(ROOT, 'logs', 'stripe-webhook-out.log');
    if (fs.existsSync(whLogPath)) {
      const stat = fs.statSync(whLogPath);
      const ageH = Math.round((Date.now() - stat.mtimeMs) / 3_600_000);
      const whIcon = ageH > 72 ? '⚠️' : '✅';
      out.push(`  ${whIcon} Webhook: last activity ${ageH}h ago`);
    }
  } catch {}
  out.push(`🎵 *TikTok API:* ${tiktokReady ? '✅ Token set' : '❌ No token'}`);

  // Action items
  const actions: string[] = [];
  if (!tiktokReady) actions.push('• Set `TIKTOK\\_ACCESS\\_TOKEN` in .env');
  if (!stripeReady) actions.push('• Configure missing Stripe env vars');
  if (postsNeeded > 0) {
    const dailyTarget = daysLeft > 0 ? Math.ceil(postsNeeded / daysLeft) : postsNeeded;
    actions.push(`• Post *${dailyTarget}* videos today — /pickup to start`);
    actions.push('• After each post: `/record <id> <views> <tiktok_url>`');
    // Sprint 1134: urgent posting CTA when behind pace
    if (dailyTarget >= 3) {
      actions.push('⚡ *URGENT:* /gate-sim shows you need ' + dailyTarget + '/day to make the gate');
    }
  }
  if (queueCount === 0) actions.push('• Run `/refresh` to fill the queue');

  if (actions.length > 0) {
    out.push('', '*Action items:*', ...actions);
  }

  // Sprint 1117: Achiri alpha countdown in footer
  try {
    const readinessPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
    if (fs.existsSync(readinessPath)) {
      const data = JSON.parse(fs.readFileSync(readinessPath, 'utf-8'));
      if (data.alpha_date) {
        const alphaMs = new Date(data.alpha_date).getTime() - now.getTime();
        const alphaDays = Math.max(0, Math.ceil(alphaMs / 86_400_000));
        if (alphaDays <= 30) {
          out.push('');
          out.push(`🤖 *Achiri Alpha:* ${alphaDays}d to launch (${data.alpha_date})`);
        }
      }
    }
  } catch {}

  // Sprint 1141 (wave 16): Phase 1.5 gate bar chart (posts + views %)
  try {
    const postPct = Math.min(100, Math.round((postCount / 30) * 100));
    const viewPct = Math.min(100, Math.round((totalViews / 500) * 100));
    const mkBar = (pct: number) => { const f = Math.round(pct / 5); return '█'.repeat(f) + '░'.repeat(20 - f); };
    out.push('');
    out.push(`*📊 Phase 1.5 Gate Progress:*`);
    out.push(`Posts: \`[${mkBar(postPct)}]\` ${postPct}% (${postCount}/30)`);
    out.push(`Views: \`[${mkBar(viewPct)}]\` ${viewPct}% (${totalViews}/500)`);
  } catch { /* skip */ }

  return out.join('\n');
}

export function cmdSchedule(): string {
  const schedulePath = path.join(ROOT, 'reports', 'posting-schedule.json');
  if (!fs.existsSync(schedulePath)) {
    return '📅 No posting schedule found.\nRun the schedule generator first.';
  }

  try {
    const data = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);

    const lines: string[] = [
      `📅 *Posting Schedule*`,
      `Gate: ${data.posted ?? 0}/30 posts · ${data.days_left ?? '?'}d left · ${data.pace_needed ?? '?'}/day needed`,
      `Coverage: ${data.coverage ?? '?'} (${data.videos_assigned ?? 0} slots assigned)`,
      '',
    ];

    const schedule: Array<{ date: string; day: string; slots: Array<{ time: string; video_id: string | null; viral_score: number; topic?: string }> }> = data.schedule ?? [];

    const todayEntry = schedule.find(s => s.date === today);
    if (todayEntry) {
      lines.push(`*Today (${today} ${todayEntry.day}):*`);
      for (const slot of todayEntry.slots) {
        if (slot.video_id) {
          const score = slot.viral_score > 0 ? ` 🧬 ${slot.viral_score.toFixed(2)}` : '';
          const topic = slot.topic ? ` — ${slot.topic.slice(0, 40)}` : '';
          lines.push(`  ${slot.time}: \`${slot.video_id}\`${score}${topic}`);
        } else {
          lines.push(`  ${slot.time}: _(need more videos)_`);
        }
      }
      lines.push('');
    } else {
      lines.push(`_No slots scheduled for today (${today})._`);
      lines.push('');
    }

    const upcoming = schedule.filter(s => s.date > today).slice(0, 3);
    if (upcoming.length > 0) {
      lines.push('*Upcoming:*');
      for (const day of upcoming) {
        const vids = day.slots.filter(s => s.video_id).map(s => `\`${s.video_id}\``).join(', ');
        lines.push(`  ${day.date} (${day.day}): ${vids || '(empty)'}`);
      }
      lines.push('');
    }

    lines.push(`_Available: ${data.videos_available ?? '?'} videos · Generated: ${data.generated_at ? data.generated_at.split('T')[0] : '?'}_`);

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading schedule: ${e.message}`;
  }
}

export function cmdLeaderboard(): string {
  const lbPath = path.join(ROOT, 'reports', 'content-leaderboard.json');
  if (!fs.existsSync(lbPath)) {
    return '🏆 No content leaderboard found.\nRun the leaderboard generator first.';
  }

  try {
    const data = JSON.parse(fs.readFileSync(lbPath, 'utf-8'));
    const speakers: Array<{ name: string; count: number; avg_score: number; max_score: number; qc_rate: number }> = data.speakers ?? [];

    if (speakers.length === 0) {
      return '🏆 Leaderboard is empty — no speakers found.';
    }

    const lines: string[] = [
      `🏆 *Content Leaderboard*`,
      `Total experiments: ${data.total_experiments ?? '?'}`,
      '',
    ];

    const medals = ['🥇', '🥈', '🥉'];
    const top = speakers.slice(0, 10);

    for (let i = 0; i < top.length; i++) {
      const s = top[i];
      const medal = i < 3 ? medals[i] : `${i + 1}.`;
      lines.push(`${medal} *${s.name}* — avg ${Math.round(s.avg_score * 100)}% · max ${Math.round(s.max_score * 100)}%`);
      lines.push(`   ${s.count} clips · QC ${s.qc_rate}%`);
    }

    lines.push('');
    lines.push(`_${speakers.length} speakers total_`);
    lines.push(`_Generated: ${data.generated_at ? data.generated_at.split('T')[0] : 'unknown'}_`);

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading leaderboard: ${e.message}`;
  }
}

export function cmdBestTime(): string {
  const schedulePath = path.join(ROOT, 'reports', 'posting-schedule.json');
  if (!fs.existsSync(schedulePath)) {
    return '⚠️ No posting schedule found. Run /refresh first.';
  }

  let sched: any;
  try {
    sched = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
  } catch {
    return '⚠️ Could not parse posting-schedule.json.';
  }

  const slots: any[] = sched.slots ?? [];
  if (slots.length === 0) return '⚠️ No scheduled slots found.';

  // Group by time slot → avg viral score
  const timeStats: Record<string, { scores: number[]; count: number; label: string }> = {};
  for (const s of slots) {
    const time = s.time ?? '?';
    if (!timeStats[time]) timeStats[time] = { scores: [], count: 0, label: s.slot_label ?? time };
    timeStats[time].count++;
    if (s.viral_score != null) timeStats[time].scores.push(s.viral_score);
  }

  const ranked = Object.entries(timeStats)
    .map(([time, stats]) => ({
      time,
      label: stats.label,
      avg: stats.scores.length > 0 ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length : 0,
      count: stats.count,
    }))
    .sort((a, b) => b.avg - a.avg);

  // Today's remaining slots
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentHour = now.getHours();
  const todaySlots = slots
    .filter((s: any) => s.date === today && parseInt(s.time) > currentHour)
    .sort((a: any, b: any) => a.time.localeCompare(b.time));

  // Next 3 days upcoming
  const upcoming = slots
    .filter((s: any) => s.date >= today)
    .sort((a: any, b: any) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 6);

  const lines = [
    '⏰ *Best Posting Times*',
    '',
    '*Time slot rankings (by avg viral score):*',
  ];

  for (const r of ranked) {
    const avgPct = Math.round(r.avg * 100);
    const icon = r === ranked[0] ? '🏆' : '📊';
    lines.push(`${icon} *${r.label}* — avg ${avgPct}% · ${r.count} posts`);
  }

  if (todaySlots.length > 0) {
    lines.push('');
    lines.push('*Remaining today:*');
    for (const s of todaySlots) {
      const score = Math.round((s.viral_score ?? 0) * 100);
      lines.push(`  ⏰ ${s.slot_label ?? s.time} — ${s.speaker ?? '?'} (${score}%)`);
    }
  } else {
    lines.push('');
    lines.push('_No remaining slots today._');
  }

  if (upcoming.length > 0) {
    lines.push('');
    lines.push('*Upcoming schedule:*');
    for (const s of upcoming) {
      const score = Math.round((s.viral_score ?? 0) * 100);
      lines.push(`  📅 ${s.date} ${s.time} — ${s.speaker ?? '?'} (${score}%)`);
    }
  }

  lines.push('');
  lines.push(`📋 ${sched.pace_needed ?? '?'} posts/day needed for gate`);

  return lines.join('\n');
}

export function cmdHookTest(): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  if (experiments.length === 0) return '⚠️ No experiments found. Run pipeline first.';

  // Aggregate by hook formula
  const hookStats: Record<string, { scores: number[]; count: number; speakers: Set<string> }> = {};
  for (const e of experiments) {
    const hook = e.hook_formula ?? 'unknown';
    if (hook === 'unknown') continue;
    if (!hookStats[hook]) hookStats[hook] = { scores: [], count: 0, speakers: new Set() };
    hookStats[hook].count++;
    if (e.partial_viral_score != null) hookStats[hook].scores.push(e.partial_viral_score);
    if (e.speaker && e.speaker !== 'unknown') hookStats[hook].speakers.add(e.speaker);
  }

  const ranked = Object.entries(hookStats)
    .map(([hook, stats]) => {
      const avg = stats.scores.length > 0
        ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
        : 0;
      const max = stats.scores.length > 0 ? Math.max(...stats.scores) : 0;
      return { hook, avg, max, count: stats.count, speakers: stats.speakers.size };
    })
    .sort((a, b) => b.avg - a.avg);

  if (ranked.length === 0) return '⚠️ No hook formulas found in experiments.';

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  const lines = [
    '🎣 *Hook Formula A/B Test*',
    `${experiments.length} experiments · ${ranked.length} hooks tested`,
    '',
    '*Rankings (by avg viral score):*',
  ];

  const medals = ['🥇', '🥈', '🥉'];
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const medal = i < 3 ? medals[i] : `${i + 1}.`;
    const avgPct = Math.round(r.avg * 100);
    const maxPct = Math.round(r.max * 100);
    lines.push(`${medal} *${r.hook}* — avg ${avgPct}% · max ${maxPct}% · n=${r.count} · ${r.speakers} speakers`);
  }

  lines.push('');
  lines.push(`✅ Best: *${best.hook}* (${Math.round(best.avg * 100)}% avg)`);
  if (ranked.length > 1) {
    lines.push(`⚠️ Worst: *${worst.hook}* (${Math.round(worst.avg * 100)}% avg)`);
  }

  lines.push('');
  lines.push('💡 Prioritize top hooks in /postplan for gate acceleration');

  return lines.join('\n');
}

export function cmdHookStats(): string {
  try {
    const { formatRankings } = require('../scs001/hook-optimizer');
    return formatRankings();
  } catch (e: any) {
    return `❌ Hook optimizer error: ${e.message}`;
  }
}

export function cmdViralStats(): string {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (!fs.existsSync(expPath)) {
    return '⚠️ No experiments.jsonl found. Run pipeline first.';
  }

  const scored: Array<{ video_id: string; score: number; hook: string; speaker: string }> = [];
  let total = 0;

  try {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        total++;
        if (e.partial_viral_score != null) {
          scored.push({
            video_id: e.clip_id ?? e.video_id ?? '?',
            score: e.partial_viral_score,
            hook: e.hook_formula ?? 'unknown',
            speaker: e.speaker ?? 'unknown',
          });
        }
      } catch { /* skip */ }
    }
  } catch {
    return '⚠️ Could not read experiments.jsonl.';
  }

  if (scored.length === 0) {
    return '🧬 *Viral Stats*\n\nNo viral scores yet. Run the pipeline.';
  }

  const scores = scored.map(s => s.score);
  const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3);
  const max = Math.max(...scores).toFixed(3);
  const min = Math.min(...scores).toFixed(3);
  const above07 = scores.filter(s => s >= 0.7).length;

  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3);

  const lines: string[] = [
    '🧬 *Viral Score Summary*',
    '',
    `📊 Scored: *${scored.length}* / ${total} experiments`,
    `📈 Avg: *${avg}* | Max: *${max}* | Min: *${min}*`,
    `🔥 High (≥0.7): *${above07}*`,
    '',
    '*Top 3:*',
  ];

  top3.forEach((e, i) => {
    lines.push(`${i + 1}. \`${e.video_id.slice(0, 16)}\` — ${e.score} · ${e.speaker} · ${e.hook}`);
  });

  lines.push('', '💡 /postnow posts the highest-scoring video');
  return lines.join('\n');
}

export function cmdQueueOpt(): string {
  try {
    const { formatOptimizedQueue } = require('../scs001/queue-optimizer');
    return formatOptimizedQueue(10);
  } catch (e: any) {
    return `❌ Queue optimizer error: ${e.message}`;
  }
}

export function cmdGateAnalytics(): string {
  try {
    const { formatGateAnalytics } = require('../scs001/posting-analytics');
    return formatGateAnalytics();
  } catch (e: any) {
    return `❌ Analytics error: ${e.message}`;
  }
}

function stripeGet(reqPath: string, stripeKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com', path: reqPath, method: 'GET',
      headers: { 'Authorization': `Bearer ${stripeKey}` },
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Stripe parse error')); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Stripe timeout')); });
    req.end();
  });
}

export async function cmdRevenue(): Promise<string> {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey) {
    return '💰 *Revenue Dashboard*\n\n⚠️ Stripe not configured. Set `STRIPE_SECRET_KEY` in .env\n\n' + cmdRevenueFallback();
  }

  try {
    const mode = stripeKey.startsWith('sk_live_') ? '🟢 LIVE' : '🟡 TEST';

    // Fetch active + canceled subscriptions in parallel
    const [activeResult, canceledResult] = await Promise.all([
      stripeGet('/v1/subscriptions?status=active&limit=100', stripeKey),
      stripeGet('/v1/subscriptions?status=canceled&limit=100', stripeKey),
    ]);

    if (activeResult.error) return `💰 *Revenue Dashboard*\n\n❌ Stripe error: ${activeResult.error.message ?? 'unknown'}`;

    const activeSubs: any[] = activeResult.data ?? [];
    const canceledSubs: any[] = canceledResult.data ?? [];

    let mrrCents = 0;
    const planCounts: Record<string, number> = {};
    let newThisWeek = 0;
    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;

    for (const sub of activeSubs) {
      const item = sub.items?.data?.[0];
      const amount = item?.price?.unit_amount ?? 0;
      const interval = item?.price?.recurring?.interval ?? 'month';
      const monthlyAmount = interval === 'year' ? Math.round(amount / 12) : amount;
      mrrCents += monthlyAmount;

      const planName = item?.price?.nickname ?? item?.price?.product ?? 'unknown';
      const label = planName.length > 20 ? planName.slice(0, 20) : planName;
      planCounts[label] = (planCounts[label] ?? 0) + 1;

      if (sub.created >= oneWeekAgo) newThisWeek++;
    }

    // Churn: canceled in last 30 days vs total base
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
    const recentCancels = canceledSubs.filter((s: any) => (s.canceled_at ?? s.ended_at ?? 0) >= thirtyDaysAgo).length;
    const totalBase = activeSubs.length + recentCancels;
    const churnRate = totalBase > 0 ? ((recentCancels / totalBase) * 100).toFixed(1) : '0.0';

    const mrr = (mrrCents / 100).toFixed(2);
    const arr = ((mrrCents * 12) / 100).toFixed(0);
    const mrrNum = mrrCents / 100;

    const lines: string[] = [];
    lines.push(`💰 *Revenue Dashboard* ${mode}`);
    lines.push('');
    lines.push('*Subscribers:*');
    lines.push(`• Active: *${activeSubs.length}*`);
    const plans = Object.entries(planCounts).map(([n, c]) => `${n}: ${c}`).join(' · ');
    if (plans) lines.push(`• Plans: ${plans}`);
    lines.push(`• New this week: *${newThisWeek}*`);
    lines.push(`• Churn (30d): *${churnRate}%* (${recentCancels} canceled)`);
    lines.push('');
    lines.push('*Revenue:*');
    lines.push(`• MRR: *€${mrr}* · ARR: €${arr}`);
    lines.push('');

    const gates = [
      { name: 'Phase 1.5 — TikTok live', target: 0, label: 'posts+views' },
      { name: 'Phase 2A — Achiri alpha', target: 0, label: 'waitlist' },
      { name: 'Phase 2B — 10 subs', target: 190, label: '€190 MRR' },
      { name: 'Phase 3 — Autonomy', target: 500, label: '€500 MRR' },
      { name: 'Phase 4 — x402', target: 1000, label: '€1000 MRR' },
    ];

    lines.push('*Financial Gates:*');
    for (const g of gates) {
      const met = mrrNum >= g.target;
      const icon = met ? '✅' : '⏳';
      const pct = g.target > 0 ? Math.round((mrrNum / g.target) * 100) : 100;
      lines.push(`${icon} ${g.name} — ${g.label} (${Math.min(pct, 100)}%)`);
    }

    return lines.join('\n');
  } catch (err: any) {
    return `💰 *Revenue Dashboard*\n\n❌ Stripe fetch failed: ${(err.message ?? '').slice(0, 200)}\n\n` + cmdRevenueFallback();
  }
}

function cmdRevenueFallback(): string {
  const dbPath = path.join(ROOT, 'data', 'telegram-db.json');
  let totalUsers = 0; let paidUsers = 0; let mrr = 0;
  const PRICES: Record<string, number> = { growth: 19, premium: 49 };
  if (fs.existsSync(dbPath)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      for (const [_, entry] of Object.entries(db) as [string, any][]) {
        totalUsers++;
        const tier = (entry as any).tier ?? 'free';
        if (tier !== 'free' && (entry as any).active !== false) { paidUsers++; mrr += PRICES[tier] ?? 0; }
      }
    } catch { /* skip */ }
  }
  return `_Local DB fallback: ${totalUsers} users, ${paidUsers} paid, MRR ~$${mrr}_`;
}

// Sprint 459: /batch [N] — prepare N videos with captions for batch posting
export function cmdBatch(args: string): string {
  const count = Math.min(Math.max(parseInt(args) || 5, 1), 10);

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
        } catch {}
      }
    } catch {}
  }

  // Get unposted, unarchived, sorted by viral score
  const unposted = (ledger as any[])
    .filter((e: any) => e.video_id && !recordedIds.has(e.video_id) && !archivedIds.has(e.video_id))
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

  // Filter to only those with captioned mp4
  const ready = unposted.filter((e: any) => findCaptionedMp4(e.video_id) !== null);

  if (ready.length === 0) {
    return '📦 *Batch* — No ready-to-post videos found.\n\nRun the pipeline first.';
  }

  const batch = ready.slice(0, count);
  const speakerMap = loadSpeakerMap();
  const hookMap = loadHookMap();

  const lines: string[] = [
    `📦 *Batch Posting Kit — ${batch.length} Videos*`,
    '',
    `🎯 Gate: ${recorded.length}/30 posts · ${Math.max(0, 30 - recorded.length)} to go`,
    '',
  ];

  for (let i = 0; i < batch.length; i++) {
    const v = batch[i];
    const vid = v.video_id;
    const vs = viralScores.get(vid);
    const speaker = speakerMap.get(vid) ?? 'unknown';
    const hook = hookMap.get(vid) ?? '';
    const mp4 = findCaptionedMp4(vid);
    const caption = buildTikTokCaption(vid);

    lines.push(`*${i + 1}. \`${vid}\`*`);
    if (vs != null) lines.push(`   🧬 ${vs.toFixed(2)} · 🎙️ ${speaker}${hook ? ` · 🎣 ${hook}` : ''}`);
    lines.push(`   📋 Caption:`);
    lines.push('```');
    lines.push(caption.slice(0, 280));
    lines.push('```');
    lines.push(`   ✅ After posting: \`/record ${vid} 0\``);
    lines.push('');
  }

  lines.push(`_Use \`/deliver ${count}\` to get video files sent directly._`);
  lines.push(`_Queue: ${ready.length} total ready · ${unposted.length} unposted_`);

  return lines.join('\n');
}

// Sprint 459: /postlog — recent posting activity log
export function cmdPostLog(): string {
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));

  if (posts.length === 0) {
    return '📝 *Post Log* — No posts recorded yet.\n\nUse `/deliver` then `/record <id> <views>` after posting.';
  }

  // Group by date
  const byDate: Record<string, any[]> = {};
  for (const p of posts as any[]) {
    const date = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    if (!date) continue;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(p);
  }

  const dates = Object.keys(byDate).sort().reverse().slice(0, 7); // Last 7 days

  const lines: string[] = [
    `📝 *Post Log — Last 7 Days*`,
    `Total: *${posts.length}/30* posts · ${posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0)} views`,
    '',
  ];

  for (const date of dates) {
    const dayPosts = byDate[date];
    const dayName = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const dayViews = dayPosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);

    lines.push(`*${dayName}* — ${dayPosts.length} posts · ${dayViews} views`);
    for (const p of dayPosts.slice(0, 5)) {
      const vs = p.viral_score != null ? ` 🧬${p.viral_score.toFixed(2)}` : '';
      const views = p.views > 0 ? ` 👁${p.views}` : '';
      const spk = p.speaker ? ` 🎙️${p.speaker}` : '';
      lines.push(`  • \`${p.video_id}\`${vs}${views}${spk}`);
    }
    if (dayPosts.length > 5) {
      lines.push(`  _...and ${dayPosts.length - 5} more_`);
    }
    lines.push('');
  }

  // Pace indicator
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(1, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));
  const postsLeft = Math.max(0, 30 - posts.length);
  const paceNeeded = postsLeft > 0 ? (postsLeft / daysLeft).toFixed(1) : '0';
  lines.push(`⏱ Pace needed: *${paceNeeded}* posts/day to hit Apr 7 gate`);

  return lines.join('\n');
}

// Sprint 484: X/Twitter posting command
export function cmdXPost(args: string): string {
  const videoId = args.trim().split(/\s+/)[0];

  if (!videoId) {
    const configured = process.env.X_API_KEY && process.env.X_ACCESS_TOKEN;
    return [
      '🐦 *X/Twitter Post*\n',
      `Status: ${configured ? '✅ Configured' : '⚠️ Not configured (dry-run mode)'}`,
      '',
      'Usage: /xpost <video_id>',
      '',
      'Required env vars:',
      '  X_API_KEY, X_API_SECRET',
      '  X_ACCESS_TOKEN, X_ACCESS_SECRET',
      '  X_BEARER_TOKEN',
    ].join('\n');
  }

  try {
    const { buildXCaption, isXConfigured } = require('../../agents/scs001-publishing/x-client');
    const caption = buildTikTokCaption(videoId);
    const xCaption = buildXCaption(caption);
    const mp4 = findCaptionedMp4(videoId);
    const configured = isXConfigured();

    const lines = [
      '🐦 *X/Twitter Post Preview*\n',
      `📹 Video: \`${videoId}\``,
      `📁 File: ${mp4 ? '✅ Found' : '❌ Not found'}`,
      `🔑 API: ${configured ? '✅ Configured' : '⚠️ Dry-run mode'}`,
      '',
      '📝 Caption (280 char formatted):',
      `\`\`\`\n${xCaption}\n\`\`\``,
      '',
      `📊 Length: ${xCaption.length}/280 chars`,
      '',
      configured ? '_Ready to post. Full upload requires chunked media API._' : '_Set X_API_KEY + X_ACCESS_TOKEN to enable live posting._',
    ];

    return lines.join('\n');
  } catch (err: any) {
    return `❌ X post error: ${err.message}`;
  }
}

// Sprint 596: /costs — daily/weekly cost breakdown from pipeline metrics
export function cmdCosts(): string {
  // Try new cost-log.json first (Sprint 661), fallback to pipeline-metrics
  const costLogPath = path.join(ROOT, 'workspace', 'scs001', 'cost-log.json');
  if (fs.existsSync(costLogPath)) {
    try {
      const costLog = JSON.parse(fs.readFileSync(costLogPath, 'utf-8'));
      const m = costLog.monthly_summary || {};
      const a = costLog.all_time || {};
      const daily = (costLog.daily || []).slice(-7).reverse();

      const output = [
        '💰 *Pipeline Costs*',
        '',
        `*Month (${costLog.month}):*`,
        `  Videos generated: ${m.videos_generated || 0}`,
        `  Videos delivered: ${m.videos_delivered || 0}`,
        `  TTS (ElevenLabs): $${(m.tts_cost || 0).toFixed(2)}`,
        `  LLM local: ${m.llm_local_calls || 0} calls ($0.00)`,
        `  LLM cloud: $${(m.llm_cloud_cost || 0).toFixed(2)}`,
        `  *Monthly total: $${(m.total_cost || 0).toFixed(2)}*`,
        '',
        `*All-time:* ${a.total_videos || 0} videos, $${(a.total_cost || 0).toFixed(2)}`,
        `*Cost/video:* $${(a.cost_per_video || 0).toFixed(2)}`,
        '',
        '*Last 7 days:*',
        ...daily.map((d: any) => `  ${d.date}: ${d.videos_generated} vids, $${(d.total_cost || 0).toFixed(2)}`),
        // Sprint 1075: Ollama local inference cost (always $0.00)
        '',
        `🖥 *Ollama (local):* $0.00 · ${m.llm_local_calls || 0} inference calls this month`,
        `  _qwen3:0.6b · qwen3:4b · deepseek-r1:14b — free (Mac Mini M4)_`,
      ];
      return output.join('\n');
    } catch { /* fall through */ }
  }

  // Fallback to pipeline-metrics
  const metricsPath = path.join(ROOT, 'logs', 'pipeline-metrics', 'metrics.jsonl');
  if (!fs.existsSync(metricsPath)) {
    return '💰 *Costs* — no cost data found. Run: npx ts-node scripts/scs001/cost-tracker.ts';
  }

  const lines = fs.readFileSync(metricsPath, 'utf-8').trim().split('\n').filter(Boolean);
  const entries: Array<{ timestamp: string; total_cost_usd: number; videos_produced: number }> = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }

  if (entries.length === 0) {
    return '💰 *Costs* — no metrics entries found.';
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  let totalCost = 0, todayCost = 0, weekCost = 0;
  let totalVideos = 0, todayVideos = 0, weekVideos = 0;
  let totalRuns = 0, todayRuns = 0, weekRuns = 0;
  const dailyCosts: Record<string, number> = {};

  for (const e of entries) {
    const cost = e.total_cost_usd || 0;
    const vids = e.videos_produced || 0;
    const day = (e.timestamp || '').slice(0, 10);

    totalCost += cost;
    totalVideos += vids;
    totalRuns++;

    if (day === todayStr) { todayCost += cost; todayVideos += vids; todayRuns++; }
    if (day >= weekAgo) { weekCost += cost; weekVideos += vids; weekRuns++; }

    dailyCosts[day] = (dailyCosts[day] || 0) + cost;
  }

  const avgPerVideo = totalVideos > 0 ? totalCost / totalVideos : 0;
  const sortedDays = Object.keys(dailyCosts).sort().reverse().slice(0, 7);
  const dailyBreakdown = sortedDays.map(d => `  ${d}: $${dailyCosts[d].toFixed(2)}`);

  const output = [
    '💰 *Cost Breakdown*',
    '',
    `*Today:* $${todayCost.toFixed(2)} (${todayVideos} videos, ${todayRuns} runs)`,
    `*This week:* $${weekCost.toFixed(2)} (${weekVideos} videos, ${weekRuns} runs)`,
    `*All time:* $${totalCost.toFixed(2)} (${totalVideos} videos, ${totalRuns} runs)`,
    '',
    `*Avg cost/video:* $${avgPerVideo.toFixed(4)}`,
    '',
    '*Last 7 days:*',
    ...dailyBreakdown,
    // Sprint 1075: Ollama local inference cost
    '',
    `🖥 *Ollama (local):* $0.00 — free inference (Mac Mini M4)`,
    `  _qwen3:0.6b · qwen3:4b · deepseek-r1:14b_`,
  ];

  return output.join('\n');
}

// Sprint 635: /weeklydigest — 7-day trend summary
export function cmdWeeklyDigest(): string {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  // Sprints shipped (from git log)
  let sprintCount = 0;
  let sprintNames: string[] = [];
  try {
    const gitOut = execSync(
      `git log --oneline --since="${weekAgoStr}" --grep="^Sprint" 2>/dev/null`,
      { cwd: ROOT, encoding: 'utf-8', timeout: 5000 }
    );
    const lines = gitOut.trim().split('\n').filter(l => l.includes('Sprint') && !l.includes('state:'));
    sprintCount = lines.length;
    sprintNames = lines.slice(0, 5).map(l => l.replace(/^[a-f0-9]+ /, ''));
  } catch {}

  // Posts recorded this week
  let postsThisWeek = 0;
  let viewsThisWeek = 0;
  const postsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  if (fs.existsSync(postsPath)) {
    for (const line of fs.readFileSync(postsPath, 'utf-8').split('\n').filter(l => l.trim())) {
      try {
        const e = JSON.parse(line);
        const ts = (e.timestamp || e.created_at || '').slice(0, 10);
        if (ts >= weekAgoStr) { postsThisWeek++; viewsThisWeek += e.views ?? 0; }
      } catch {}
    }
  }

  // Achiri DAU trend (from daily-counts.json)
  const achiriCountsPath = path.join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
  const dauDays: { date: string; dau: number; msgs: number }[] = [];
  try {
    if (fs.existsSync(achiriCountsPath)) {
      const counts = JSON.parse(fs.readFileSync(achiriCountsPath, 'utf-8')) as Record<string, Record<string, number>>;
      for (const [date, users] of Object.entries(counts)) {
        if (date >= weekAgoStr) {
          dauDays.push({
            date,
            dau: Object.keys(users).length,
            msgs: Object.values(users).reduce((s, n) => s + n, 0),
          });
        }
      }
      dauDays.sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch {}

  // Videos produced this week (from publish-ledger)
  let videosProduced = 0;
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  if (fs.existsSync(ledgerPath)) {
    for (const line of fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim())) {
      try {
        const e = JSON.parse(line);
        const ts = (e.timestamp || e.created_at || '').slice(0, 10);
        if (ts >= weekAgoStr) videosProduced++;
      } catch {}
    }
  }

  // Build output
  const out: string[] = [
    `📊 *Weekly Digest* — ${weekAgoStr} to ${now.toISOString().slice(0, 10)}`,
    '',
    `🏃 *Sprints:* ${sprintCount} shipped`,
  ];
  for (const s of sprintNames) {
    out.push(`  • ${s.slice(0, 60)}`);
  }
  if (sprintCount > 5) out.push(`  _...and ${sprintCount - 5} more_`);

  out.push('');
  out.push(`🎬 *Content:* ${videosProduced} videos produced · ${postsThisWeek} posted · ${viewsThisWeek} views`);

  if (dauDays.length > 0) {
    const totalMsgs = dauDays.reduce((s, d) => s + d.msgs, 0);
    const avgDau = (dauDays.reduce((s, d) => s + d.dau, 0) / dauDays.length).toFixed(1);
    out.push('');
    out.push(`🤖 *Achiri:* avg ${avgDau} DAU · ${totalMsgs} msgs this week`);
    for (const d of dauDays.slice(-5)) {
      out.push(`  ${d.date}: ${d.dau} users, ${d.msgs} msgs`);
    }
  }

  // Gate progress
  const gateDate = new Date('2026-04-07');
  const daysToGate = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / 86_400_000));
  const totalPosts = (() => {
    if (!fs.existsSync(postsPath)) return 0;
    return fs.readFileSync(postsPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  })();
  out.push('');
  out.push(`🎯 *Gate:* ${totalPosts}/30 posts · ${daysToGate} days to Apr 7`);

  // Sprint 1213: Godman + Achiri alpha launch countdown
  const godmanDays = Math.max(0, Math.ceil((new Date('2026-04-14T00:00:00Z').getTime() - now.getTime()) / 86_400_000));
  const achiriAlphaDays = Math.max(0, Math.ceil((new Date('2026-04-25T00:00:00Z').getTime() - now.getTime()) / 86_400_000));
  if (godmanDays > 0 || achiriAlphaDays > 0) {
    out.push('');
    if (godmanDays > 0) {
      const gIcon = godmanDays <= 3 ? '🔴' : godmanDays <= 7 ? '🟠' : godmanDays <= 14 ? '🟡' : '🚀';
      out.push(`${gIcon} *Godman launch:* ${godmanDays}d — April 14 · /godman-launch`);
    }
    if (achiriAlphaDays > 0) {
      const aIcon = achiriAlphaDays <= 3 ? '🔴' : achiriAlphaDays <= 7 ? '🟠' : achiriAlphaDays <= 14 ? '🟡' : '🤖';
      out.push(`${aIcon} *Achiri alpha:* ${achiriAlphaDays}d — April 25 · /achiri-launch`);
    }
  }

  return out.join('\n');
}

/**
 * /post-next — Sprint 802: Show top 5 unposted videos ranked by viral score
 * Helps operator pick the best video to post next.
 */
export function cmdPostNext(): string {
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const deliveredPath = path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
  const manualPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

  // Load already-posted IDs
  const postedIds = new Set<string>();
  if (fs.existsSync(manualPath)) {
    fs.readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try { const e = JSON.parse(l); if (e.video_id) postedIds.add(e.video_id); } catch {}
    });
  }

  // Build candidate list with scores
  const candidates: Array<{ video_id: string; viral_score: number; mp4: string; source: string; topic?: string; format?: string }> = [];
  const seen = new Set<string>();

  // Auto-delivered entries (have viral_score + mp4_path)
  if (fs.existsSync(deliveredPath)) {
    fs.readFileSync(deliveredPath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try {
        const e = JSON.parse(l);
        if (!e.video_id || postedIds.has(e.video_id) || seen.has(e.video_id)) return;
        const mp4 = (e.mp4_path && fs.existsSync(e.mp4_path)) ? e.mp4_path : findCaptionedMp4(e.video_id);
        if (mp4) {
          seen.add(e.video_id);
          candidates.push({ video_id: e.video_id, viral_score: e.viral_score ?? 0, mp4, source: 'delivered', topic: e.topic, format: e.format });
        }
      } catch {}
    });
  }

  // Ledger entries
  if (fs.existsSync(ledgerPath)) {
    fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try {
        const e = JSON.parse(l);
        if (!e.video_id || postedIds.has(e.video_id) || seen.has(e.video_id)) return;
        const mp4 = findCaptionedMp4(e.video_id);
        if (mp4) {
          seen.add(e.video_id);
          candidates.push({ video_id: e.video_id, viral_score: 0, mp4, source: 'ledger', topic: e.topic, format: e.format });
        }
      } catch {}
    });
  }

  if (candidates.length === 0) {
    return '⚠️ No unposted videos with MP4 files found.';
  }

  // Sort by viral score descending, show top 5
  candidates.sort((a, b) => b.viral_score - a.viral_score);
  const top = candidates.slice(0, 5);

  const lines: string[] = [];
  lines.push(`🎯 *Top ${top.length} videos to post next*`);
  lines.push(`(${candidates.length} total unposted with files)`);
  lines.push('');

  for (let i = 0; i < top.length; i++) {
    const v = top[i];
    lines.push(`${i + 1}. \`${v.video_id}\``);
    if (v.topic) lines.push(`   📝 ${v.topic.slice(0, 60)}`);
    lines.push(`   Score: ${v.viral_score > 0 ? v.viral_score.toFixed(2) : 'n/a'} · ${v.source}${v.format ? ` · ${v.format}` : ''}`);
    lines.push(`   → /post-browser ${v.video_id}`);
  }

  lines.push('');
  const totalPosted = postedIds.size;
  const remaining = Math.max(0, 30 - totalPosted);
  lines.push(`📊 Gate: ${totalPosted}/30 posted · ${remaining} remaining`);

  return lines.join('\n');
}

// Sprint 835: /posting-health — posting infrastructure health check
export function cmdPostingHealth(): string {
  const reportPath = path.join(ROOT, 'reports', 'posting-health.json');

  // Auto-regenerate report
  try {
    execSync('npx ts-node --transpile-only scripts/scs001/posting-health.ts', {
      cwd: ROOT, timeout: 60000, stdio: 'pipe',
    });
  } catch { /* try to read existing */ }

  if (!fs.existsSync(reportPath)) {
    return '❌ No posting health report. Run `npx ts-node scripts/scs001/posting-health.ts`';
  }

  try {
    const r = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const lines: string[] = [
      `🏥 *Posting Health ${r.all_pass ? '✅' : '⚠️'}*`,
      '',
    ];

    for (const c of (r.checks || [])) {
      lines.push(`${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
    }

    const g = r.gate || {};
    lines.push('');
    lines.push(`📊 Gate: ${g.posted ?? 0}/${g.target ?? 30} · ${g.remaining ?? '?'} to go · ${g.days_left ?? '?'}d left`);
    lines.push(`📦 Inventory: ${r.inventory?.videos_with_files ?? '?'} videos with files`);
    lines.push(`_Generated: ${r.generated_at ? r.generated_at.split('T')[0] : '?'}_`);

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading health report: ${e.message}`;
  }
}

// Sprint 839: /bulk-captions — export all ready videos with TikTok captions
export function cmdBulkCaptions(): string {
  // Auto-regenerate report
  try {
    execSync('npx ts-node --transpile-only scripts/scs001/bulk-captions.ts', {
      cwd: ROOT, timeout: 60000, stdio: 'pipe',
    });
  } catch { /* try existing */ }

  const reportPath = path.join(ROOT, 'reports', 'bulk-captions.json');
  if (!fs.existsSync(reportPath)) {
    return '❌ No bulk captions report. Run `npx ts-node scripts/scs001/bulk-captions.ts`';
  }

  try {
    const r = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const lines: string[] = [
      `📋 *Bulk Captions Export*`,
      '',
      `📦 Ready: ${r.total_ready ?? 0} videos`,
      `✅ Posted: ${r.posted ?? 0}`,
      `🎯 Gate: ${r.gate?.posted ?? 0}/${r.gate?.target ?? 30} (${r.gate?.gap ?? '?'} to go)`,
      '',
    ];

    // Show top 5 with captions
    const vids = (r.videos || []).slice(0, 5);
    for (const v of vids) {
      const topicLine = v.topic ? ` — ${v.topic.slice(0, 50)}` : '';
      lines.push(`🎬 \`${v.video_id}\`${topicLine}`);
      // Show first line of caption only
      const firstLine = (v.caption || '').split('\n').find((l: string) => l.trim()) || '';
      lines.push(`  💬 ${firstLine}`);
      lines.push(`  → /post-browser ${v.video_id}`);
      lines.push('');
    }

    if ((r.videos || []).length > 5) {
      lines.push(`_... and ${r.videos.length - 5} more in reports/bulk-captions.json_`);
    }

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error: ${e.message}`;
  }
}
