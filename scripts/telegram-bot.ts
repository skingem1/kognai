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

const ROOT = path.resolve(__dirname, '..');
const OFFSET_FILE = path.join(ROOT, 'logs', 'telegram-bot-offset.txt');
const AUDIT_LOG = path.join(ROOT, 'audit.log');

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

// ─── Offset persistence ───────────────────────────────────────────────

function loadOffset(): number {
  try { return parseInt(fs.readFileSync(OFFSET_FILE, 'utf-8').trim(), 10) || 0; }
  catch { return 0; }
}

function saveOffset(offset: number): void {
  try { fs.writeFileSync(OFFSET_FILE, String(offset)); } catch {}
}

// ─── Real data gatherers ──────────────────────────────────────────────

interface Pm2Process {
  name: string;
  status: string;
  restarts: number;
  uptimeMs: number | null;
  memory: number | null;
  cpu: number | null;
}

function getPm2List(): Pm2Process[] {
  try {
    const out = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const list: any[] = JSON.parse(out);
    return list.map((p: any) => {
      const env = p.pm2_env || {};
      const status = env.status || 'unknown';
      return {
        name: p.name,
        status,
        restarts: env.restart_time ?? 0,
        uptimeMs: status === 'online' && env.pm_uptime ? Date.now() - env.pm_uptime : null,
        memory: p.monit?.memory ?? null,
        cpu: p.monit?.cpu ?? null,
      };
    });
  } catch (e: any) {
    return [];
  }
}

function readJSON<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

function fmtUptime(ms: number | null): string {
  if (!ms || ms < 0) return 'stopped';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`;
}

function fmtMem(bytes: number | null): string {
  if (!bytes) return '';
  return ` ${Math.round(bytes / 1024 / 1024)}MB`;
}

function latestSprintFile(): string | null {
  const sprintsDir = path.join(ROOT, 'sprints');
  try {
    const files = fs.readdirSync(sprintsDir)
      .filter(f => f.match(/^week-\d+\.json$/))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)![0], 10);
        const nb = parseInt(b.match(/\d+/)![0], 10);
        return nb - na;
      });
    return files[0] ? path.join(sprintsDir, files[0]) : null;
  } catch { return null; }
}

// ─── Command handlers ─────────────────────────────────────────────────

function cmdPm2(): string {
  const procs = getPm2List();
  if (!procs.length) return '❌ *PM2* — could not read process list (pm2 jlist failed)';

  const online = procs.filter(p => p.status === 'online').length;
  const lines = procs.map(p => {
    const icon = p.status === 'online' ? '🟢' : '🔴';
    const uptime = fmtUptime(p.uptimeMs);
    const mem = fmtMem(p.memory);
    const cpu = p.cpu != null ? ` CPU:${p.cpu}%` : '';
    const restarts = p.restarts > 0 ? ` ↺${p.restarts}` : '';
    return `${icon} \`${p.name}\` — ${p.status} (${uptime}${mem}${cpu}${restarts})`;
  }).join('\n');

  return `*PM2 Processes* — ${online}/${procs.length} online\n\n${lines}`;
}

function cmdHealth(): string {
  const h = readJSON<any>(path.join(ROOT, 'health.json'));
  if (!h) return '❌ *Health* — health.json not found';

  const statusIcon = { healthy: '✅', degraded: '⚠️', critical: '🔴', dead: '💀' }[h.status as string] ?? '❓';
  const beat = h.last_heartbeat ? `Last beat: ${h.last_heartbeat.replace('T', ' ').slice(0, 19)} UTC` : '';
  const checks = Object.entries(h.checks || {}).map(([k, v]) => {
    const icon = v === 'operational' ? '✅' : '🔴';
    return `  ${icon} ${k.replace(/_/g, ' ')}: ${v}`;
  }).join('\n');

  const pm2 = h.pm2 ? `\n*PM2 (from last heartbeat)*: ${h.pm2.online}/${h.pm2.total} online` : '';
  const critDown = h.pm2?.critical_down?.length ? `\n⚠️ Critical down: ${h.pm2.critical_down.join(', ')}` : '';

  return `${statusIcon} *Health* — \`${h.status}\`\n${beat}\nPhase: ${h.phase} | Day ${h.beta?.day_number ?? '?'}\n\n*Infra checks:*\n${checks}${pm2}${critDown}`;
}

function cmdTier(): string {
  const t = readJSON<any>(path.join(ROOT, 'tier.json'));
  if (!t) return '❌ *Tier* — tier.json not found';

  const hist = (t.history || []).slice(-3).reverse().map((e: any) =>
    `  • ${e.date}: ${e.tier} — ${e.event}`
  ).join('\n');

  return `*Tier Status*\n\nCurrent: \`${t.current_tier}\`\nMRR: $${t.mrr}\nBilling activation: ${t.billing_activation_date}\nDay: ${t.day_number}\n\n*Recent history:*\n${hist || '  none'}`;
}

function cmdSprint(): string {
  const sprintPath = latestSprintFile();
  if (!sprintPath) return '❌ *Sprint* — no sprint files found';

  const sprint = readJSON<any>(sprintPath);
  if (!sprint) return '❌ *Sprint* — could not parse sprint file';

  const name = path.basename(sprintPath, '.json');
  const tasks: any[] = sprint.tasks || [];
  const done = tasks.filter((t: any) => t.status === 'done').length;
  const inProgress = tasks.filter((t: any) => t.status === 'in_progress').length;
  const pending = tasks.filter((t: any) => !['done', 'in_progress'].includes(t.status)).length;

  // Group by status
  const inProg = tasks.filter((t: any) => t.status === 'in_progress').slice(0, 5)
    .map((t: any) => `  🔄 [${t.id}] ${t.description?.slice(0, 60) ?? t.type}`).join('\n');

  return `*Sprint: ${name}*\n\n✅ Done: ${done}/${tasks.length}\n🔄 In progress: ${inProgress}\n⏳ Pending: ${pending}\n\n${inProg || ''}`;
}

function cmdReport(): string {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  // 1. PM2 real state
  const procs = getPm2List();
  const online = procs.filter(p => p.status === 'online').length;
  const critDown = procs
    .filter(p => ['backend', 'openclaw-gateway'].includes(p.name) && p.status !== 'online')
    .map(p => p.name);

  const pm2Lines = procs.map(p => {
    const icon = p.status === 'online' ? '🟢' : '🔴';
    const up = fmtUptime(p.uptimeMs);
    const mem = fmtMem(p.memory);
    const r = p.restarts > 100 ? ` ↺${p.restarts}` : '';
    return `${icon} \`${p.name}\` ${up}${mem}${r}`;
  }).join('\n');

  // 2. Health
  const h = readJSON<any>(path.join(ROOT, 'health.json'));
  const healthStatus = h?.status ?? 'unknown';
  const statusIcon = { healthy: '✅', degraded: '⚠️', critical: '🔴', dead: '💀' }[healthStatus] ?? '❓';
  const phase = h?.phase ?? '?';
  const day = h?.beta?.day_number ?? '?';
  const lastBeat = h?.last_heartbeat?.replace('T', ' ').slice(0, 16) ?? 'never';

  // 3. Infra checks
  const downInfra = Object.entries(h?.checks ?? {})
    .filter(([, v]) => v !== 'operational')
    .map(([k]) => k.replace(/_/g, ' '));

  // 4. Tier
  const t = readJSON<any>(path.join(ROOT, 'tier.json'));
  const mrr = t?.mrr ?? 0;
  const tier = t?.current_tier ?? '?';
  const billingDate = t?.billing_activation_date ?? '?';

  // 5. Beta metrics
  const beta = h?.beta ?? {};

  // 6. Sprint
  const sprintPath = latestSprintFile();
  let sprintLine = 'no sprint file';
  if (sprintPath) {
    const s = readJSON<any>(sprintPath);
    if (s) {
      const tasks: any[] = s.tasks || [];
      const done = tasks.filter((t: any) => t.status === 'done').length;
      sprintLine = `${path.basename(sprintPath, '.json')}: ${done}/${tasks.length} done`;
    }
  }

  // 7. Critical alert if any
  const alerts: string[] = [];
  if (critDown.length) alerts.push(`⚠️ CRITICAL DOWN: ${critDown.join(', ')}`);
  if (downInfra.length) alerts.push(`⚠️ Infra issues: ${downInfra.join(', ')}`);
  const alertBlock = alerts.length ? `\n${alerts.join('\n')}\n` : '';

  // 8. Gate countdown
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let gatePostCount = 0;
  let gateTotalViews = 0;
  if (fs.existsSync(manualPostsPath)) {
    const lines = fs.readFileSync(manualPostsPath, 'utf-8').split('\n').filter(l => l.trim());
    gatePostCount = lines.length;
    for (const line of lines) {
      try { gateTotalViews += JSON.parse(line).views ?? 0; } catch {}
    }
  }
  const gateDaysLeft = Math.max(0, Math.ceil((new Date('2026-04-07').getTime() - Date.now()) / 86_400_000));
  const gateIcon = gatePostCount >= 30 && gateTotalViews >= 500 ? '✅' : '⏳';
  const gateLine = `${gateIcon} Phase 1.5 gate: ${gatePostCount}/30 posts · ${gateTotalViews}/500 views · ${gateDaysLeft}d left`;

  return (
    `${statusIcon} *Kognai System Report*\n${now}\n${alertBlock}\n` +
    `*PM2* (${online}/${procs.length} live):\n${pm2Lines || '  (no data)'}\n\n` +
    `*Status:* \`${healthStatus}\` | Phase: ${phase} | Day ${day}\n` +
    `Last heartbeat: ${lastBeat} UTC\n\n` +
    `*Beta:* agents_onboarded=${beta.agents_onboarded ?? 0}, companies=${beta.companies_onboarded ?? 0}, txns=${beta.transactions_monitored ?? 0}\n` +
    `*Financials:* MRR $${mrr} | Tier: ${tier} | Billing activation: ${billingDate}\n\n` +
    `*Gate:* ${gateLine}\n` +
    `*Sprint:* ${sprintLine}`
  );
}

function cmdGate(): string {
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let postCount = 0;
  let totalViews = 0;

  if (fs.existsSync(manualPostsPath)) {
    const lines = fs.readFileSync(manualPostsPath, 'utf-8').split('\n').filter(l => l.trim());
    postCount = lines.length;
    for (const line of lines) {
      try { totalViews += JSON.parse(line).views ?? 0; } catch {}
    }
  }

  const gateDate = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - postCount);
  const postsPerDay = daysLeft > 0 ? (postsNeeded / daysLeft).toFixed(1) : '∞';
  const viewsNeeded = Math.max(0, 500 - totalViews);

  const postIcon = postCount >= 30 ? '✅' : '⏳';
  const viewIcon = totalViews >= 500 ? '✅' : '⏳';
  const urgency = daysLeft <= 7 ? '🔴 URGENT' : daysLeft <= 14 ? '🟡 WARNING' : '🟢 ON TRACK';

  return (
    `*Phase 1.5 Gate — TikTok Kill Switch*\n` +
    `📅 Apr 7 · ${daysLeft} days remaining · ${urgency}\n\n` +
    `${postIcon} Posts: ${postCount}/30 (need ${postsNeeded} more)\n` +
    `${viewIcon} Views: ${totalViews}/500 (need ${viewsNeeded} more)\n` +
    `📊 Pace needed: ${postsPerDay} posts/day\n\n` +
    `_Record a post: npx ts-node scripts/scs001/record-manual-post.ts --video-id <id> --views <n>_`
  );
}

// ─── Sprint 265: /record, /queue, /review commands ────────────────────

function readLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function cmdRecord(args: string): string {
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

  const entry = {
    video_id: videoId,
    views,
    title,
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

function cmdQueue(): string {
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

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

  if (unposted.length === 0) {
    return (
      `📋 *Posting Queue — Empty*\n\n` +
      `No unposted videos in the ledger.\n` +
      `Pipeline total: ${ledger.length} | Posted: ${recorded.length}`
    );
  }

  const top5 = unposted.slice(0, 5);
  const readyCount = unposted.filter((e: any) => hasCaptionedMp4(e.video_id)).length;

  const lines = top5.map((e: any, i: number) => {
    const vs = viralScores.get(e.video_id);
    const vsStr = vs != null ? ` 🧬${vs}` : '';
    const ready = hasCaptionedMp4(e.video_id) ? ' ✅' : ' ⏳';
    return `${i + 1}. \`${e.video_id}\`${vsStr}${ready}`;
  });

  return (
    `📋 *Posting Queue* — ${unposted.length} unposted (${readyCount} ready)\n\n` +
    lines.join('\n') +
    `\n\n_To record: \`/record <video_id> <views>\`_` +
    `\n_✅ = captioned mp4 ready · 🧬 = viral score_`
  );
}

function cmdReview(): string {
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

// Sprint 280: Find captioned mp4 path for a video ID
function findCaptionedMp4(videoId: string): string | null {
  try {
    const scsDir = path.join(ROOT, 'workspace', 'scs001');
    const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = path.join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

// Sprint 280: Get experiment data for a video ID
function getExperimentData(videoId: string): { speaker: string; hook_formula: string; viral_score: number | null; topic: string | null } {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  const result = { speaker: 'unknown', hook_formula: 'unknown', viral_score: null as number | null, topic: null as string | null };
  if (!fs.existsSync(expPath)) return result;
  try {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id === videoId) {
          if (e.speaker) result.speaker = e.speaker;
          if (e.hook_formula) result.hook_formula = e.hook_formula;
          if (e.partial_viral_score != null) result.viral_score = e.partial_viral_score;
          if (e.topic) result.topic = e.topic;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return result;
}

// Sprint 280: Build TikTok-ready caption with hashtags
function buildTikTokCaption(videoId: string): string {
  const exp = getExperimentData(videoId);

  // Load viral topics for hashtags
  let topicTags: string[] = [];
  try {
    const vt = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json'), 'utf-8'));
    topicTags = (vt.topics ?? []).slice(0, 5).map((t: string) => `#${t.replace(/\s+/g, '')}`);
  } catch { /* fallback */ }

  const baseTags = ['#fyp', '#viral', '#learnontiktok', '#ai', '#tech'];
  const tagSet: Record<string, boolean> = {};
  for (const t of [...topicTags, ...baseTags]) tagSet[t] = true;
  const allTags = Object.keys(tagSet).slice(0, 8);

  const lines: string[] = [];
  if (exp.speaker && exp.speaker !== 'unknown') {
    lines.push(`🎙️ ${exp.speaker}`);
  }
  if (exp.hook_formula && exp.hook_formula !== 'unknown') {
    lines.push(`Hook: ${exp.hook_formula}`);
  }
  lines.push('');
  lines.push(allTags.join(' '));

  return lines.join('\n');
}

// Sprint 280: /caption <video_id> — generate TikTok-ready caption
function cmdCaption(args: string): string {
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

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

  // Filter to only those with captioned mp4 ready
  const ready = unposted.filter((e: any) => findCaptionedMp4(e.video_id) !== null);

  if (ready.length === 0) {
    return `📦 *Deliver* — No ready-to-post videos found.\n\nRun the pipeline first, then try again.`;
  }

  const batch = ready.slice(0, count);
  let sent = 0;

  await sendMessage(chatId, `📦 *Delivering ${batch.length} videos for posting...*`);

  for (const entry of batch) {
    const videoId = entry.video_id;
    const mp4Path = findCaptionedMp4(videoId);
    if (!mp4Path) continue;

    const caption = buildTikTokCaption(videoId);
    const vs = viralScores.get(videoId);
    const vsStr = vs != null ? `🧬 ${vs}` : '';
    const tgCaption = `📦 *Post this to TikTok* ${vsStr}\n\n${caption}\n\n\`/record ${videoId} 0\``;

    try {
      await sendVideoFile(chatId, mp4Path, tgCaption);
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

// Sprint 282: /streak — posting streak tracker
function cmdStreak(): string {
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  if (posts.length === 0) {
    return (
      `🔥 *Posting Streak*\n\n` +
      `No posts recorded yet.\n` +
      `Start posting to build your streak!\n\n` +
      `_Use \`/deliver\` to get videos, then \`/record <id> <views>\` after posting._`
    );
  }

  // Get unique posting days (sorted)
  const daySet: Record<string, number> = {};
  for (const p of posts as any[]) {
    const date = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    if (date) {
      daySet[date] = (daySet[date] || 0) + 1;
    }
  }
  const days = Object.keys(daySet).sort();

  // Calculate current streak (consecutive days ending at today or yesterday)
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let currentStreak = 0;
  let checkDate = days.includes(today) ? today : (days.includes(yesterday) ? yesterday : null);

  if (checkDate) {
    let d = new Date(checkDate);
    while (daySet[d.toISOString().slice(0, 10)]) {
      currentStreak++;
      d = new Date(d.getTime() - 86400000);
    }
  }

  // Calculate best streak
  let bestStreak = 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]).getTime();
    const curr = new Date(days[i]).getTime();
    if (curr - prev === 86400000) {
      streak++;
    } else {
      bestStreak = Math.max(bestStreak, streak);
      streak = 1;
    }
  }
  bestStreak = Math.max(bestStreak, streak);

  // Today's posts
  const todayPosts = daySet[today] || 0;

  // Pace
  const daysLeft = Math.max(1, Math.ceil((new Date('2026-04-07').getTime() - Date.now()) / 86400000));
  const postsLeft = Math.max(0, 30 - posts.length);
  const pace = postsLeft > 0 ? Math.ceil(postsLeft / daysLeft) : 0;

  const streakEmoji = currentStreak >= 7 ? '🔥🔥🔥' : currentStreak >= 3 ? '🔥🔥' : currentStreak >= 1 ? '🔥' : '❄️';

  return (
    `${streakEmoji} *Posting Streak*\n\n` +
    `Current streak: *${currentStreak} day${currentStreak !== 1 ? 's' : ''}*\n` +
    `Best streak: *${bestStreak} day${bestStreak !== 1 ? 's' : ''}*\n` +
    `Today: *${todayPosts} post${todayPosts !== 1 ? 's' : ''}*\n` +
    `Total: *${posts.length}/30*\n\n` +
    `📊 Gate: ${postsLeft} posts in ${daysLeft}d (${pace}/day needed)\n` +
    `📅 Active days: ${days.length}\n\n` +
    (currentStreak === 0 ? `_Post today to start a new streak!_` : `_Keep it going! Post today to extend your streak._`)
  );
}

// Sprint 285: /onboard — first-time posting walkthrough
function cmdOnboard(): string {
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

// Sprint 284: /analytics — content performance insights
function cmdAnalytics(): string {
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

// Sprint 287: /today — daily posting brief with recommendations
function cmdToday(): string {
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

// Sprint 286: /pipeline — content pipeline inventory & health dashboard
function cmdPipeline(): string {
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

function cmdCalendar(): string {
  const calPath = path.join(ROOT, 'workspace', 'scs001', 'content-calendar.json');
  if (!fs.existsSync(calPath)) {
    return '📅 No content calendar found.\nGenerate one: `npx ts-node scripts/scs001/generate-content-calendar.ts`';
  }

  try {
    const cal = JSON.parse(fs.readFileSync(calPath, 'utf-8'));
    const schedule: Record<string, Array<{ video_id: string; slot: string; viral_score: number | null; speaker: string; topic: string; hook_formula?: string }>> = cal.schedule || {};
    const dates = Object.keys(schedule).sort();

    if (dates.length === 0) {
      return '📅 Calendar is empty — no videos assigned.';
    }

    // Show next 7 days from today
    const today = new Date().toISOString().split('T')[0];
    const upcoming = dates.filter(d => d >= today).slice(0, 7);

    if (upcoming.length === 0) {
      return '📅 No upcoming dates in calendar. Regenerate:\n`npx ts-node scripts/scs001/generate-content-calendar.ts`';
    }

    // Count manual posts
    const manualPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
    let posted = 0;
    if (fs.existsSync(manualPath)) {
      posted = fs.readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim()).length;
    }
    const postsLeft = Math.max(0, 30 - posted);
    const gateDate = new Date('2026-04-07');
    const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

    const lines: string[] = [
      `📅 *Content Calendar — Next 7 Days*`,
      `Gate: ${postsLeft} posts needed, ${daysLeft}d left`,
      '',
    ];

    for (const date of upcoming) {
      const items = schedule[date] || [];
      const dayName = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      lines.push(`*${dayName}:*`);

      if (items.length === 0) {
        lines.push('  (no videos assigned)');
      } else {
        for (const item of items) {
          const vs = item.viral_score != null ? `🧬${item.viral_score}` : '';
          const spk = item.speaker && item.speaker !== 'unknown' ? `🎙️${item.speaker}` : '';
          lines.push(`  ${item.slot} — \`${item.video_id}\` ${vs} ${spk}`);
        }
      }
      lines.push('');
    }

    lines.push(`_Total: ${cal.total_videos_assigned ?? '?'} videos across ${cal.total_days ?? '?'} days_`);
    lines.push(`_Generated: ${cal.generated_at ? cal.generated_at.split('T')[0] : 'unknown'}_`);

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading calendar: ${e.message}`;
  }
}

// Sprint 339: /posted — mark last auto-delivered video as posted (zero typing)
function cmdPosted(): string {
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

  // Record the post
  const entry = {
    video_id: videoId,
    views: 0,
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

// Sprint 344: /crons — show all PM2 cron schedules
function cmdCrons(): string {
  try {
    const out = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const list: any[] = JSON.parse(out);

    const crons = list
      .filter((p: any) => p.pm2_env?.cron_restart)
      .map((p: any) => ({
        name: p.name as string,
        cron: p.pm2_env.cron_restart as string,
        status: (p.pm2_env?.status ?? 'unknown') as string,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (crons.length === 0) {
      return `⏰ *Cron Schedules* — No cron jobs found in PM2.`;
    }

    // Categorize
    const categories: Record<string, typeof crons> = {};
    for (const c of crons) {
      let cat = 'Other';
      if (c.name.includes('deliver') || c.name.includes('post') || c.name.includes('blitz')) cat = 'Posting';
      else if (c.name.includes('digest') || c.name.includes('brief') || c.name.includes('gate')) cat = 'Digest/Gates';
      else if (c.name.includes('achiri')) cat = 'Achiri';
      else if (c.name.includes('pipeline') || c.name.includes('smoke') || c.name.includes('watchdog')) cat = 'Pipeline';
      else if (c.name.includes('caption') || c.name.includes('schedule') || c.name.includes('view')) cat = 'Content';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(c);
    }

    const lines: string[] = [`⏰ *Cron Schedules* (${crons.length} jobs)\n`];

    for (const [cat, items] of Object.entries(categories)) {
      lines.push(`*${cat}:*`);
      for (const c of items) {
        const icon = c.status === 'online' ? '🟢' : c.status === 'stopped' ? '⏸️' : '🔴';
        lines.push(`${icon} \`${c.cron}\` ${c.name}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Failed to read PM2 cron list: ${e.message}`;
  }
}

// Sprint 342: /tiktokauth — OAuth URL + step-by-step guide for getting TIKTOK_ACCESS_TOKEN
function cmdTikTokAuth(): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;

  if (hasToken) {
    return (
      `✅ *TikTok Access Token is SET!*\n\n` +
      `Auto-posting is ready. The token will be refreshed automatically.\n\n` +
      `To re-authorize: remove TIKTOK\\_ACCESS\\_TOKEN from .env and run /tiktokauth again.`
    );
  }

  if (!clientKey) {
    return (
      `❌ *TIKTOK\\_CLIENT\\_KEY not set*\n\n` +
      `Add it to .env first:\n` +
      `1. Go to developers.tiktok.com\n` +
      `2. Create an app → get Client Key + Client Secret\n` +
      `3. Add to .env:\n` +
      `   TIKTOK\\_CLIENT\\_KEY=your\\_key\n` +
      `   TIKTOK\\_CLIENT\\_SECRET=your\\_secret`
    );
  }

  const port = process.env.TIKTOK_OAUTH_PORT || '3456';
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `http://localhost:${port}/callback`;
  const scopes = 'user.info.basic,video.publish';

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: scopes,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: require('crypto').randomBytes(8).toString('hex'),
  });
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  return (
    `🔑 *TikTok Authorization*\n\n` +
    `*Step 1:* Start the callback server on your Mac:\n` +
    `\`npx ts-node scripts/tiktok-oauth.ts\`\n\n` +
    `*Step 2:* Open this URL in your browser:\n` +
    `${authUrl}\n\n` +
    `*Step 3:* Authorize the app on TikTok\n\n` +
    `*Step 4:* The callback server will save the token to .env automatically\n\n` +
    `*Step 5:* Restart the bot: \`pm2 restart kognai-telegram-bot\`\n\n` +
    `After this, auto-posting will be enabled!`
  );
}

// Sprint 346: /golive — one-stop Phase 1 go-live readiness checker
function cmdGoLive(): string {
  const lines: string[] = ['🚀 *Phase 1 Go-Live Readiness*', ''];

  // 1. TikTok OAuth
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;
  const hasClientKey = !!process.env.TIKTOK_CLIENT_KEY;
  const hasClientSecret = !!process.env.TIKTOK_CLIENT_SECRET;
  lines.push(hasToken ? '✅ TikTok Access Token: SET' : '❌ TikTok Access Token: MISSING');
  lines.push(hasClientKey ? '✅ TikTok Client Key: SET' : '❌ TikTok Client Key: MISSING');
  lines.push(hasClientSecret ? '✅ TikTok Client Secret: SET' : '❌ TikTok Client Secret: MISSING');

  // 2. Stripe
  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_GROWTH', 'STRIPE_PRICE_PREMIUM'];
  const stripeSet = stripeKeys.filter(k => !!process.env[k]).length;
  lines.push(stripeSet === stripeKeys.length ? '✅ Stripe: READY' : `⚠️ Stripe: ${stripeSet}/${stripeKeys.length} keys set`);

  // 3. Gate progress
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  let postsCount = 0;
  let totalViews = 0;
  const mpPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  if (fs.existsSync(mpPath)) {
    const posts = fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim());
    postsCount = posts.length;
    for (const l of posts) {
      try { const p = JSON.parse(l); totalViews += (p.views ?? 0); } catch {}
    }
  }
  const postsLeft = Math.max(0, 30 - postsCount);
  const viewsLeft = Math.max(0, 500 - totalViews);
  const paceNeeded = daysLeft > 0 && postsLeft > 0 ? Math.round(postsLeft / daysLeft * 10) / 10 : 0;

  lines.push('');
  lines.push(`📅 Gate Deadline: Apr 7 (${daysLeft} days left)`);
  lines.push(`📊 Posts: ${postsCount}/30 ${postsLeft > 0 ? `(${postsLeft} more needed)` : '✅'}`);
  lines.push(`👁 Views: ${totalViews}/500 ${viewsLeft > 0 ? `(${viewsLeft} more needed)` : '✅'}`);
  if (paceNeeded > 0) lines.push(`⏱ Pace: ${paceNeeded} posts/day`);

  // 4. Queue
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  let queueCount = 0;
  if (fs.existsSync(ledgerPath)) {
    const postedIds = new Set<string>();
    if (fs.existsSync(mpPath)) {
      for (const l of fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
        try { const p = JSON.parse(l); if (p.video_id) postedIds.add(p.video_id); } catch {}
      }
    }
    for (const l of fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try { const e = JSON.parse(l); if (e.video_id && !postedIds.has(e.video_id)) queueCount++; } catch {}
    }
  }
  lines.push(`📦 Queue: ${queueCount} videos ready to post`);

  // 5. Urgency signal
  lines.push('');
  if (postsLeft <= 0 && viewsLeft <= 0) {
    lines.push('✅ GATE CRITERIA MET — ready for Phase 2A!');
  } else if (daysLeft <= 3 && postsLeft > 0) {
    lines.push('💀 KILL SWITCH IMMINENT — post NOW or TikTok agent shuts down');
  } else if (daysLeft <= 7 && postsLeft > 0) {
    lines.push('🚨 CRITICAL — behind pace, increase posting frequency');
  } else if (postsCount === 0) {
    lines.push('⚠️ WARNING — 0 posts recorded. Start posting now!');
  } else if (paceNeeded > 3) {
    lines.push('🟠 Behind pace — need to accelerate posting');
  } else {
    lines.push('🟢 On track — maintain current pace');
  }

  // 6. Next steps
  lines.push('');
  lines.push('*Next Steps:*');
  const steps: string[] = [];
  if (!hasToken) steps.push('1. Run /tiktokauth to get TikTok access token');
  if (queueCount > 0) steps.push(`${steps.length + 1}. Use /postbatch to get videos to post`);
  if (postsCount === 0) steps.push(`${steps.length + 1}. Post first video + /record <id> <views>`);
  if (hasToken && queueCount > 0) steps.push(`${steps.length + 1}. Enable auto-posting: AUTO\\_POST\\_DRY\\_RUN=0`);
  if (steps.length === 0) steps.push('All systems go! Keep posting to hit the gate.');
  lines.push(...steps);

  return lines.join('\n');
}

// Sprint 348: /audit — content quality audit with posting recommendations
function cmdAudit(): string {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const mpPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

  // Load experiments for scores
  const scores = new Map<string, number>();
  const speakers = new Map<string, { count: number; totalScore: number }>();
  const hooks = new Map<string, number>();
  if (fs.existsSync(expPath)) {
    for (const l of fs.readFileSync(expPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try {
        const e = JSON.parse(l);
        const id = e.clip_id ?? e.video_id;
        const score = e.partial_viral_score ?? 0;
        if (id) scores.set(id, score);
        if (e.speaker) {
          const s = speakers.get(e.speaker) ?? { count: 0, totalScore: 0 };
          s.count++; s.totalScore += score;
          speakers.set(e.speaker, s);
        }
        if (e.hook_formula) hooks.set(e.hook_formula, (hooks.get(e.hook_formula) ?? 0) + 1);
      } catch {}
    }
  }

  // Load posted IDs
  const postedIds = new Set<string>();
  if (fs.existsSync(mpPath)) {
    for (const l of fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try { const p = JSON.parse(l); if (p.video_id) postedIds.add(p.video_id); } catch {}
    }
  }

  // Load unposted videos from ledger
  const unposted: Array<{ id: string; score: number }> = [];
  if (fs.existsSync(ledgerPath)) {
    for (const l of fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try {
        const e = JSON.parse(l);
        if (e.video_id && !postedIds.has(e.video_id)) {
          unposted.push({ id: e.video_id, score: scores.get(e.video_id) ?? 0 });
        }
      } catch {}
    }
  }
  unposted.sort((a, b) => b.score - a.score);

  // Score distribution
  const scoreValues = unposted.map(v => v.score);
  const avgScore = scoreValues.length > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;
  const high = scoreValues.filter(s => s >= 0.6).length;
  const mid = scoreValues.filter(s => s >= 0.3 && s < 0.6).length;
  const low = scoreValues.filter(s => s < 0.3).length;

  // Top speakers
  const topSpeakers = Array.from(speakers.entries())
    .map(([name, s]) => ({ name, avg: s.totalScore / s.count, count: s.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // Hook diversity
  const hookCount = hooks.size;

  const lines: string[] = [
    '🔍 *Content Quality Audit*',
    '',
    `📦 Total in queue: *${unposted.length}* videos`,
    `📊 Avg viral score: *${Math.round(avgScore * 100)}%*`,
    `🟢 High (60%+): ${high} | 🟡 Mid (30-59%): ${mid} | 🔴 Low (<30%): ${low}`,
    `🎣 Hook diversity: ${hookCount} unique formulas`,
    '',
    '*Top Speakers:*',
  ];
  for (const s of topSpeakers) {
    lines.push(`  ${Math.round(s.avg * 100)}% — ${s.name} (${s.count} clips)`);
  }

  lines.push('');
  lines.push('*Best 5 to post first:*');
  for (const v of unposted.slice(0, 5)) {
    lines.push(`  ${Math.round(v.score * 100)}% — \`${v.id}\``);
  }

  // Posting timeline estimate
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - postedIds.size);
  lines.push('');
  if (postsNeeded > 0) {
    const pace = daysLeft > 0 ? Math.round(postsNeeded / daysLeft * 10) / 10 : postsNeeded;
    lines.push(`⏱ Gate: ${postsNeeded} posts in ${daysLeft} days = ${pace}/day`);
    if (high >= postsNeeded) {
      lines.push('✅ Enough high-quality content to hit the gate');
    } else {
      lines.push(`⚠️ Only ${high} high-quality videos — consider posting mid-tier too`);
    }
  } else {
    lines.push('✅ Gate posts target met!');
  }

  return lines.join('\n');
}

// Sprint 349: /quickstart — zero-friction first post guide
function cmdQuickStart(): string {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const mpPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const topicsPath = path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
  const scsDir = path.join(ROOT, 'workspace', 'scs001');

  // Load posted IDs
  const postedIds = new Set<string>();
  if (fs.existsSync(mpPath)) {
    for (const l of fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try { const p = JSON.parse(l); if (p.video_id) postedIds.add(p.video_id); } catch {}
    }
  }

  // Load experiment scores
  const scores = new Map<string, number>();
  const expData = new Map<string, { speaker: string; hook: string }>();
  if (fs.existsSync(expPath)) {
    for (const l of fs.readFileSync(expPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try {
        const e = JSON.parse(l);
        const id = e.clip_id ?? e.video_id;
        if (id) {
          scores.set(id, e.partial_viral_score ?? 0);
          expData.set(id, { speaker: e.speaker ?? 'unknown', hook: e.hook_formula ?? '' });
        }
      } catch {}
    }
  }

  // Find best unposted video with captioned mp4
  const candidates: Array<{ id: string; score: number; mp4: string }> = [];
  if (fs.existsSync(ledgerPath)) {
    const runDirs = fs.existsSync(scsDir)
      ? fs.readdirSync(scsDir).filter((d: string) => d.startsWith('run-'))
      : [];
    for (const l of fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try {
        const e = JSON.parse(l);
        if (!e.video_id || postedIds.has(e.video_id)) continue;
        for (const dir of runDirs) {
          const mp4 = path.join(scsDir, dir, 'caption', `${e.video_id}-captioned.mp4`);
          if (fs.existsSync(mp4)) {
            candidates.push({ id: e.video_id, score: scores.get(e.video_id) ?? 0, mp4 });
            break;
          }
        }
      } catch {}
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return '❌ No captioned videos found. Run /refresh to generate content first.';
  }

  const best = candidates[0];
  const exp = expData.get(best.id);

  // Build caption
  let hashtags = ['#fyp', '#viral', '#learnontiktok', '#ai', '#tech'];
  if (fs.existsSync(topicsPath)) {
    try {
      const vt = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
      const topicTags = (vt.topics ?? []).slice(0, 4).map((t: string) => '#' + t.replace(/\s+/g, ''));
      hashtags = [...topicTags, ...hashtags].slice(0, 8);
    } catch {}
  }
  const captionLines: string[] = [];
  if (exp?.speaker && exp.speaker !== 'unknown') captionLines.push(exp.speaker);
  if (exp?.hook) captionLines.push(exp.hook);
  captionLines.push('');
  captionLines.push(hashtags.join(' '));
  const caption = captionLines.join('\n');

  const lines: string[] = [
    '🚀 *Quick Start — Post Your First Video*',
    '',
    `🎬 Best video: \`${best.id}\``,
    `📊 Viral score: *${Math.round(best.score * 100)}%*`,
    exp?.speaker ? `🎙️ ${exp.speaker}` : '',
    '',
    '*Step 1:* Find the video file:',
    `\`${best.mp4}\``,
    '',
    '*Step 2:* Copy this caption for TikTok:',
  ].filter(Boolean);

  // Add caption as code block
  lines.push('```');
  lines.push(caption);
  lines.push('```');

  lines.push('');
  lines.push('*Step 3:* Upload to TikTok:');
  lines.push('  1. Open TikTok app → tap +');
  lines.push('  2. Upload the video file');
  lines.push('  3. Paste the caption');
  lines.push('  4. Post!');
  lines.push('');
  lines.push('*Step 4:* After posting, run:');
  lines.push(`\`/record ${best.id} 0\``);
  lines.push('');
  lines.push(`_${candidates.length} more videos ready after this one!_`);

  return lines.join('\n');
}

// Sprint 354: /achiri — alpha readiness dashboard from reports/achiri-readiness.json
// ─── Sprint 362: /metrics — pipeline performance metrics ─────────────

function cmdMetrics(): string {
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

// ─── Sprint 363: /pace — posting velocity tracker and gate countdown ───

function cmdPace(): string {
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const posts = readLines(manualPostsPath);
  const postCount = posts.length;

  const GATE_TARGET = 30;
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, GATE_TARGET - postCount);

  // Calculate current pace (posts per day since first post)
  let pacePerDay = 0;
  let daysSinceFirst = 0;
  if (posts.length > 0) {
    const dates = posts
      .map((p: any) => new Date(p.posted_at ?? p.recorded_at))
      .filter((d: Date) => !isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    if (dates.length > 0) {
      daysSinceFirst = Math.max(1, Math.ceil((now.getTime() - dates[0].getTime()) / 86_400_000));
      pacePerDay = postCount / daysSinceFirst;
    }
  }

  // Pace needed to hit gate
  const paceNeeded = daysLeft > 0 ? postsNeeded / daysLeft : postsNeeded > 0 ? Infinity : 0;

  // Projection at current pace
  const projectedAtGate = postCount + Math.floor(pacePerDay * daysLeft);
  const willPass = projectedAtGate >= GATE_TARGET;

  // Weekly breakdown (posts per week)
  const weeksLeft = Math.ceil(daysLeft / 7);
  const perWeek = daysLeft > 0 ? Math.ceil(postsNeeded / weeksLeft) : 0;

  // Total views
  const totalViews = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);

  const lines: string[] = [];
  lines.push('🏃 *Posting Pace — Gate Countdown*');
  lines.push('');
  lines.push(`📅 Gate: Apr 7 · *${daysLeft}d remaining*`);
  lines.push(`📊 Posts: *${postCount}/${GATE_TARGET}* · ${postsNeeded} to go`);
  lines.push(`👁️ Views: ${totalViews}/500`);
  lines.push('');

  if (postCount === 0) {
    lines.push('⚠️ *No posts yet!* You need to start posting NOW.');
    lines.push(`📌 Required pace: *${paceNeeded.toFixed(1)} posts/day*`);
    lines.push(`📌 That's *${perWeek} posts/week*`);
  } else {
    lines.push(`*Current pace:* ${pacePerDay.toFixed(1)} posts/day`);
    lines.push(`*Needed pace:* ${paceNeeded.toFixed(1)} posts/day`);
    lines.push('');
    lines.push(`*Projection at current pace:* ${projectedAtGate} posts by Apr 7`);
    if (willPass) {
      lines.push('✅ *On track* — keep it up!');
    } else {
      const deficit = GATE_TARGET - projectedAtGate;
      lines.push(`❌ *Off track* — ${deficit} posts short`);
      lines.push(`📌 Increase to *${paceNeeded.toFixed(1)} posts/day* (${perWeek}/week)`);
    }
  }

  lines.push('');
  lines.push('_Use /postnow to get your next video, /posted after posting._');

  return lines.join('\n');
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

// ─── Sprint 368: /postplan — 7-day posting plan with video assignments ─────

function cmdPostPlan(): string {
  const schedulePath = path.join(ROOT, 'reports', 'posting-schedule.json');
  if (!fs.existsSync(schedulePath)) {
    return '⚠️ No posting schedule found. Run the pipeline first.';
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

// ─── Sprint 372: /viralstats — viral score summary ────────────────────────

function cmdViralStats(): string {
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

    await sendMessage(chatId, lines.join('\n'));

  } catch (err: any) {
    await sendMessage(chatId, `❌ Subscribers fetch failed: ${err.message?.slice(0, 200)}`);
  }
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

// ─── Sprint 376: /hooktest — A/B test hook formula performance ──────────────

function cmdHookTest(): string {
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

// ─── Sprint 377: /besttime — optimal posting time recommendations ───────────

function cmdBestTime(): string {
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

// ─── Sprint 378: /export — batch export manifest for mobile posting ─────────

function cmdExport(args: string): string {
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

// ─── Sprint 380: /speakertest — speaker performance A/B test ────────────────

function cmdSpeakerTest(): string {
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

// ─── Sprint 379: /weeklyreport — automated weekly performance summary ────────

function cmdWeeklyReport(): string {
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

// ─── Sprint 370: /dashboard — unified system status overview ──────────────

function cmdDashboard(): string {
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

// ─── Sprint 367: /viral — trending topics for content strategy ────────────

function cmdViral(): string {
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

// ─── Sprint 366: /lastrun — pipeline execution summary ────────────────────

function cmdLastRun(): string {
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

  return lines.join('\n');
}

// ─── Sprint 365: /revenue — financial dashboard with MRR and phase gates ───

function cmdRevenue(): string {
  const dbPath = path.join(ROOT, 'data', 'telegram-db.json');
  let totalUsers = 0;
  let paidUsers = 0;
  let mrr = 0;
  const planCounts: Record<string, number> = { growth: 0, premium: 0, free: 0 };
  const PRICES: Record<string, number> = { growth: 19, premium: 49 };

  if (fs.existsSync(dbPath)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      for (const [_, entry] of Object.entries(db) as [string, any][]) {
        totalUsers++;
        const tier = entry.tier ?? 'free';
        planCounts[tier] = (planCounts[tier] ?? 0) + 1;
        if (tier !== 'free' && entry.active !== false) {
          paidUsers++;
          mrr += PRICES[tier] ?? 0;
        }
      }
    } catch { /* skip */ }
  }

  const arr = mrr * 12;
  const freeUsers = totalUsers - paidUsers;

  const lines: string[] = [];
  lines.push('💰 *Revenue Dashboard*');
  lines.push('');
  lines.push('*Subscribers:*');
  lines.push(`• Total: ${totalUsers} | Free: ${freeUsers} | Growth: ${planCounts.growth} | Premium: ${planCounts.premium}`);
  lines.push(`• Active paid: ${paidUsers}`);
  lines.push('');
  lines.push('*Revenue:*');
  lines.push(`• MRR: *$${mrr}* · ARR: $${arr}`);
  lines.push('');

  const gates = [
    { name: 'Phase 1.5 — TikTok live', target: 0, label: 'posts+views' },
    { name: 'Phase 2A — Achiri alpha', target: 0, label: 'waitlist' },
    { name: 'Phase 2B — 10 subs', target: 190, label: '$190 MRR' },
    { name: 'Phase 3 — Autonomy', target: 500, label: '$500 MRR' },
    { name: 'Phase 4 — x402', target: 1000, label: '$1000 MRR' },
  ];

  lines.push('*Financial Gates:*');
  for (const g of gates) {
    const met = mrr >= g.target;
    const icon = met ? '✅' : '⏳';
    const pct = g.target > 0 ? Math.round((mrr / g.target) * 100) : 100;
    lines.push(`${icon} ${g.name} — ${g.label} (${Math.min(pct, 100)}%)`);
  }

  lines.push('');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  lines.push(stripeKey ? '💳 Stripe: 🟢 CONFIGURED' : '💳 Stripe: 🔴 NOT CONFIGURED');

  return lines.join('\n');
}

// ─── Sprint 356: /digest — unified daily digest ──────────────────────

function cmdDigest(): string {
  // Gate status
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let postCount = 0;
  let totalViews = 0;
  if (fs.existsSync(manualPostsPath)) {
    const lines = fs.readFileSync(manualPostsPath, 'utf-8').split('\n').filter(l => l.trim());
    postCount = lines.length;
    for (const line of lines) {
      try { totalViews += JSON.parse(line).views ?? 0; } catch {}
    }
  }
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

  // Build message
  const out: string[] = [
    `📋 *Daily Digest* — ${now.toISOString().slice(0, 10)}`,
    '',
    `*Gate:* ${urgency}`,
    `📅 Apr 7 · ${daysLeft} days left`,
    `📊 Posts: ${postCount}/30 · Views: ${totalViews}/500`,
  ];

  if (postsNeeded > 0 && daysLeft > 0) {
    out.push(`⏱ Pace: ${postsPerDay} posts/day needed`);
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

  out.push('');
  out.push(`💳 *Stripe:* ${stripeReady ? '✅ Ready' : '❌ Not Ready'}`);
  out.push(`🎵 *TikTok API:* ${tiktokReady ? '✅ Token set' : '❌ No token'}`);

  // Action items
  const actions: string[] = [];
  if (!tiktokReady) actions.push('• Set `TIKTOK\\_ACCESS\\_TOKEN` in .env');
  if (!stripeReady) actions.push('• Configure missing Stripe env vars');
  if (postsNeeded > 0) {
    actions.push(`• Post ${Math.min(postsNeeded, 3)} videos today`);
    actions.push('• Use `/record` after each manual post');
  }
  if (queueCount === 0) actions.push('• Run `/refresh` to fill the queue');

  if (actions.length > 0) {
    out.push('', '*Action items:*', ...actions);
  }

  return out.join('\n');
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

// Sprint 387: /history — posting history timeline with trend analysis
function cmdHistory(): string {
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

// Sprint 351: /updateviews — update view counts for posted videos
function cmdUpdateViews(args: string): string {
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

// Sprint 350: /schedule — today's posting time slots from posting-schedule.json
function cmdSchedule(): string {
  const schedulePath = path.join(ROOT, 'reports', 'posting-schedule.json');
  if (!fs.existsSync(schedulePath)) {
    return '📅 No posting schedule found.\nRun the schedule generator first.';
  }

  try {
    const data = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);
    const slots: Array<{ date: string; time: string; video_id: string; speaker: string; viral_score: number; slot_label: string }> = data.slots ?? [];

    const todaySlots = slots.filter(s => s.date === today);
    const upcomingSlots = slots.filter(s => s.date > today).slice(0, 6);

    const lines: string[] = [
      `📅 *Posting Schedule*`,
      `Gate: ${data.posts_done ?? 0}/30 posts · ${data.days_to_gate ?? '?'}d left · ${data.pace_needed ?? '?'}/day needed`,
      '',
    ];

    if (todaySlots.length > 0) {
      lines.push(`*Today (${today}):*`);
      for (const s of todaySlots) {
        lines.push(`  ${s.slot_label} — \`${s.video_id}\``);
        lines.push(`    🎙️ ${s.speaker} · 🧬 ${Math.round((s.viral_score ?? 0) * 100)}%`);
      }
      lines.push('');
    } else {
      lines.push(`_No slots scheduled for today (${today})._`);
      lines.push('');
    }

    if (upcomingSlots.length > 0) {
      lines.push('*Upcoming:*');
      for (const s of upcomingSlots) {
        lines.push(`  ${s.date} ${s.time} — \`${s.video_id}\` 🎙️ ${s.speaker}`);
      }
      lines.push('');
    }

    lines.push(`_Schedule: ${data.posts_per_day ?? '?'}/day · ${data.queue_remaining ?? '?'} in queue_`);
    lines.push(`_Generated: ${data.generated_at ? data.generated_at.split('T')[0] : 'unknown'}_`);

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading schedule: ${e.message}`;
  }
}

// Sprint 350: /leaderboard — speaker performance rankings from content-leaderboard.json
function cmdLeaderboard(): string {
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

function cmdHelp(): string {
  return (
    `*Kognai Bot Commands*\n\n` +
    `/report    — Full system status (real data, no AI)\n` +
    `/pm2       — Live PM2 process table\n` +
    `/crons     — All PM2 cron schedules\n` +
    `/health    — Health check summary\n` +
    `/tier      — Current tier + MRR\n` +
    `/sprint    — Latest sprint progress\n` +
    `/gate      — Phase 1.5 gate countdown\n` +
    `/queue     — Unposted videos ranked by viral score\n` +
    `/review    — Latest generated video details\n` +
    `/record    — Record a manual TikTok post\n` +
    `/posted    — Mark last auto-delivered video as posted\n` +
    `/deliver   — Batch-send ready videos with captions\n` +
    `/caption   — Generate TikTok-ready caption for a video\n` +
    `/streak    — Posting streak tracker + pace\n` +
    `/analytics — Content performance insights\n` +
    `/onboard   — First-time posting walkthrough\n` +
    `/pipeline  — Content pipeline inventory & health\n` +
    `/refresh   — Trigger new pipeline run (2-5 min)\n` +
    `/tiktokauth — TikTok OAuth setup guide\n` +
    `/today     — Daily posting brief + recommendations\n` +
    `/calendar  — 7-day content posting plan\n` +
    `/golive    — Phase 1 go-live readiness check\n` +
    `/audit     — Content quality audit + recommendations\n` +
    `/quickstart — Post your first video in 5 minutes\n` +
    `/schedule    — Today's posting time slots\n` +
    `/leaderboard — Speaker performance rankings\n` +
    `/updateviews — Update view count for a posted video\n` +
    `/achiri     — Achiri alpha readiness status\n` +
    `/digest     — Daily digest: gate + queue + Stripe\n` +
    `/metrics    — Pipeline performance metrics\n` +
    `/pace       — Posting velocity & gate projection\n` +
    `/postnow    — Send best video for immediate posting\n` +
    `/revenue    — Revenue dashboard + financial gates\n` +
    `/lastrun    — Latest pipeline run details\n` +
    `/viral      — Trending topics for content\n` +
    `/postplan   — 7-day posting plan with videos\n` +
    `/broadcast  — Send announcement to alpha users\n` +
    `/dashboard  — Full system status overview\n` +
    `/todaycaptions — Copy-paste captions for today\n` +
    `/viralstats — Viral score summary + top 3\n` +
    `/checkout  — Generate Stripe checkout link\n` +
    `/subscribers — Active Stripe subscribers + MRR\n` +
    `/funnel    — Content pipeline funnel + conversions\n` +
    `/hooktest  — Hook formula A/B test rankings\n` +
    `/besttime  — Optimal posting time analysis\n` +
    `/export    — Batch export manifest for posting\n` +
    `/weeklyreport — Weekly performance summary\n` +
    `/speakertest — Speaker A/B test rankings\n` +
    `/contentplan — 7-day content filming plan\n` +
    `/filmkit   — Instant filming brief for next video\n` +
    `/progress  — Visual gate progress tracker\n` +
    `/scorecard — Content strategy scorecard\n` +
    `/compare   — A/B compare hooks or speakers\n` +
    `/suggest   — Data-driven content suggestion\n` +
    `/history   — Posting history timeline + trends\n` +
    `/help      — This message`
  );
}

// ─── Sprint 381: /contentplan — 7-day content plan generator ────────

function cmdContentPlan(): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
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

// ─── Sprint 386: /suggest — data-driven content suggestion ──────────

function cmdSuggest(): string {
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

// ─── Sprint 385: /compare — A/B comparison tool ─────────────────────

function cmdCompare(args: string): string {
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

// ─── Sprint 384: /scorecard — content strategy scorecard ────────────

function cmdScorecard(): string {
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

// ─── Sprint 383: /progress — visual gate progress tracker ───────────

function cmdProgress(): string {
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

// ─── Sprint 382: /filmkit — instant filming brief ────────────────────

const HOOK_OPENERS: Record<string, string> = {
  curiosity_gap: '"You won\'t believe what happens when..."',
  contrarian: '"Everyone thinks X, but actually..."',
  authority: '"After 10 years in the industry, here\'s what I know..."',
  secret: '"Nobody talks about this, but..."',
  question: '"Have you ever wondered why...?"',
};

function cmdFilmKit(): string {
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
          await sendMessage(chatId, `✅ *Pipeline refresh complete!*${stats}\n\nUse /deliver to get fresh videos.`);
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
    case '/lastrun':     response = cmdLastRun();            break;
    case '/viral':       response = cmdViral();              break;
    case '/postplan':    response = cmdPostPlan();           break;
    case '/dashboard':   response = cmdDashboard();          break;
    case '/viralstats':  response = cmdViralStats();         break;
    case '/checkout':    await cmdCheckout(chatId, cmdArgs); return;
    case '/subscribers': await cmdSubscribers(chatId); return;
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
    '/help': [
      [{ text: '📋 Digest', callback_data: 'cmd:/digest' }, { text: '📊 Gate', callback_data: 'cmd:/gate' }],
      [{ text: '📦 Deliver', callback_data: 'cmd:/deliver 1' }, { text: '🔄 Refresh', callback_data: 'cmd:/refresh' }],
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

async function poll(): Promise<void> {
  let offset = loadOffset();
  let backoffMs = 1000;

  console.log(`[Bot] Starting Telegram bot — polling for updates (offset: ${offset})`);
  console.log(`[Bot] Owner chat ID: ${OWNER_CHAT_ID}`);

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
