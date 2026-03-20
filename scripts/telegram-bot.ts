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
  const res = await telegramRequest('getUpdates', { timeout: 30, offset, allowed_updates: ['message'] });
  return res.ok ? (res.result || []) : [];
}

async function sendMessage(chatId: string, text: string): Promise<void> {
  await telegramRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
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

function cmdHelp(): string {
  return (
    `*Kognai Bot Commands*\n\n` +
    `/report    — Full system status (real data, no AI)\n` +
    `/pm2       — Live PM2 process table\n` +
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
    `/today     — Daily posting brief + recommendations\n` +
    `/calendar  — 7-day content posting plan\n` +
    `/help      — This message`
  );
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
    case '/queue':   response = cmdQueue();  break;
    case '/review':  response = cmdReview(); break;
    case '/caption': response = cmdCaption(cmdArgs); break;
    case '/streak':    response = cmdStreak(); break;
    case '/analytics': response = cmdAnalytics(); break;
    case '/onboard':   response = cmdOnboard(); break;
    case '/pipeline':  response = cmdPipeline(); break;
    case '/today':     response = cmdToday();  break;
    case '/calendar':  response = cmdCalendar(); break;
    case '/help':      response = cmdHelp();   break;
    default:
      response = `Unknown command: \`${cmdName}\`\n\n${cmdHelp()}`;
  }

  try {
    await sendMessage(chatId, response);
  } catch (e: any) {
    // If message is too long, truncate and retry
    if (response.length > 4000) {
      await sendMessage(chatId, response.slice(0, 3900) + '\n\n_(truncated)_');
    } else {
      throw e;
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
