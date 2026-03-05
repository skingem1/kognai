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

  return (
    `${statusIcon} *Invoica System Report*\n${now}\n${alertBlock}\n` +
    `*PM2* (${online}/${procs.length} live):\n${pm2Lines || '  (no data)'}\n\n` +
    `*Status:* \`${healthStatus}\` | Phase: ${phase} | Day ${day}\n` +
    `Last heartbeat: ${lastBeat} UTC\n\n` +
    `*Beta:* agents_onboarded=${beta.agents_onboarded ?? 0}, companies=${beta.companies_onboarded ?? 0}, txns=${beta.transactions_monitored ?? 0}\n` +
    `*Financials:* MRR $${mrr} | Tier: ${tier} | Billing activation: ${billingDate}\n\n` +
    `*Sprint:* ${sprintLine}`
  );
}

function cmdHelp(): string {
  return (
    `*Invoica Bot Commands*\n\n` +
    `/report — Full system status (real data, no AI)\n` +
    `/pm2    — Live PM2 process table\n` +
    `/health — Health check summary\n` +
    `/tier   — Current tier + MRR\n` +
    `/sprint — Latest sprint progress\n` +
    `/help   — This message`
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

  let response: string;
  switch (cmd) {
    case '/report': response = cmdReport(); break;
    case '/pm2':    response = cmdPm2();    break;
    case '/health': response = cmdHealth(); break;
    case '/tier':   response = cmdTier();   break;
    case '/sprint': response = cmdSprint(); break;
    case '/help':   response = cmdHelp();   break;
    default:
      response = `Unknown command: \`${cmd}\`\n\n${cmdHelp()}`;
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
