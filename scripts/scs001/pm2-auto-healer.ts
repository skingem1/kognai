/**
 * Sprint 1003: PM2 Process Auto-Healer
 * Detects errored or unstable PM2 processes and restarts them.
 * Sends Telegram alert listing restarted processes.
 * Writes state to logs/healer-state.json.
 *
 * Failure criteria: status=errored OR unstable_restarts>=3
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');
const STATE_PATH = path.join(ROOT, 'logs/healer-state.json');
const UNSTABLE_THRESHOLD = parseInt(process.env.HEALER_UNSTABLE_THRESHOLD ?? '3', 10);

// Never restart the healer itself to avoid loops
const SKIP_NAMES = new Set(['scs001-healer']);

interface PM2Process {
  name: string;
  pm2_env?: {
    status?: string;
    unstable_restarts?: number;
    restart_time?: number;
    pm_id?: number;
  };
}

interface HealerState {
  timestamp: string;
  checked: number;
  restarted: { name: string; reason: string }[];
  errors: string[];
}

function getPM2List(): PM2Process[] {
  try {
    const out = execSync('pm2 jlist', { timeout: 10000, encoding: 'utf8' });
    return JSON.parse(out) as PM2Process[];
  } catch (e: any) {
    console.error('[healer] pm2 jlist failed:', e.message);
    return [];
  }
}

function restartProcess(name: string): boolean {
  try {
    execSync(`pm2 restart "${name}"`, { timeout: 15000, encoding: 'utf8' });
    return true;
  } catch (e: any) {
    console.error(`[healer] failed to restart ${name}:`, e.message);
    return false;
  }
}

function sendTelegram(message: string): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  const req = https.request(
    {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    },
    (res) => { res.resume(); }
  );
  req.on('error', () => {});
  req.write(body);
  req.end();
}

function main(): void {
  const processes = getPM2List();
  const state: HealerState = {
    timestamp: new Date().toISOString(),
    checked: processes.length,
    restarted: [],
    errors: [],
  };

  for (const proc of processes) {
    if (SKIP_NAMES.has(proc.name)) continue;

    const env = proc.pm2_env ?? {};
    const isErrored = env.status === 'errored';
    const isUnstable = (env.unstable_restarts ?? 0) >= UNSTABLE_THRESHOLD;

    if (!isErrored && !isUnstable) continue;

    const reason = isErrored
      ? `status=errored`
      : `unstable_restarts=${env.unstable_restarts}`;

    console.log(`[healer] restarting ${proc.name} — ${reason}`);
    const ok = restartProcess(proc.name);
    if (ok) {
      state.restarted.push({ name: proc.name, reason });
    } else {
      state.errors.push(`restart failed: ${proc.name}`);
    }
  }

  // Write state log
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e: any) {
    console.error('[healer] failed to write state:', e.message);
  }

  console.log(`[healer] checked=${state.checked} restarted=${state.restarted.length} errors=${state.errors.length}`);

  // Telegram alert on any restarts
  if (state.restarted.length > 0) {
    const lines = state.restarted.map(r => `• \`${r.name}\`: ${r.reason}`);
    const msg = `🔧 *PM2 Auto-Healer* — restarted ${state.restarted.length} process(es)\n\n${lines.join('\n')}`;
    sendTelegram(msg);
    console.log('[healer] Telegram alert sent');
  }
}

main();
