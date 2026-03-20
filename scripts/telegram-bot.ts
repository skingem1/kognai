#!/usr/bin/env ts-node

/**
 * Invoica Telegram Bot Daemon
 *
 * Long-polling bot that responds to owner commands with real system data.
 * No AI involved — pure ground-truth status from pm2 jlist, health.json, tier.json, sprints/.
 *
 * Commands:
 *   /report  — full system status (PM2 + infra + beta + sprint)
 *   /pm2     — live PM2 process table
 *   /health  — health.json summary
 *   /tier    — current tier + MRR
 *   /sprint  — latest sprint status
 *   /help    — list commands
 *
 * Run via PM2 (autorestart: true, not cron-based).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

// Sprint 455: Import extracted command modules
import { cmdPm2, cmdHealth, cmdTier, cmdSprint, cmdReport, cmdCrons, cmdTikTokAuth, cmdQuickStart, cmdEnvCheck } from './telegram-commands/cmd-system';
import { cmdGate, cmdGoLive, cmdAudit, cmdStreak, cmdPace, cmdCalendar } from './telegram-commands/cmd-gate';
import { cmdRecord, cmdQueue, cmdReview, cmdCaption, cmdPosted, cmdOnboard, cmdPipeline, cmdToday, cmdAnalytics } from './telegram-commands/cmd-content';
import { cmdMetrics, cmdPostPlan, cmdYouTube, cmdAutoPost, cmdLastRun, cmdViral, cmdDashboard, cmdDigest, cmdSchedule, cmdLeaderboard, cmdBestTime, cmdHookTest, cmdHookStats, cmdViralStats, cmdQueueOpt, cmdGateAnalytics, cmdRevenue, cmdBatch, cmdPostLog } from './telegram-commands/cmd-posting';
import { cmdHistory, cmdArchive, cmdUnarchive, cmdStale, cmdPurge, cmdNote, cmdUpdateViews, cmdExport, cmdWeeklyReport, cmdSpeakerTest, cmdFilmKit, cmdContentPlan, cmdSuggest, cmdCompare, cmdScorecard, cmdProgress, cmdCleanup, cmdDedup, cmdTop30, cmdAbResults, cmdStatus } from './telegram-commands/cmd-management';
import { cmdHelp } from './telegram-commands/cmd-help';
import { readLines, findCaptionedMp4, getExperimentData, buildTikTokCaption, loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook, freshnessScore, loadArchived, getPm2List } from './telegram-commands/shared';


const ROOT = path.resolve(__dirname, '..');
const OFFSET_FILE = path.join(ROOT, 'logs', 'telegram-bot-offset.txt');
const AUDIT_LOG = path.join(ROOT, 'audit.log');

// ─── Sprint 401: Posting session state ────────────────────────────────
interface PostingSession {
  active: boolean;
  chatId: string;
  startedAt: string;
  videosPosted: string[];  // video IDs posted this session
  currentVideoId: string | null;  // video currently being posted
}
let postingSession: PostingSession = { active: false, chatId: '', startedAt: '', videosPosted: [], currentVideoId: null };

// ─── Env ──────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.CEO_TELEGRAM_BOT_TOKEN || '';
const OWNER_CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || '';

if (!BOT_TOKEN) { console.error('[Bot] CEO_TELEGRAM_BOT_TOKEN not set'); process.exit(1); }
if (!OWNER_CHAT_ID) { console.error('[Bot] OWNER_TELEGRAM_CHAT_ID not set'); process.exit(1); }

// ─── Telegram API ─────────────────────────────────────────────────────

function telegramRequest(method: string, body: Record<string, unknown>): Promise<any> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, error: data.slice(0, 200) }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(35000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
    req.write(payload);
    req.end();
  });
}

async function getUpdates(offset: number): Promise<any[]> {
  const res = await telegramRequest('getUpdates', { timeout: 30, offset, allowed_updates: ['message', 'callback_query'] });
  return res.ok ? (res.result || []) : [];
}

async function sendMessage(chatId: string, text: string): Promise<void> {
  await telegramRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

// Sprint 389: Inline keyboard buttons for one-tap actions
async function sendMessageWithButtons(chatId: string, text: string, buttons: Array<Array<{ text: string; callback_data: string }>>): Promise<void> {
  await telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await telegramRequest('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text ?? '' });
}

// Sprint 280: Send video file via Telegram sendVideo API
function sendVideoFile(chatId: string, videoPath: string, caption?: string): Promise<void> {
  const boundary = '----TgBotBoundary' + Date.now().toString(16);
  const filename = path.basename(videoPath);
  const fileData = fs.readFileSync(videoPath);

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  if (caption) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      timeout: 180_000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { ok: boolean; description?: string };
          if (!parsed.ok) reject(new Error(`sendVideo: ${parsed.description ?? data.slice(0, 200)}`));
          else resolve();
        } catch { reject(new Error(`sendVideo parse: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('sendVideo timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── Sprint 435: Send video file with inline keyboard buttons ─────────

function sendVideoWithButtons(chatId: string, videoPath: string, caption: string, buttons: Array<Array<{ text: string; callback_data: string }>>): Promise<void> {
  const boundary = '----TgBotBoundary' + Date.now().toString(16);
  const filename = path.basename(videoPath);
  const fileData = fs.readFileSync(videoPath);
  const replyMarkup = JSON.stringify({ inline_keyboard: buttons });

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reply_markup"\r\n\r\n${replyMarkup}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      timeout: 180_000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { ok: boolean; description?: string };
          if (!parsed.ok) reject(new Error(`sendVideo: ${parsed.description ?? data.slice(0, 200)}`));
          else resolve();
        } catch { reject(new Error(`sendVideo parse: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('sendVideo timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── Offset persistence ───────────────────────────────────────────────

function loadOffset(): number {
  try { return parseInt(fs.readFileSync(OFFSET_FILE, 'utf-8').trim(), 10) || 0; }
  catch { return 0; }
}

function saveOffset(offset: number): void {
  try { fs.writeFileSync(OFFSET_FILE, String(offset)); } catch {}
}

// ─── Real data gatherers ──────────────────────────────────────────────








// ─── Sprint 436: /boot — start all essential PM2 crons ────────────────

async function cmdBoot(chatId: string): Promise<void> {
  const ESSENTIAL_CRONS = [
    'kognai-daily-digest',
    'kognai-gate-regen',
    'kognai-gate-tracker-update',
    'kognai-brief-regen',
    'kognai-post-noon',
    'kognai-post-evening',
    'kognai-pipeline-watchdog',
    'kognai-smoke-test',
    'kognai-calendar-regen',
    'kognai-schedule-regen',
    'kognai-leaderboard-regen',
    'kognai-auto-deliver-morning',
    'kognai-auto-deliver-noon',
    'kognai-auto-deliver-evening',
    'kognai-view-tracker',
    'kognai-watchdog',
    'kognai-caption-push',
    'scs001-pipeline',
  ];

  await sendMessage(chatId, `🔄 *Booting ${ESSENTIAL_CRONS.length} essential crons...*`);

  const started: string[] = [];
  const failed: string[] = [];
  const alreadyOnline: string[] = [];

  // Check current status first
  const procs = getPm2List();
  const onlineNames = new Set(procs.filter(p => p.status === 'online').map(p => p.name));

  for (const name of ESSENTIAL_CRONS) {
    if (onlineNames.has(name)) {
      alreadyOnline.push(name);
      continue;
    }
    try {
      execSync(`pm2 start ecosystem.config.js --only ${name}`, { cwd: ROOT, timeout: 15000, stdio: 'pipe' });
      started.push(name);
    } catch {
      failed.push(name);
    }
  }

  const lines = [
    '🚀 *Boot Complete*',
    '',
  ];

  if (started.length > 0) {
    lines.push(`✅ *Started (${started.length}):*`);
    for (const n of started) lines.push(`  🟢 ${n}`);
    lines.push('');
  }
  if (alreadyOnline.length > 0) {
    lines.push(`⏩ *Already running (${alreadyOnline.length}):*`);
    for (const n of alreadyOnline) lines.push(`  🟢 ${n}`);
    lines.push('');
  }
  if (failed.length > 0) {
    lines.push(`❌ *Failed (${failed.length}):*`);
    for (const n of failed) lines.push(`  🔴 ${n}`);
    lines.push('');
  }

  // Summary
  const totalOnline = started.length + alreadyOnline.length;
  lines.push(`📊 ${totalOnline}/${ESSENTIAL_CRONS.length} crons active`);
  if (failed.length > 0) {
    lines.push(`\n_Check logs: \`pm2 logs <name> --lines 20\`_`);
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ─── Sprint 438: /shutdown — stop all non-essential PM2 crons ─────────

async function cmdShutdown(chatId: string): Promise<void> {
  const STOPPABLE_CRONS = [
    'kognai-daily-digest',
    'kognai-gate-regen',
    'kognai-gate-tracker-update',
    'kognai-brief-regen',
    'kognai-post-noon',
    'kognai-post-evening',
    'kognai-pipeline-watchdog',
    'kognai-smoke-test',
    'kognai-calendar-regen',
    'kognai-schedule-regen',
    'kognai-leaderboard-regen',
    'kognai-auto-deliver-morning',
    'kognai-auto-deliver-noon',
    'kognai-auto-deliver-evening',
    'kognai-view-tracker',
    'kognai-watchdog',
    'kognai-caption-push',
    'kognai-auto-healer',
    'scs001-pipeline',
  ];

  await sendMessage(chatId, `🛑 *Stopping ${STOPPABLE_CRONS.length} crons...*\n\n_telegram-bot and stripe-webhook will keep running._`);

  let stopped = 0;
  let alreadyStopped = 0;

  const procs = getPm2List();
  const onlineNames = new Set(procs.filter(p => p.status === 'online').map(p => p.name));

  for (const name of STOPPABLE_CRONS) {
    if (!onlineNames.has(name)) {
      alreadyStopped++;
      continue;
    }
    try {
      execSync(`pm2 stop ${name}`, { timeout: 10000, stdio: 'pipe' });
      stopped++;
    } catch { /* ignore */ }
  }

  await sendMessage(chatId, [
    '🛑 *Shutdown Complete*',
    '',
    `⏹ Stopped: *${stopped}* crons`,
    `⏩ Already stopped: *${alreadyStopped}*`,
    '',
    `🟢 Still running: telegram-bot, stripe-webhook`,
    '',
    `_Type \`/boot\` to restart everything._`,
  ].join('\n'));
}
















// Sprint 424: Import shared engagement caption module (replaces Sprint 418 inline constants)




// Sprint 280: /deliver [N] — batch-send top videos with captions
async function cmdDeliver(chatId: string, args: string): Promise<string> {
  const count = Math.min(Math.max(parseInt(args) || 3, 1), 10);

  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));

  // Load viral scores for ranking
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

  // Sprint 413: Build ledger timestamp map for freshness scoring
  const ledgerDates = new Map<string, string>();
  for (const e of ledger as any[]) {
    if (e.video_id && e.published_at) ledgerDates.set(e.video_id, e.published_at);
  }

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) =>
      freshnessScore(b.video_id, viralScores.get(b.video_id) ?? 0, ledgerDates) -
      freshnessScore(a.video_id, viralScores.get(a.video_id) ?? 0, ledgerDates)
    );

  // Filter to only those with captioned mp4 ready
  const ready = unposted.filter((e: any) => findCaptionedMp4(e.video_id) !== null);

  if (ready.length === 0) {
    return `📦 *Deliver* — No ready-to-post videos found.\n\nRun the pipeline first, then try again.`;
  }

  // Sprint 411: Apply speaker diversity guard
  const speakerMap = loadSpeakerMap();
  const speakerDiversified = diversifyBySpeaker(ready, speakerMap);
  // Sprint 415: Apply hook formula diversity guard
  const hookMap = loadHookMap();
  const diversified = diversifyByHook(speakerDiversified, hookMap);
  const batch = diversified.slice(0, count);
  let sent = 0;

  await sendMessage(chatId, `📦 *Delivering ${batch.length} videos for posting...*`);

  for (const entry of batch) {
    const videoId = entry.video_id;
    const mp4Path = findCaptionedMp4(videoId);
    if (!mp4Path) continue;

    const caption = buildTikTokCaption(videoId);
    const vs = viralScores.get(videoId);
    const vsStr = vs != null ? `🧬 ${vs}` : '';
    const speaker = speakerMap.get(videoId);
    const spkStr = speaker ? `🎙️ ${speaker}` : '';
    // Sprint 413: Show age indicator
    const pubAt = ledgerDates.get(videoId);
    const ageDays = pubAt ? Math.round((Date.now() - new Date(pubAt).getTime()) / 86_400_000) : 0;
    const ageStr = ageDays > 0 ? ` · ${ageDays}d old` : '';
    // Sprint 415: Show hook formula
    const hook = hookMap.get(videoId);
    const hookStr = hook ? ` · 🎣 ${hook}` : '';
    const tgCaption = `📦 *Post this to TikTok* ${vsStr} ${spkStr}${hookStr}${ageStr}\n\n${caption}\n\n\`/record ${videoId} 0\``;

    // Sprint 435+438+440: Inline buttons for one-tap posting + caption copy + publish
    const deliverButtons = [
      [
        { text: '✅ Posted', callback_data: `posted:${videoId}` },
        { text: '📡 Publish', callback_data: `cmd:/publish ${videoId}` },
      ],
      [
        { text: '📋 Caption', callback_data: `cmd:/caption ${videoId}` },
        { text: '⏭️ Next', callback_data: 'cmd:/deliver 1' },
      ],
    ];
    try {
      await sendVideoWithButtons(chatId, mp4Path, tgCaption, deliverButtons);
      sent++;
    } catch (err: any) {
      await sendMessage(chatId, `⚠️ Failed to send \`${videoId}\`: ${err.message}`);
    }
  }

  const gate = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl')).length;
  const remaining = Math.max(0, 30 - gate);

  return (
    `✅ *Delivered ${sent}/${batch.length} videos*\n\n` +
    `📊 Gate progress: ${gate}/30 posts (${remaining} more needed)\n` +
    `_After posting each video, run:_\n` +
    `\`/record <video_id> <views>\``
  );
}










// Sprint 440: /publish — one-tap multi-platform publishing via Blotato
// Uploads video to Supabase storage for a public URL, then publishes via Blotato
// to TikTok + IG Reels + YouTube Shorts. Dry-run if BLOTATO_API_KEY not set.
async function cmdPublish(chatId: string, args: string): Promise<void> {
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
  const BLOTATO_KEY = process.env.BLOTATO_API_KEY || '';
  const isDryRun = !BLOTATO_KEY;
  const PLATFORMS = ['tiktok', 'instagram', 'youtube'] as const;

  // Resolve video ID: from args or auto-pick best unposted
  let videoId = args.trim();
  if (!videoId) {
    const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
    const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
    const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
    const viralScores = new Map<string, number>();
    const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
    if (fs.existsSync(expPath)) {
      try {
        for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
          if (!line.trim()) continue;
          try { const e = JSON.parse(line); const id = e.clip_id ?? e.video_id; if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score); } catch {}
        }
      } catch {}
    }
    const unposted = (ledger as any[])
      .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && findCaptionedMp4(e.video_id))
      .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? 0) - (viralScores.get(a.video_id) ?? 0));
    if (unposted.length === 0) {
      await sendMessage(chatId, `📡 *Publish* — No ready-to-post videos found.\n\nRun /refresh first.`);
      return;
    }
    videoId = unposted[0].video_id;
  }

  const mp4Path = findCaptionedMp4(videoId);
  if (!mp4Path) {
    await sendMessage(chatId, `❌ Video \`${videoId}\` not found or not captioned.`);
    return;
  }

  const caption = buildTikTokCaption(videoId);
  const exp = getExperimentData(videoId);
  const modeStr = isDryRun ? '🧪 DRY RUN' : '🔴 LIVE';
  await sendMessage(chatId, `📡 *Publishing ${modeStr}*\n\n🎬 \`${videoId}\`\n🎙️ ${exp.speaker}\n🎯 ${PLATFORMS.join(', ')}\n\n⏳ Uploading to Supabase...`);

  // Step 1: Upload to Supabase storage for a public URL
  let publicUrl = '';
  if (!isDryRun && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const fileBuffer = fs.readFileSync(mp4Path);
      const storagePath = `publish/${videoId}.mp4`;
      const bucket = 'scs001-videos';
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`;

      const uploadRes = await new Promise<{ ok: boolean; status: number; body: string }>((resolve, reject) => {
        const url = new URL(uploadUrl);
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'video/mp4',
            'Content-Length': fileBuffer.length,
            'x-upsert': 'true',
          },
          timeout: 60000,
        }, (res) => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c.toString()));
          res.on('end', () => resolve({ ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode!, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Upload timeout')); });
        req.write(fileBuffer);
        req.end();
      });

      if (!uploadRes.ok) throw new Error(`Supabase upload ${uploadRes.status}: ${uploadRes.body.slice(0, 200)}`);
      publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
    } catch (err: any) {
      await sendMessage(chatId, `⚠️ Supabase upload failed: ${err.message}\n\nFalling back to dry-run.`);
      publicUrl = '';
    }
  }

  // Step 2: Publish via Blotato
  if (isDryRun || !publicUrl) {
    // Dry run — show what would be published
    const lines = [
      `📡 *Publish — DRY RUN*`,
      ``,
      `🎬 Video: \`${videoId}\``,
      `🎙️ Speaker: ${exp.speaker}`,
      `🧬 Score: ${exp.viral_score ?? '—'}`,
      `🎣 Hook: ${exp.hook_formula}`,
      ``,
      `*Would publish to:*`,
      ...PLATFORMS.map(p => `  ✅ ${p}`),
      ``,
      `*Caption:*`,
      caption.slice(0, 200) + (caption.length > 200 ? '...' : ''),
      ``,
      `⚙️ Set \`BLOTATO_API_KEY\` in .env to publish live.`,
    ];
    await sendMessageWithButtons(chatId, lines.join('\n'), [
      [{ text: '✅ Record as Posted', callback_data: `posted:${videoId}` }],
      [{ text: '📋 Caption', callback_data: `cmd:/caption ${videoId}` }],
    ]);
    return;
  }

  // Live publish via Blotato
  try {
    const blotatoBody = JSON.stringify({
      content: caption,
      media_url: publicUrl,
      media_type: 'video',
      platforms: [...PLATFORMS],
      hashtags: [],
    });

    const blotatoRes = await new Promise<{ ok: boolean; status: number; body: string }>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.blotato.com',
        path: '/v1/posts',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BLOTATO_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(blotatoBody),
        },
        timeout: 30000,
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => resolve({ ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode!, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Blotato timeout')); });
      req.write(blotatoBody);
      req.end();
    });

    if (!blotatoRes.ok) throw new Error(`Blotato ${blotatoRes.status}: ${blotatoRes.body.slice(0, 200)}`);

    let platformResults = '';
    try {
      const parsed = JSON.parse(blotatoRes.body);
      if (parsed.platforms) {
        platformResults = (parsed.platforms as any[]).map((p: any) =>
          `  ${p.success ? '✅' : '❌'} ${p.platform}${p.post_url ? ` — ${p.post_url}` : ''}`
        ).join('\n');
      }
    } catch { platformResults = '  ✅ Published (details unavailable)'; }

    // Record post
    const postEntry = {
      video_id: videoId,
      posted_at: new Date().toISOString(),
      views: 0,
      method: 'blotato',
      platforms: [...PLATFORMS],
      public_url: publicUrl,
    };
    const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
    fs.appendFileSync(manualPostsPath, JSON.stringify(postEntry) + '\n');

    await sendMessageWithButtons(chatId, [
      `📡 *Published!*`,
      ``,
      `🎬 \`${videoId}\``,
      `🎙️ ${exp.speaker} · 🧬 ${exp.viral_score ?? '—'}`,
      ``,
      `*Platforms:*`,
      platformResults,
      ``,
      `✅ Recorded in posting log.`,
    ].join('\n'), [
      [{ text: '📡 Publish Next', callback_data: 'cmd:/publish' }],
      [{ text: '🔥 Streak', callback_data: 'cmd:/streak' }, { text: '📊 Gate', callback_data: 'cmd:/gate' }],
    ]);

  } catch (err: any) {
    await sendMessage(chatId, `❌ *Publish failed:* ${err.message}\n\nVideo uploaded to Supabase OK. Try again or post manually.`);
  }
}






// ─── Sprint 364: /postnow — send best ready video for immediate posting ───

async function cmdPostNow(chatId: string): Promise<void> {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));

  // Load viral scores for ranking
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

  // Find unposted videos with captioned mp4 on disk, sorted by viral score
  const ready: Array<{ video_id: string; filePath: string; score: number }> = [];
  for (const e of ledger as any[]) {
    if (!e.video_id || recordedIds.has(e.video_id)) continue;
    const mp4 = findCaptionedMp4(e.video_id);
    if (mp4) {
      ready.push({ video_id: e.video_id, filePath: mp4, score: viralScores.get(e.video_id) ?? -1 });
    }
  }
  ready.sort((a, b) => b.score - a.score);

  if (ready.length === 0) {
    await sendMessage(chatId, '⚠️ *No ready videos found.* Run /refresh to generate new content.');
    return;
  }

  // Take top video
  const best = ready[0];
  const caption = buildTikTokCaption(best.video_id);
  const exp = getExperimentData(best.video_id);

  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const postCount = recorded.length;
  const postsNeeded = Math.max(0, 30 - postCount);

  const header = [
    `🎬 *Post Now* — ${postCount}/30 posts · ${daysLeft}d to gate`,
    '',
    `🎙️ ${exp.speaker} · 🧬 ${exp.viral_score ?? 'n/a'}`,
    `🎣 ${exp.hook_formula}`,
    '',
    '📋 *Caption (copy & paste):*',
    '```',
    caption,
    '```',
    '',
    `After posting: \`/record ${best.video_id} 0\``,
    `Queue: ${ready.length} more ready`,
  ].join('\n');

  await sendMessage(chatId, header);

  try {
    await sendVideoFile(chatId, best.filePath, `${exp.speaker} · /record ${best.video_id} 0`);
  } catch (err) {
    await sendMessage(chatId, `⚠️ Could not send video: ${(err as Error).message?.slice(0, 100)}`);
  }
}







// ─── Sprint 373: /checkout — Stripe checkout session generator ──────────────

async function cmdCheckout(chatId: string, args: string): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey) {
    await sendMessage(chatId, '⚠️ *Stripe not configured.* Set `STRIPE_SECRET_KEY` in .env');
    return;
  }

  const tier = args.trim().toLowerCase() || 'growth';
  const priceMap: Record<string, { priceId: string; name: string; amount: string }> = {
    growth: {
      priceId: process.env.STRIPE_PRICE_GROWTH || '',
      name: 'Growth',
      amount: '€19/mo',
    },
    premium: {
      priceId: process.env.STRIPE_PRICE_PREMIUM || '',
      name: 'Premium',
      amount: '€49/mo',
    },
  };

  const plan = priceMap[tier];
  if (!plan) {
    await sendMessage(chatId, `❌ Unknown tier: \`${tier}\`\n\nUsage: \`/checkout growth\` or \`/checkout premium\``);
    return;
  }
  if (!plan.priceId) {
    await sendMessage(chatId, `⚠️ Price ID not configured for ${plan.name}. Set \`STRIPE_PRICE_${tier.toUpperCase()}\` in .env`);
    return;
  }

  const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://kognai.com/success';
  const cancelUrl = process.env.STRIPE_CANCEL_URL || 'https://kognai.com/cancel';

  const body = new URLSearchParams({
    'mode': 'subscription',
    'line_items[0][price]': plan.priceId,
    'line_items[0][quantity]': '1',
    'success_url': successUrl,
    'cancel_url': cancelUrl,
  }).toString();

  try {
    const result = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.stripe.com',
        path: '/v1/checkout/sessions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Stripe parse error: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Stripe API timeout')); });
      req.write(body);
      req.end();
    });

    if (result.error) {
      await sendMessage(chatId, `❌ Stripe error: ${result.error.message ?? JSON.stringify(result.error).slice(0, 200)}`);
      return;
    }

    const url = result.url;
    if (!url) {
      await sendMessage(chatId, `⚠️ No checkout URL returned. Response: ${JSON.stringify(result).slice(0, 300)}`);
      return;
    }

    const mode = stripeKey.startsWith('sk_live_') ? '🟢 LIVE' : '🟡 TEST';

    await sendMessage(chatId, [
      `💳 *${plan.name} Checkout* (${plan.amount}) ${mode}`,
      '',
      `🔗 ${url}`,
      '',
      `Session: \`${result.id?.slice(0, 30) ?? 'n/a'}\``,
      `Expires: ${result.expires_at ? new Date(result.expires_at * 1000).toISOString().slice(0, 16) : '24h'}`,
      '',
      '_Share this link with the subscriber. It expires in ~24h._',
    ].join('\n'));

  } catch (err: any) {
    await sendMessage(chatId, `❌ Checkout failed: ${err.message?.slice(0, 200)}`);
  }
}

// ─── Sprint 374: /subscribers — Stripe subscriber list + MRR ────────────────

async function cmdSubscribers(chatId: string): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey) {
    await sendMessage(chatId, '⚠️ *Stripe not configured.* Set `STRIPE_SECRET_KEY` in .env');
    return;
  }

  try {
    const query = new URLSearchParams({
      status: 'active',
      limit: '100',
      'expand[]': 'data.customer',
    }).toString();

    const result = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.stripe.com',
        path: `/v1/subscriptions?${query}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
        },
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Stripe parse error: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Stripe API timeout')); });
      req.end();
    });

    if (result.error) {
      await sendMessage(chatId, `❌ Stripe error: ${result.error.message ?? JSON.stringify(result.error).slice(0, 200)}`);
      return;
    }

    const subs = result.data ?? [];
    const mode = stripeKey.startsWith('sk_live_') ? '🟢 LIVE' : '🟡 TEST';

    if (subs.length === 0) {
      await sendMessage(chatId, `👥 *Subscribers* ${mode}\n\nNo active subscriptions yet.\n\nUse \`/checkout growth\` or \`/checkout premium\` to generate payment links.`);
      return;
    }

    // Calculate MRR and plan breakdown
    let mrrCents = 0;
    const planCounts: Record<string, number> = {};
    const subLines: string[] = [];

    for (const sub of subs) {
      const item = sub.items?.data?.[0];
      const amount = item?.price?.unit_amount ?? 0;
      const interval = item?.price?.recurring?.interval ?? 'month';
      const monthlyAmount = interval === 'year' ? Math.round(amount / 12) : amount;
      mrrCents += monthlyAmount;

      const planName = item?.price?.nickname ?? item?.price?.id?.slice(0, 20) ?? 'unknown';
      planCounts[planName] = (planCounts[planName] ?? 0) + 1;

      const customer = typeof sub.customer === 'object' ? sub.customer : null;
      const email = customer?.email ?? 'no email';
      const created = new Date(sub.created * 1000).toISOString().slice(0, 10);

      subLines.push(`• ${email} — ${planName} (€${(amount / 100).toFixed(0)}) since ${created}`);
    }

    const mrr = (mrrCents / 100).toFixed(2);
    const arr = ((mrrCents * 12) / 100).toFixed(0);

    const plans = Object.entries(planCounts)
      .map(([name, count]) => `${name}: ${count}`)
      .join(' · ');

    const lines = [
      `👥 *Subscribers* ${mode}`,
      '',
      `📊 Active: *${subs.length}* | MRR: *€${mrr}* | ARR: €${arr}`,
      `📋 ${plans}`,
      '',
      ...subLines.slice(0, 20),
    ];

    if (subs.length > 20) {
      lines.push(`\n_...and ${subs.length - 20} more_`);
    }

    // Sprint 408: Append recent webhook events from subscribers.jsonl
    const webhookEvents = loadRecentWebhookEvents(5);
    if (webhookEvents.length > 0) {
      lines.push('');
      lines.push('*Recent Stripe Events:*');
      for (const ev of webhookEvents) {
        const icon = ev.type === 'checkout.session.completed' ? '💰'
          : ev.type === 'invoice.paid' ? '💳'
          : ev.type === 'customer.subscription.deleted' ? '⚠️'
          : '📋';
        const email = ev.email ?? 'unknown';
        const plan = ev.plan ? ` (${ev.plan})` : '';
        const amount = ev.amount ? ` $${ev.amount}` : '';
        const time = ev.logged_at ? ev.logged_at.split('T')[0] : '?';
        const typeLabel = ev.type?.split('.').pop()?.replace(/_/g, ' ') ?? ev.type ?? 'event';
        lines.push(`${icon} ${time} — ${typeLabel}: ${email}${plan}${amount}`);
      }
    }

    await sendMessage(chatId, lines.join('\n'));

  } catch (err: any) {
    await sendMessage(chatId, `❌ Subscribers fetch failed: ${err.message?.slice(0, 200)}`);
  }
}

// Sprint 408: Load recent webhook events from subscribers.jsonl
function loadRecentWebhookEvents(limit: number): Array<Record<string, any>> {
  const logPath = path.join(ROOT, 'workspace', 'scs001', 'subscribers.jsonl');
  if (!fs.existsSync(logPath)) return [];
  try {
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
    const events: Array<Record<string, any>> = [];
    for (const line of lines) {
      try { events.push(JSON.parse(line)); } catch { /* skip */ }
    }
    return events.slice(-limit);
  } catch { return []; }
}

// ─── Sprint 409: /portal — generate Stripe billing portal link ─────────────

function cmdPortal(args: string): string {
  const checkoutPort = process.env.CHECKOUT_PORT || '3002';
  const email = args.trim();

  if (!process.env.STRIPE_SECRET_KEY) {
    return '⚠️ Stripe not configured. Set `STRIPE_SECRET_KEY` in .env';
  }

  if (!email) {
    return (
      `🔗 *Billing Portal*\n\n` +
      `Generate a self-service link for a subscriber:\n\n` +
      `Usage: \`/portal user@example.com\`\n\n` +
      `The subscriber can manage their subscription, update payment, or cancel.\n\n` +
      `_Or direct link: \`http://localhost:${checkoutPort}/portal?email=<email>\`_`
    );
  }

  // Validate email format
  if (!email.includes('@') || !email.includes('.')) {
    return `❌ Invalid email: \`${email}\`\n\nUsage: \`/portal user@example.com\``;
  }

  const portalUrl = `http://localhost:${checkoutPort}/portal?email=${encodeURIComponent(email)}`;
  return (
    `🔗 *Billing Portal Link*\n\n` +
    `Subscriber: ${email}\n` +
    `Link: ${portalUrl}\n\n` +
    `_Send this link to the subscriber. They can manage their subscription, update payment method, or cancel._`
  );
}

// ─── Sprint 375: /funnel — content pipeline funnel visualization ────────────

function cmdFunnel(): string {
  // Stage 1: Total experiments
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  const totalExp = experiments.length;

  // Stage 2: QC passed
  const qcPassed = experiments.filter((e: any) => e.qc_passed === true);
  const qcCount = qcPassed.length;

  // Stage 3: In publish ledger (made it through pipeline)
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const ledgerCount = ledger.length;

  // Stage 4: Captioned MP4 on disk (ready to post)
  let captionedCount = 0;
  try {
    const scsDir = path.join(ROOT, 'workspace', 'scs001');
    const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
    const seen = new Set<string>();
    for (const dir of runDirs) {
      const capDir = path.join(scsDir, dir, 'caption');
      if (!fs.existsSync(capDir)) continue;
      for (const f of fs.readdirSync(capDir)) {
        if (f.endsWith('-captioned.mp4')) seen.add(f);
      }
    }
    captionedCount = seen.size;
  } catch { /* skip */ }

  // Stage 5: Posted (manual-posts.jsonl)
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const postedCount = posts.length;

  // Stage 6: Views > 500 (gate target)
  const over500 = posts.filter((p: any) => (p.views ?? 0) >= 500).length;

  // Conversion rates
  const pct = (a: number, b: number) => b > 0 ? `${Math.round((a / b) * 100)}%` : '—';

  // Bar chart (text-based)
  const maxWidth = 20;
  const maxVal = Math.max(totalExp, 1);
  const bar = (val: number) => {
    const len = Math.max(1, Math.round((val / maxVal) * maxWidth));
    return '█'.repeat(len) + '░'.repeat(maxWidth - len);
  };

  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));

  const lines = [
    '🔬 *Content Pipeline Funnel*',
    '',
    `${bar(totalExp)} Experiments: *${totalExp}*`,
    `${bar(qcCount)} QC Passed: *${qcCount}* (${pct(qcCount, totalExp)})`,
    `${bar(ledgerCount)} In Ledger: *${ledgerCount}* (${pct(ledgerCount, qcCount)})`,
    `${bar(captionedCount)} Captioned: *${captionedCount}* (${pct(captionedCount, ledgerCount)})`,
    `${bar(postedCount)} Posted: *${postedCount}* (${pct(postedCount, captionedCount)})`,
    `${bar(over500)} Views ≥500: *${over500}* (${pct(over500, postedCount)})`,
    '',
    `🎯 Gate: ${postedCount}/30 posts · ${over500}/30 with 500+ views · ${daysLeft}d left`,
    '',
    `📊 Overall: ${pct(postedCount, totalExp)} experiment→posted`,
    captionedCount > postedCount
      ? `💡 ${captionedCount - postedCount} videos ready — use /postnow`
      : '',
  ].filter(Boolean);

  return lines.join('\n');
}






// ─── Sprint 371: /todaycaptions — batch captions for today's posts ────────

async function cmdTodayCaptions(chatId: string): Promise<void> {
  const schedulePath = path.join(ROOT, 'reports', 'posting-schedule.json');
  if (!fs.existsSync(schedulePath)) {
    await sendMessage(chatId, '⚠️ No posting schedule found. Run /refresh first.');
    return;
  }

  let sched: any;
  try {
    sched = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
  } catch {
    await sendMessage(chatId, '⚠️ Could not parse posting-schedule.json.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaySlots = (sched.slots ?? []).filter((s: any) => s.date === today);

  if (todaySlots.length === 0) {
    await sendMessage(chatId, `📅 No posts scheduled for today (${today}).\n\nUse /postplan for the full schedule.`);
    return;
  }

  await sendMessage(chatId, [
    `📋 *Today's Captions* (${today})`,
    `${todaySlots.length} post(s) scheduled`,
    '',
    `🎯 ${sched.posts_needed ?? 30} posts needed in ${sched.days_to_gate ?? '?'}d`,
  ].join('\n'));

  for (const slot of todaySlots) {
    const caption = buildTikTokCaption(slot.video_id);
    const score = Math.round((slot.viral_score ?? 0) * 100);

    await sendMessage(chatId, [
      `⏰ *${slot.slot_label ?? slot.time}*`,
      `🎬 \`${slot.video_id}\``,
      slot.speaker ? `🎙️ ${slot.speaker}` : '',
      `📊 Viral: ${score}% | Hook: ${slot.hook ?? '?'}`,
    ].filter(Boolean).join('\n'));

    // Caption as code block for easy copy
    await sendMessage(chatId, '```\n' + caption + '\n```');
    await sendMessage(chatId, `_After posting: \`/record ${slot.video_id} 0\`_`);
  }
}


// ─── Sprint 369: /broadcast — send announcements to alpha users ───────────

async function cmdBroadcast(chatId: string, message: string): Promise<void> {
  if (!message.trim()) {
    await sendMessage(chatId, [
      '📢 *Broadcast to Alpha Users*',
      '',
      'Usage: `/broadcast Your message here`',
      '',
      '_Message will be sent to all alpha-whitelisted + waitlisted users._',
    ].join('\n'));
    return;
  }

  // Load recipients from alpha whitelist + waitlist
  const recipientIds = new Set<string>();
  const files = [
    path.join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl'),
    path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl'),
  ];

  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const id = entry.chatId ?? entry.chat_id;
        if (id) recipientIds.add(String(id));
      } catch { /* skip */ }
    }
  }

  // Remove sender
  recipientIds.delete(chatId);

  if (recipientIds.size === 0) {
    await sendMessage(chatId, '⚠️ No alpha users to broadcast to. Use /invite first.');
    return;
  }

  await sendMessage(chatId, `📢 *Broadcasting to ${recipientIds.size} user(s)...*\n\n"${message.slice(0, 200)}${message.length > 200 ? '...' : ''}"`);

  let sent = 0;
  let failed = 0;
  const broadcastText = `📢 *Achiri Update*\n\n${message}`;

  for (const userId of Array.from(recipientIds)) {
    try {
      await sendMessage(userId, broadcastText);
      sent++;
      await new Promise(r => setTimeout(r, 200)); // rate limit
    } catch {
      failed++;
    }
  }

  // Log broadcast
  const logPath = path.join(ROOT, 'workspace', 'achiri', 'broadcast-log.jsonl');
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    message: message.slice(0, 500),
    recipients: recipientIds.size,
    sent,
    failed,
  }) + '\n');

  await sendMessage(chatId, `✅ Broadcast complete: *${sent}* sent, *${failed}* failed`);
}






function cmdAchiri(): string {
  const readinessPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
  const waitlistPath = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');

  // Waitlist count
  let waitlistCount = 0;
  if (fs.existsSync(waitlistPath)) {
    waitlistCount = fs.readFileSync(waitlistPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  }

  if (!fs.existsSync(readinessPath)) {
    return (
      `🤖 *Achiri Alpha Status*\n\n` +
      `❌ No readiness report found.\n` +
      `Run: \`npx ts-node scripts/achiri/achiri-readiness.ts\`\n\n` +
      `📋 Waitlist: ${waitlistCount} users`
    );
  }

  try {
    const data = JSON.parse(fs.readFileSync(readinessPath, 'utf-8'));
    const checks: Array<{ name: string; pass: boolean; detail: string; critical: boolean }> = data.checks ?? [];

    const passCount = checks.filter(c => c.pass).length;
    const failCount = checks.filter(c => !c.pass).length;
    const critFails = checks.filter(c => !c.pass && c.critical);

    const statusIcon = data.overall_ready ? '✅' : '⚠️';
    const lines: string[] = [
      `🤖 *Achiri Alpha Status* ${statusIcon}`,
      '',
      `📅 Alpha launch: ${data.alpha_date ?? '?'} (${data.days_to_alpha ?? '?'}d)`,
      `📊 Readiness: *${data.score ?? '?'}%* (${passCount}/${checks.length} checks pass)`,
      `📋 Waitlist: *${waitlistCount}* users`,
      '',
    ];

    // Show critical failures first
    if (critFails.length > 0) {
      lines.push('*🔴 Critical Failures:*');
      for (const c of critFails) {
        lines.push(`  ❌ ${c.name}: ${c.detail}`);
      }
      lines.push('');
    }

    // Show all checks summary
    lines.push('*Checks:*');
    for (const c of checks) {
      const icon = c.pass ? '✅' : '❌';
      const crit = c.critical ? ' ⚡' : '';
      lines.push(`  ${icon} ${c.name}${crit}`);
    }
    lines.push('');

    // Telegram bot status
    const tgToken = process.env.ACHIRI_TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET';
    lines.push(`*Telegram Bot:* ${tgToken === 'SET' ? '✅' : '⚠️'} Token: ${tgToken}`);

    lines.push('');
    lines.push(`_Report: ${data.generated_at ? data.generated_at.split('T')[0] : 'unknown'}_`);

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading Achiri readiness: ${e.message}`;
  }
}


// Sprint 392: /archive + /unarchive — queue management







// Sprint 393: /note — operator quick notes on videos
const NOTES_PATH = path.join(ROOT, 'workspace', 'scs001', 'video-notes.json');

function loadNotes(): Record<string, { note: string; at: string }> {
  if (!fs.existsSync(NOTES_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(NOTES_PATH, 'utf-8')); } catch { return {}; }
}

function saveNotes(notes: Record<string, { note: string; at: string }>): void {
  fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2), 'utf-8');
}





// ─── Sprint 401: /session — interactive batch posting flow ────────────

function getNextUnpostedVideo(): { video_id: string; mp4Path: string; caption: string; viralScore: number | null; speaker: string } | null {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  // Also skip videos already posted this session
  for (const id of postingSession.videosPosted) recordedIds.add(id);

  const viralScores = new Map<string, number>();
  const speakers = new Map<string, string>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
        if (id && e.speaker) speakers.set(id, e.speaker);
      } catch { /* skip */ }
    }
  }

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

  for (const entry of unposted) {
    const mp4Path = findCaptionedMp4(entry.video_id);
    if (mp4Path) {
      return {
        video_id: entry.video_id,
        mp4Path,
        caption: buildTikTokCaption(entry.video_id),
        viralScore: viralScores.get(entry.video_id) ?? null,
        speaker: speakers.get(entry.video_id) ?? 'unknown',
      };
    }
  }
  return null;
}

async function cmdSession(chatId: string): Promise<void> {
  if (postingSession.active) {
    await sendMessage(chatId, `⚠️ Session already active (${postingSession.videosPosted.length} posted). Type \`/done\` after posting or \`/endsession\` to finish.`);
    return;
  }

  const manualPosts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const postsNeeded = Math.max(0, 30 - manualPosts.length);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(1, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));
  const dailyTarget = Math.min(5, Math.ceil(postsNeeded / daysLeft));

  if (postsNeeded === 0) {
    await sendMessage(chatId, '✅ Gate target met! No posting session needed.');
    return;
  }

  postingSession = {
    active: true,
    chatId,
    startedAt: new Date().toISOString(),
    videosPosted: [],
    currentVideoId: null,
  };

  await sendMessage(chatId, [
    '🎬 *Posting Session Started!*',
    '',
    `📊 Gate: ${manualPosts.length}/30 posts · ${postsNeeded} to go · ${daysLeft}d left`,
    `🎯 Today's target: *${dailyTarget} videos*`,
    '',
    'Workflow: I send a video → you post on TikTok → type `/done`',
    'Type `/endsession` when finished.',
    '',
    'Sending first video...',
  ].join('\n'));

  await sendNextSessionVideo(chatId);
}

async function sendNextSessionVideo(chatId: string): Promise<void> {
  const next = getNextUnpostedVideo();
  if (!next) {
    await sendMessage(chatId, '📦 No more ready videos! Run `/refresh` to generate more.');
    await cmdEndSession(chatId);
    return;
  }

  postingSession.currentVideoId = next.video_id;
  const vsStr = next.viralScore != null ? ` 🧬${next.viralScore}` : '';
  const spkStr = next.speaker !== 'unknown' ? ` 🎙️${next.speaker}` : '';
  const num = postingSession.videosPosted.length + 1;

  const tgCaption = [
    `📦 *#${num}*${vsStr}${spkStr}`,
    '',
    next.caption,
    '',
    '_Save → post on TikTok → tap ✅ Done below_',
  ].join('\n');

  // Sprint 435: Inline buttons on session videos
  const sessionButtons = [
    [
      { text: '✅ Done — Posted', callback_data: 'cmd:/done' },
      { text: '⏭ Skip', callback_data: 'cmd:/done' },
    ],
    [
      { text: '🛑 End Session', callback_data: 'cmd:/endsession' },
    ],
  ];
  try {
    await sendVideoWithButtons(chatId, next.mp4Path, tgCaption, sessionButtons);
  } catch (err: any) {
    await sendMessage(chatId, `⚠️ Failed to send video \`${next.video_id}\`: ${err.message?.slice(0, 100)}\nSkipping — type \`/done\` to get next.`);
  }
}

async function cmdDone(chatId: string): Promise<void> {
  if (!postingSession.active) {
    await sendMessage(chatId, '⚠️ No active session. Type `/session` to start one.');
    return;
  }

  if (!postingSession.currentVideoId) {
    await sendMessage(chatId, '⚠️ No video pending. Sending next...');
    await sendNextSessionVideo(chatId);
    return;
  }

  // Record the post (Sprint 404: enriched with experiment metadata)
  const videoId = postingSession.currentVideoId;
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
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
    source: 'session',
  };
  const dir = path.dirname(manualPostsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(manualPostsPath, JSON.stringify(entry) + '\n', 'utf-8');

  postingSession.videosPosted.push(videoId);
  postingSession.currentVideoId = null;

  // Gate stats
  const allPosts = readLines(manualPostsPath);
  const postCount = allPosts.length;
  const postsLeft = Math.max(0, 30 - postCount);

  await sendMessage(chatId, [
    `✅ *Posted!* \`${videoId}\``,
    `📊 Session: ${postingSession.videosPosted.length} done · Gate: ${postCount}/30${postsLeft > 0 ? ` · ${postsLeft} to go` : ' 🎉'}`,
    '',
    postsLeft > 0 ? 'Sending next video...' : '🎉 Gate target met!',
  ].join('\n'));

  if (postsLeft > 0) {
    await sendNextSessionVideo(chatId);
  } else {
    await cmdEndSession(chatId);
  }
}

async function cmdEndSession(chatId: string): Promise<void> {
  if (!postingSession.active) {
    await sendMessage(chatId, '⚠️ No active session.');
    return;
  }

  const count = postingSession.videosPosted.length;
  const startTime = new Date(postingSession.startedAt);
  const elapsed = Math.ceil((Date.now() - startTime.getTime()) / 60_000);

  const allPosts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const totalPosts = allPosts.length;
  const postsLeft = Math.max(0, 30 - totalPosts);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(1, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

  postingSession = { active: false, chatId: '', startedAt: '', videosPosted: [], currentVideoId: null };

  await sendMessage(chatId, [
    '🏁 *Session Complete!*',
    '',
    `📦 Videos posted: *${count}*`,
    `⏱️ Duration: ${elapsed} min`,
    '',
    `📊 Gate: ${totalPosts}/30 posts`,
    postsLeft > 0 ? `⏳ ${postsLeft} more needed · ${daysLeft}d to Apr 7` : '🎉 Post target met!',
    count > 0 ? `\n_Great work! Run_ \`/updateviews\` _tomorrow to check performance._` : '',
  ].join('\n'));
}

// Sprint 433: /menu — Interactive button menu for quick access
async function cmdMenu(chatId: string): Promise<void> {
  const text = `📱 *Quick Menu*\n\nTap any button below:`;
  const buttons = [
    [
      { text: '📦 Deliver', callback_data: 'cmd:/deliver 1' },
      { text: '📊 Gate', callback_data: 'cmd:/gate' },
      { text: '🔥 Streak', callback_data: 'cmd:/streak' },
    ],
    [
      { text: '📋 Queue', callback_data: 'cmd:/queue' },
      { text: '📅 Today', callback_data: 'cmd:/today' },
      { text: '🏃 Pace', callback_data: 'cmd:/pace' },
    ],
    [
      { text: '📈 Analytics', callback_data: 'cmd:/analytics' },
      { text: '🔄 Last Run', callback_data: 'cmd:/lastrun' },
      { text: '🤖 Auto-post', callback_data: 'cmd:/autopost' },
    ],
    [
      { text: '🚀 Go Live', callback_data: 'cmd:/golive' },
      { text: '💰 Revenue', callback_data: 'cmd:/revenue' },
      { text: '📊 Status', callback_data: 'cmd:/status' },
    ],
    [
      { text: '📝 Digest', callback_data: 'cmd:/digest' },
      { text: '🔄 Refresh', callback_data: 'cmd:/refresh' },
      { text: '❓ Help', callback_data: 'cmd:/help' },
    ],
    [
      { text: '🚀 Boot Crons', callback_data: 'cmd:/boot' },
      { text: '🛑 Shutdown', callback_data: 'cmd:/shutdown' },
    ],
  ];
  await sendMessageWithButtons(chatId, text, buttons);
}








// ─── Sprint 382: /filmkit — instant filming brief ────────────────────

const HOOK_OPENERS: Record<string, string> = {
  curiosity_gap: '"You won\'t believe what happens when..."',
  contrarian: '"Everyone thinks X, but actually..."',
  authority: '"After 10 years in the industry, here\'s what I know..."',
  secret: '"Nobody talks about this, but..."',
  question: '"Have you ever wondered why...?"',
};






// ─── Sprint 394: /pickup — one-tap posting workflow ─────────────────────

async function cmdPickup(chatId: string): Promise<void> {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const archivedIds = loadArchived();

  // Load viral scores for ranking
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

  // Sprint 413: Build ledger timestamp map for freshness scoring
  const ledgerDates = new Map<string, string>();
  for (const e of ledger as any[]) {
    if (e.video_id && e.published_at) ledgerDates.set(e.video_id, e.published_at);
  }

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && !archivedIds.has(e.video_id))
    .sort((a: any, b: any) =>
      freshnessScore(b.video_id, viralScores.get(b.video_id) ?? 0, ledgerDates) -
      freshnessScore(a.video_id, viralScores.get(a.video_id) ?? 0, ledgerDates)
    );

  const readyRaw = unposted.filter((e: any) => findCaptionedMp4(e.video_id) !== null);

  if (readyRaw.length === 0) {
    await sendMessage(chatId, '📦 *Pickup* — No ready-to-post videos.\n\nRun `/refresh` to generate new content.');
    return;
  }

  // Sprint 411: Apply speaker diversity guard
  const speakerMap = loadSpeakerMap();
  const speakerDiversified = diversifyBySpeaker(readyRaw, speakerMap);
  // Sprint 415: Apply hook formula diversity guard
  const hookMap = loadHookMap();
  const ready = diversifyByHook(speakerDiversified, hookMap);

  const pick = ready[0];
  const videoId = pick.video_id;
  const mp4Path = findCaptionedMp4(videoId);
  if (!mp4Path) {
    await sendMessage(chatId, '⚠️ Video file not found on disk.');
    return;
  }

  const caption = buildTikTokCaption(videoId);
  const vs = viralScores.get(videoId);
  const speaker = speakerMap.get(videoId);
  const spkStr = speaker ? ` · 🎙️ ${speaker}` : '';
  const vsStr = vs != null ? ` · 🧬 ${vs}` : '';
  // Sprint 413: Show content age
  const pubAt = ledgerDates.get(videoId);
  const ageDays = pubAt ? Math.round((Date.now() - new Date(pubAt).getTime()) / 86_400_000) : 0;
  const ageStr = ageDays > 0 ? ` · ${ageDays}d` : '';
  // Sprint 415: Show hook formula
  const hook = hookMap.get(videoId);
  const hookStr = hook ? ` · 🎣 ${hook}` : '';
  const gate = recorded.length;
  const remaining = Math.max(0, 30 - gate);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

  const tgCaption = [
    `🎬 *Next Post* (#${gate + 1}/30)${vsStr}${spkStr}${hookStr}${ageStr}`,
    '',
    caption,
    '',
    `📊 ${remaining - 1} more needed · ${daysLeft}d to gate`,
    `📦 ${ready.length - 1} more in queue`,
  ].join('\n');

  // Sprint 435: Send video with inline buttons directly attached
  const pickupButtons = [
    [
      { text: '✅ Posted', callback_data: `posted:${videoId}` },
      { text: '⏭ Next Video', callback_data: 'cmd:/pickup' },
    ],
    [
      { text: '🗑 Archive', callback_data: `cmd:/archive ${videoId}` },
      { text: '📊 Progress', callback_data: 'cmd:/progress' },
    ],
  ];
  try {
    await sendVideoWithButtons(chatId, mp4Path, tgCaption, pickupButtons);
  } catch (err: any) {
    await sendMessage(chatId, `⚠️ Failed to send video: ${err.message}`);
    return;
  }
}

// ─── Command router ───────────────────────────────────────────────────

async function handleCommand(chatId: string, text: string): Promise<void> {
  const cmd = text.split('@')[0].toLowerCase().trim(); // strip @botname suffix
  console.log(`[Bot] Command from ${chatId}: ${cmd}`);

  // Security: only respond to owner
  if (chatId !== OWNER_CHAT_ID) {
    await sendMessage(chatId, '🔒 Unauthorized.');
    return;
  }

  // Sprint 265: extract command name and arguments
  const spaceIdx = text.indexOf(' ');
  const cmdName = spaceIdx === -1 ? cmd : text.slice(0, spaceIdx).split('@')[0].toLowerCase().trim();
  const cmdArgs = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();

  // Sprint 340: /refresh — trigger pipeline run from Telegram
  if (cmdName === '/refresh') {
    await sendMessage(chatId, `🔄 *Pipeline refresh starting...*\n\nThis takes 2-5 minutes. I'll notify you when it's done.`);
    const { spawn } = require('child_process');
    const pipelineScript = path.join(ROOT, 'agents', 'scs001-orchestrator', 'run-pipeline.ts');
    const child = spawn('npx', ['ts-node', '--transpile-only', pipelineScript, 'mock'], {
      cwd: ROOT,
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', async (code: number) => {
      try {
        if (code === 0) {
          // Read latest report for stats
          const latestPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
          let stats = '';
          if (fs.existsSync(latestPath)) {
            try {
              const report = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
              const stages = report.stages ?? {};
              const discovered = stages.discovery?.count ?? '?';
              const captioned = stages.captioning?.count ?? stages.caption?.count ?? '?';
              stats = `\n\n📊 Discovered: ${discovered} · Captioned: ${captioned}`;
              if (report.total_elapsed_ms) stats += ` · ${Math.round(report.total_elapsed_ms / 1000)}s`;
            } catch { /* skip */ }
          }
          await sendMessage(chatId, `✅ *Pipeline refresh complete!*${stats}\n\nRegenerating calendar...`);
          // Sprint 399: Auto-regenerate content calendar + posting schedule after pipeline
          try {
            const { execSync } = require('child_process');
            execSync('npx ts-node --transpile-only scripts/scs001/generate-content-calendar.ts', { cwd: ROOT, timeout: 30000, env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' } });
            execSync('npx ts-node --transpile-only scripts/scs001/generate-posting-schedule.ts', { cwd: ROOT, timeout: 30000, env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' } });
            await sendMessage(chatId, `📅 *Calendar + schedule regenerated!*\n\nUse /pickup to post next video.`);
          } catch (regenErr: any) {
            await sendMessage(chatId, `⚠️ Calendar regen failed (non-fatal): ${(regenErr as Error).message?.slice(0, 100)}\n\nVideos still available via /deliver.`);
          }
        } else {
          const errSnippet = (stderr || stdout).slice(-300);
          await sendMessage(chatId, `❌ *Pipeline failed* (exit ${code})\n\n\`\`\`\n${errSnippet}\n\`\`\``);
        }
      } catch { /* notification failed, nothing we can do */ }
    });
    child.on('error', async (err: Error) => {
      try { await sendMessage(chatId, `❌ *Pipeline spawn failed:* ${err.message}`); } catch {}
    });
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 449: /produce — run full pipeline with local TTS + enhanced captions ($0.00)
  if (cmdName === '/produce') {
    await sendMessage(chatId, `🎬 *Producing video...*\n\nUsing local TTS + FFmpeg captions ($0.00).\nThis takes 2-3 minutes.`);
    const { spawn } = require('child_process');
    const pipelineScript = path.join(ROOT, 'scripts', 'scs001', 'run-full-pipeline.ts');
    const child = spawn('npx', ['ts-node', '--transpile-only', pipelineScript, '--mock', '--local', '--limit', '1'], {
      cwd: ROOT,
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { /* ignore stderr */ });
    child.on('close', async (code: number) => {
      try {
        if (code === 0) {
          // Read latest pipeline report
          const runsDir = path.join(ROOT, 'workspace', 'scs001', 'pipeline-runs');
          const reports = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((f: string) => f.startsWith('pipeline-') && f.endsWith('.json')).sort() : [];
          let reportSummary = '';
          if (reports.length > 0) {
            try {
              const report = JSON.parse(fs.readFileSync(path.join(runsDir, reports[reports.length - 1]), 'utf-8'));
              reportSummary = `\n\n📊 ${report.summary}`;
            } catch { /* skip */ }
          }
          await sendMessage(chatId, `✅ *Video produced!*${reportSummary}\n\nUse /postnow to get the video.`);
        } else {
          const lastLines = stdout.split('\n').filter((l: string) => l.trim()).slice(-5).join('\n');
          await sendMessage(chatId, `❌ *Pipeline failed* (exit ${code})\n\n\`\`\`\n${lastLines.slice(0, 500)}\n\`\`\``);
        }
      } catch (err: any) {
        try { await sendMessage(chatId, `❌ *Pipeline error:* ${err.message}`); } catch {}
      }
    });
    child.on('error', async (err: Error) => {
      try { await sendMessage(chatId, `❌ *Pipeline spawn failed:* ${err.message}`); } catch {}
    });
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 364: /postnow is async (sends video file), handle separately
  if (cmdName === '/postnow') {
    try {
      await cmdPostNow(chatId);
    } catch (e: any) {
      await sendMessage(chatId, `❌ PostNow error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 371: /todaycaptions is async (sends multiple messages), handle separately
  if (cmdName === '/todaycaptions') {
    try {
      await cmdTodayCaptions(chatId);
    } catch (e: any) {
      await sendMessage(chatId, `❌ TodayCaptions error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 369: /broadcast is async (sends to multiple users), handle separately
  if (cmdName === '/broadcast') {
    try {
      await cmdBroadcast(chatId, cmdArgs);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Broadcast error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 433: /menu is async (sends inline keyboard buttons)
  if (cmdName === '/menu') {
    try {
      await cmdMenu(chatId);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Menu error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 436: /boot — start all essential PM2 crons from Telegram
  if (cmdName === '/boot') {
    try {
      await cmdBoot(chatId);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Boot error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 439: /reload — restart telegram-bot to pick up code changes
  if (cmdName === '/reload') {
    await sendMessage(chatId, '🔄 *Reloading bot...*\n\nRestarting in 2 seconds. Bot will be back shortly.');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    setTimeout(() => {
      try {
        execSync('pm2 restart telegram-bot', { timeout: 10000, stdio: 'pipe' });
      } catch {
        // If pm2 restart fails, exit and let PM2 auto-restart
        process.exit(0);
      }
    }, 2000);
    return;
  }

  // Sprint 438: /shutdown — stop all non-essential PM2 crons
  if (cmdName === '/shutdown') {
    try {
      await cmdShutdown(chatId);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Shutdown error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 394: /pickup is async (sends video + buttons)
  if (cmdName === '/pickup') {
    try {
      await cmdPickup(chatId);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Pickup error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 401: /session, /done, /endsession — interactive posting flow (async)
  if (cmdName === '/session' || cmdName === '/done' || cmdName === '/endsession') {
    try {
      if (cmdName === '/session') await cmdSession(chatId);
      else if (cmdName === '/done') await cmdDone(chatId);
      else await cmdEndSession(chatId);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Session error: ${e.message?.slice(0, 200)}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 440: /publish is async (uploads + publishes), handle separately
  if (cmdName === '/publish') {
    try {
      await cmdPublish(chatId, cmdArgs);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Publish error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // Sprint 280: /deliver is async (sends videos), handle separately
  if (cmdName === '/deliver') {
    try {
      const response = await cmdDeliver(chatId, cmdArgs);
      await sendMessage(chatId, response);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Deliver error: ${e.message}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  let response: string;
  switch (cmdName) {
    case '/report':  response = cmdReport(); break;
    case '/pm2':     response = cmdPm2();    break;
    case '/health':  response = cmdHealth(); break;
    case '/tier':    response = cmdTier();   break;
    case '/sprint':  response = cmdSprint(); break;
    case '/gate':    response = cmdGate();   break;
    case '/record':  response = cmdRecord(cmdArgs); break;
    case '/posted':  response = cmdPosted(); break;
    case '/tiktokauth': response = cmdTikTokAuth(); break;
    case '/crons':      response = cmdCrons(); break;
    case '/queue':   response = cmdQueue();  break;
    case '/review':  response = cmdReview(); break;
    case '/caption': response = cmdCaption(cmdArgs); break;
    case '/streak':    response = cmdStreak(); break;
    case '/analytics': response = cmdAnalytics(); break;
    case '/onboard':   response = cmdOnboard(); break;
    case '/pipeline':  response = cmdPipeline(); break;
    case '/today':     response = cmdToday();  break;
    case '/calendar':  response = cmdCalendar(); break;
    case '/golive':    response = cmdGoLive();  break;
    case '/audit':      response = cmdAudit();      break;
    case '/quickstart':  response = cmdQuickStart();  break;
    case '/schedule':    response = cmdSchedule();    break;
    case '/leaderboard': response = cmdLeaderboard(); break;
    case '/updateviews': response = cmdUpdateViews(cmdArgs); break;
    case '/achiri':      response = cmdAchiri();             break;
    case '/digest':      response = cmdDigest();             break;
    case '/metrics':     response = cmdMetrics();            break;
    case '/pace':        response = cmdPace();               break;
    case '/revenue':     response = cmdRevenue();            break;
    case '/autopost':    response = cmdAutoPost();           break;
    case '/lastrun':     response = cmdLastRun();            break;
    case '/viral':       response = cmdViral();              break;
    case '/postplan':    response = cmdPostPlan();           break;
    case '/dashboard':   response = cmdDashboard();          break;
    case '/viralstats':  response = cmdViralStats();         break;
    case '/hookstats':   response = cmdHookStats();          break;
    case '/queueopt':    response = cmdQueueOpt();           break;
    case '/gateanalytics': response = cmdGateAnalytics();   break;
    case '/youtube':     response = cmdYouTube();            break;
    case '/checkout':    await cmdCheckout(chatId, cmdArgs); return;
    case '/subscribers': await cmdSubscribers(chatId); return;
    case '/portal':      response = cmdPortal(cmdArgs);        break;
    case '/funnel':      response = cmdFunnel();              break;
    case '/hooktest':    response = cmdHookTest();            break;
    case '/besttime':    response = cmdBestTime();            break;
    case '/export':      response = cmdExport(cmdArgs);       break;
    case '/weeklyreport': response = cmdWeeklyReport();       break;
    case '/speakertest': response = cmdSpeakerTest();        break;
    case '/contentplan': response = cmdContentPlan();        break;
    case '/filmkit':     response = cmdFilmKit();            break;
    case '/progress':    response = cmdProgress();           break;
    case '/scorecard':   response = cmdScorecard();          break;
    case '/compare':     response = cmdCompare(cmdArgs);     break;
    case '/suggest':     response = cmdSuggest();            break;
    case '/history':     response = cmdHistory();            break;
    case '/archive':     response = cmdArchive(cmdArgs);     break;
    case '/unarchive':   response = cmdUnarchive(cmdArgs);   break;
    case '/stale':       response = cmdStale(cmdArgs);       break;
    case '/purge':       response = cmdPurge(cmdArgs);       break;
    case '/note':        response = cmdNote(cmdArgs);        break;
    case '/status':      response = cmdStatus();             break;
    case '/dedup':       response = cmdDedup();              break;
    case '/top30':       response = cmdTop30();              break;
    case '/abresults':   response = cmdAbResults();          break;
    case '/cleanup':     response = cmdCleanup();            break;
    case '/envcheck':    response = cmdEnvCheck();           break;
    case '/batch':       response = cmdBatch(cmdArgs);       break;
    case '/postlog':     response = cmdPostLog();            break;
    case '/help':        response = cmdHelp();        break;
    default:
      response = `Unknown command: \`${cmdName}\`\n\n${cmdHelp()}`;
  }

  // Sprint 389: Add inline keyboard buttons to key commands
  const buttonMap: Record<string, Array<Array<{ text: string; callback_data: string }>>> = {
    '/digest': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '📊 Gate', callback_data: 'cmd:/gate' }],
      [{ text: '🔄 Refresh', callback_data: 'cmd:/refresh' }, { text: '📈 History', callback_data: 'cmd:/history' }],
    ],
    '/gate': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '🔥 Streak', callback_data: 'cmd:/streak' }],
      [{ text: '📋 Queue', callback_data: 'cmd:/queue' }, { text: '📅 Today', callback_data: 'cmd:/today' }],
    ],
    '/today': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '💡 Suggest', callback_data: 'cmd:/suggest' }],
      [{ text: '🎬 Film Kit', callback_data: 'cmd:/filmkit' }, { text: '📋 Digest', callback_data: 'cmd:/digest' }],
    ],
    '/queue': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '📦 Deliver 3', callback_data: 'cmd:/deliver 3' }],
    ],
    '/status': [
      [{ text: '🎬 Pickup', callback_data: 'cmd:/pickup' }, { text: '📋 Queue', callback_data: 'cmd:/queue' }],
      [{ text: '📊 Progress', callback_data: 'cmd:/progress' }, { text: '🔄 Refresh', callback_data: 'cmd:/refresh' }],
    ],
    '/progress': [
      [{ text: '🎬 Pickup', callback_data: 'cmd:/pickup' }, { text: '📋 Queue', callback_data: 'cmd:/queue' }],
    ],
    '/help': [
      [{ text: '🎬 Pickup', callback_data: 'cmd:/pickup' }, { text: '📊 Gate', callback_data: 'cmd:/gate' }],
      [{ text: '📋 Digest', callback_data: 'cmd:/digest' }, { text: '🔄 Refresh', callback_data: 'cmd:/refresh' }],
    ],
    // Sprint 406: Actionable dashboard
    '/dashboard': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '🎬 Session', callback_data: 'cmd:/session' }],
      [{ text: '📊 Gate', callback_data: 'cmd:/gate' }, { text: '🤖 Achiri', callback_data: 'cmd:/achiri' }],
      [{ text: '🔄 Refresh', callback_data: 'cmd:/refresh' }, { text: '📈 A/B Results', callback_data: 'cmd:/abresults' }],
    ],
  };

  const buttons = buttonMap[cmdName];

  try {
    if (buttons) {
      await sendMessageWithButtons(chatId, response, buttons);
    } else {
      await sendMessage(chatId, response);
    }
  } catch (e: any) {
    // If message is too long or buttons failed, truncate and retry without buttons
    if (response.length > 4000) {
      await sendMessage(chatId, response.slice(0, 3900) + '\n\n_(truncated)_');
    } else {
      // Retry without buttons
      try { await sendMessage(chatId, response); } catch { throw e; }
    }
  }

  const timestamp = new Date().toISOString();
  fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
}

// ─── Polling loop ─────────────────────────────────────────────────────

// Sprint 432: Register bot commands for Telegram autocomplete menu
async function registerBotCommands(): Promise<void> {
  const commands = [
    { command: 'menu', description: 'Quick access button menu' },
    { command: 'deliver', description: 'Send top videos for posting' },
    { command: 'gate', description: 'Phase 1.5 gate countdown' },
    { command: 'streak', description: 'Posting streak + pace' },
    { command: 'queue', description: 'Unposted videos ranked by score' },
    { command: 'today', description: 'Daily posting brief' },
    { command: 'record', description: 'Record a manual TikTok post' },
    { command: 'posted', description: 'Mark last video as posted' },
    { command: 'digest', description: 'Morning digest: gate + pipeline' },
    { command: 'autopost', description: 'Auto-post readiness status' },
    { command: 'analytics', description: 'Content performance insights' },
    { command: 'lastrun', description: 'Latest pipeline run report' },
    { command: 'status', description: 'Full system status overview' },
    { command: 'golive', description: 'Go-live readiness checklist' },
    { command: 'revenue', description: 'Revenue dashboard + MRR' },
    { command: 'schedule', description: 'Today\'s posting time slots' },
    { command: 'quickstart', description: 'Post first video in 5 min' },
    { command: 'boot', description: 'Start all essential PM2 crons' },
    { command: 'publish', description: 'One-tap publish to TikTok+IG+YouTube' },
    { command: 'cleanup', description: 'Archive old runs, free disk space' },
    { command: 'help', description: 'List all commands' },
  ];
  try {
    await telegramRequest('setMyCommands', { commands });
    console.log(`[Bot] Registered ${commands.length} commands for autocomplete`);
  } catch (err: any) {
    console.warn(`[Bot] setMyCommands failed (non-fatal): ${err.message}`);
  }
}

async function poll(): Promise<void> {
  let offset = loadOffset();
  let backoffMs = 1000;

  console.log(`[Bot] Starting Telegram bot — polling for updates (offset: ${offset})`);
  console.log(`[Bot] Owner chat ID: ${OWNER_CHAT_ID}`);

  // Register autocomplete commands on startup
  await registerBotCommands();

  while (true) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);

        // Sprint 389: Handle inline button callback queries
        if (update.callback_query) {
          const cb = update.callback_query;
          const cbChatId = String(cb.message?.chat?.id ?? '');
          const cbData: string = cb.data ?? '';
          if (cbChatId && cbData.startsWith('cmd:')) {
            const cbCmd = cbData.slice(4); // remove 'cmd:' prefix
            answerCallbackQuery(cb.id, 'Running...').catch(() => {});
            await handleCommand(cbChatId, cbCmd).catch((e: any) => {
              console.error(`[Bot] Callback handler error: ${e.message}`);
            });
          }
          // Sprint 435: Handle one-tap "Posted" button from delivered videos
          if (cbChatId && cbData.startsWith('posted:')) {
            const videoId = cbData.slice(7); // remove 'posted:' prefix
            answerCallbackQuery(cb.id, 'Recording post...').catch(() => {});
            await handleCommand(cbChatId, `/record ${videoId} 0`).catch((e: any) => {
              console.error(`[Bot] Posted callback error: ${e.message}`);
            });
          }
          continue;
        }

        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        const text: string = msg.text;

        if (text.startsWith('/')) {
          await handleCommand(chatId, text).catch((e: any) => {
            console.error(`[Bot] Handler error: ${e.message}`);
          });
        }
      }

      if (updates.length > 0) {
        saveOffset(offset);
      }

      backoffMs = 1000; // reset backoff on success
    } catch (e: any) {
      console.error(`[Bot] Poll error: ${e.message}`);
      // Exponential backoff up to 60s
      await new Promise(r => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60000);
    }
  }
}

// ─── Entry ────────────────────────────────────────────────────────────

poll().catch(err => {
  console.error('[Bot] Fatal:', err);
  process.exit(1);
});
