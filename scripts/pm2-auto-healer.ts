/**
 * pm2-auto-healer.ts — Sprint 437
 * Hourly PM2 cron that checks essential processes and restarts any that are stopped/errored.
 * Sends a Telegram alert when processes are restarted.
 *
 * Usage: npx ts-node scripts/pm2-auto-healer.ts
 * PM2: kognai-auto-healer (0 * * * * — every hour)
 */

import { execSync } from 'child_process';
import * as https from 'https';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const BOT_TOKEN = process.env.CEO_TELEGRAM_BOT_TOKEN
              || process.env.TELEGRAM_BOT_TOKEN
              || '';
const OWNER_ID  = process.env.OWNER_TELEGRAM_CHAT_ID
              || process.env.CEO_TELEGRAM_CHAT_ID
              || '';
const ROOT = process.cwd();

// Essential cron processes that should always be running
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
  'kognai-auto-deliver-morning',
  'kognai-auto-deliver-noon',
  'kognai-auto-deliver-evening',
  'kognai-view-tracker',
  'kognai-watchdog',
];

// Always-on daemon processes (should be online, not just registered)
const ESSENTIAL_DAEMONS = [
  'telegram-bot',
  'kognai-stripe-webhook',
];

interface Pm2Process {
  name: string;
  pm2_env: {
    status: string;
    restart_time: number;
  };
}

function getPm2List(): Pm2Process[] {
  try {
    const raw = execSync('pm2 jlist', { timeout: 10000, encoding: 'utf-8' });
    return JSON.parse(raw) as Pm2Process[];
  } catch {
    return [];
  }
}

function sendTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN || !OWNER_ID) return Promise.resolve();
  const payload = JSON.stringify({ chat_id: OWNER_ID, text, parse_mode: 'Markdown' });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, () => resolve());
    req.on('error', () => resolve());
    req.setTimeout(10000, () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

async function main(): Promise<void> {
  const procs = getPm2List();
  if (procs.length === 0) {
    process.stderr.write('[auto-healer] PM2 list empty — pm2 may not be running\n');
    return;
  }

  const procMap = new Map<string, string>();
  for (const p of procs) {
    procMap.set(p.name, p.pm2_env?.status ?? 'unknown');
  }

  const restarted: string[] = [];
  const notRegistered: string[] = [];
  const failed: string[] = [];

  // Check and restart crons that should be registered but are stopped/errored
  for (const name of ESSENTIAL_CRONS) {
    const status = procMap.get(name);
    if (!status) {
      // Not registered in PM2 — need to start from ecosystem
      try {
        execSync(`pm2 start ecosystem.config.js --only ${name}`, { cwd: ROOT, timeout: 15000, stdio: 'pipe' });
        restarted.push(name);
        process.stdout.write(`[auto-healer] Started (not registered): ${name}\n`);
      } catch {
        notRegistered.push(name);
      }
    } else if (status === 'errored') {
      try {
        execSync(`pm2 restart ${name}`, { timeout: 10000, stdio: 'pipe' });
        restarted.push(name);
        process.stdout.write(`[auto-healer] Restarted (errored): ${name}\n`);
      } catch {
        failed.push(name);
      }
    }
    // 'stopped' is normal for cron processes (they exit after running)
    // 'online' is fine
  }

  // Check daemons — these should always be online
  for (const name of ESSENTIAL_DAEMONS) {
    const status = procMap.get(name);
    if (status === 'errored' || status === 'stopped') {
      try {
        execSync(`pm2 restart ${name}`, { timeout: 10000, stdio: 'pipe' });
        restarted.push(name);
        process.stdout.write(`[auto-healer] Restarted daemon: ${name} (was ${status})\n`);
      } catch {
        failed.push(name);
      }
    }
  }

  // Only send Telegram alert if something was restarted or failed
  if (restarted.length > 0 || failed.length > 0) {
    const lines = ['🔧 *Auto-Healer Report*', ''];
    if (restarted.length > 0) {
      lines.push(`✅ *Restarted (${restarted.length}):*`);
      for (const n of restarted) lines.push(`  🔄 ${n}`);
    }
    if (failed.length > 0) {
      lines.push(`❌ *Failed to restart (${failed.length}):*`);
      for (const n of failed) lines.push(`  🔴 ${n}`);
    }
    if (notRegistered.length > 0) {
      lines.push(`⚠️ *Not in PM2 (${notRegistered.length}):*`);
      for (const n of notRegistered) lines.push(`  ❓ ${n}`);
    }
    await sendTelegram(lines.join('\n'));
  } else {
    process.stdout.write(`[auto-healer] All ${ESSENTIAL_CRONS.length + ESSENTIAL_DAEMONS.length} processes healthy\n`);
  }
}

main().catch(e => { process.stderr.write(`[auto-healer] Error: ${e.message}\n`); process.exit(1); });
