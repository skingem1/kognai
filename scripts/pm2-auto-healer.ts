/**
 * pm2-auto-healer.ts — Sprint 437, enhanced Sprint 676
 * Hourly PM2 cron that checks essential processes.
 * Tracks consecutive failures — only restarts after 3+ consecutive errors.
 * Sends a Telegram alert when processes are restarted or persistently failing.
 *
 * Usage: npx ts-node scripts/pm2-auto-healer.ts
 * PM2: kognai-auto-healer (0 * * * * — every hour)
 */

import { execSync } from 'child_process';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const BOT_TOKEN = process.env.CEO_TELEGRAM_BOT_TOKEN
              || process.env.TELEGRAM_BOT_TOKEN
              || '';
const OWNER_ID  = process.env.OWNER_TELEGRAM_CHAT_ID
              || process.env.CEO_TELEGRAM_CHAT_ID
              || '';
const ROOT = process.cwd();
const FAILURE_LOG = path.join(ROOT, 'workspace', 'scs001', 'healer-failures.json');
const FAILURE_THRESHOLD = parseInt(process.env.HEALER_THRESHOLD || '3', 10);

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

interface FailureRecord {
  [name: string]: {
    consecutive: number;
    last_seen: string;
    last_restart?: string;
    total_restarts: number;
  };
}

function loadFailures(): FailureRecord {
  try {
    if (fs.existsSync(FAILURE_LOG)) {
      return JSON.parse(fs.readFileSync(FAILURE_LOG, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveFailures(record: FailureRecord): void {
  fs.writeFileSync(FAILURE_LOG, JSON.stringify(record, null, 2), 'utf-8');
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

function recordFailure(failures: FailureRecord, name: string): number {
  if (!failures[name]) {
    failures[name] = { consecutive: 0, last_seen: '', total_restarts: 0 };
  }
  failures[name].consecutive++;
  failures[name].last_seen = new Date().toISOString();
  return failures[name].consecutive;
}

function clearFailure(failures: FailureRecord, name: string): void {
  if (failures[name]) {
    failures[name].consecutive = 0;
  }
}

function recordRestart(failures: FailureRecord, name: string): void {
  if (!failures[name]) {
    failures[name] = { consecutive: 0, last_seen: '', total_restarts: 0 };
  }
  failures[name].consecutive = 0;
  failures[name].last_restart = new Date().toISOString();
  failures[name].total_restarts++;
}

async function main(): Promise<void> {
  const procs = getPm2List();
  if (procs.length === 0) {
    process.stderr.write('[auto-healer] PM2 list empty — pm2 may not be running\n');
    return;
  }

  const failures = loadFailures();
  const procMap = new Map<string, string>();
  for (const p of procs) {
    procMap.set(p.name, p.pm2_env?.status ?? 'unknown');
  }

  const restarted: string[] = [];
  const tracking: string[] = [];
  const notRegistered: string[] = [];
  const failed: string[] = [];

  // Check crons
  for (const name of ESSENTIAL_CRONS) {
    const status = procMap.get(name);
    if (!status) {
      const count = recordFailure(failures, name);
      if (count >= FAILURE_THRESHOLD) {
        try {
          execSync(`pm2 start ecosystem.config.js --only ${name}`, { cwd: ROOT, timeout: 15000, stdio: 'pipe' });
          restarted.push(name);
          recordRestart(failures, name);
          process.stdout.write(`[auto-healer] Started (${count} failures): ${name}\n`);
        } catch {
          notRegistered.push(name);
        }
      } else {
        tracking.push(`${name} (${count}/${FAILURE_THRESHOLD})`);
      }
    } else if (status === 'errored') {
      const count = recordFailure(failures, name);
      if (count >= FAILURE_THRESHOLD) {
        try {
          execSync(`pm2 restart ${name}`, { timeout: 10000, stdio: 'pipe' });
          restarted.push(name);
          recordRestart(failures, name);
          process.stdout.write(`[auto-healer] Restarted (${count} failures): ${name}\n`);
        } catch {
          failed.push(name);
        }
      } else {
        tracking.push(`${name} (${count}/${FAILURE_THRESHOLD})`);
      }
    } else {
      // Healthy — clear failure count
      clearFailure(failures, name);
    }
    // 'stopped' is normal for cron processes (they exit after running)
  }

  // Check daemons — these should always be online, restart after threshold too
  for (const name of ESSENTIAL_DAEMONS) {
    const status = procMap.get(name);
    if (status === 'errored' || status === 'stopped') {
      const count = recordFailure(failures, name);
      if (count >= FAILURE_THRESHOLD) {
        try {
          execSync(`pm2 restart ${name}`, { timeout: 10000, stdio: 'pipe' });
          restarted.push(name);
          recordRestart(failures, name);
          process.stdout.write(`[auto-healer] Restarted daemon (${count} failures): ${name}\n`);
        } catch {
          failed.push(name);
        }
      } else {
        tracking.push(`${name} (${count}/${FAILURE_THRESHOLD})`);
      }
    } else {
      clearFailure(failures, name);
    }
  }

  saveFailures(failures);

  // Only send Telegram alert if something was restarted, failed, or being tracked
  if (restarted.length > 0 || failed.length > 0) {
    const lines = [`🔧 *Auto-Healer Report* (threshold: ${FAILURE_THRESHOLD})`, ''];
    if (restarted.length > 0) {
      lines.push(`✅ *Restarted (${restarted.length}):*`);
      for (const n of restarted) lines.push(`  🔄 ${n}`);
    }
    if (failed.length > 0) {
      lines.push(`❌ *Failed to restart (${failed.length}):*`);
      for (const n of failed) lines.push(`  🔴 ${n}`);
    }
    if (tracking.length > 0) {
      lines.push(`⏳ *Tracking (not yet threshold):*`);
      for (const n of tracking) lines.push(`  ⚠️ ${n}`);
    }
    if (notRegistered.length > 0) {
      lines.push(`❓ *Not in PM2 (${notRegistered.length}):*`);
      for (const n of notRegistered) lines.push(`  ${n}`);
    }
    await sendTelegram(lines.join('\n'));
  } else {
    const total = ESSENTIAL_CRONS.length + ESSENTIAL_DAEMONS.length;
    process.stdout.write(`[auto-healer] All ${total} processes healthy (threshold: ${FAILURE_THRESHOLD})\n`);
  }
}

export { main as autoHealer };

main().catch(e => { process.stderr.write(`[auto-healer] Error: ${e.message}\n`); process.exit(1); });
