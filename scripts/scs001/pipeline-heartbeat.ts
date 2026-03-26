/**
 * pipeline-heartbeat.ts — Sprint 1473
 *
 * Monitors the 15-stage SCS-001 pipeline and alerts via Telegram if no run
 * has completed in STALE_THRESHOLD_H hours (default: 6).
 *
 * Reads: reports/pipeline-runs/latest.json
 * Sends: Telegram alert to OWNER_TELEGRAM_CHAT_ID if stale
 * Logs:  logs/heartbeat/YYYY-MM-DD.jsonl
 *
 * Usage:
 *   npx ts-node scripts/scs001/pipeline-heartbeat.ts           # production
 *   npx ts-node scripts/scs001/pipeline-heartbeat.ts --check   # dry-run (no Telegram)
 *
 * PM2: scs001-heartbeat — cron every 30 min
 */

import * as https from 'https';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

const LATEST_RUN_PATH = join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
const HEARTBEAT_LOG_DIR = join(ROOT, 'logs', 'heartbeat');
const STALE_THRESHOLD_H = Number(process.env.STALE_THRESHOLD_H ?? '6');
const DRY_RUN = process.argv.includes('--check');

function getLogPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(HEARTBEAT_LOG_DIR, `${date}.jsonl`);
}

function logEntry(entry: Record<string, unknown>): void {
  try {
    if (!existsSync(HEARTBEAT_LOG_DIR)) mkdirSync(HEARTBEAT_LOG_DIR, { recursive: true });
    appendFileSync(getLogPath(), JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
  } catch { /* non-fatal */ }
}

function sendTelegram(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      console.log('[heartbeat] TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID not set — skipping send');
      console.log('[heartbeat] Alert:\n' + text);
      resolve();
      return;
    }
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.ok) {
              console.error('[heartbeat] Telegram error:', parsed.description);
              reject(new Error(parsed.description));
            } else {
              resolve();
            }
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  const nowMs = Date.now();
  const tag = DRY_RUN ? '[heartbeat --check]' : '[heartbeat]';

  if (!existsSync(LATEST_RUN_PATH)) {
    console.warn(`${tag} Latest run report not found: ${LATEST_RUN_PATH}`);
    logEntry({ status: 'no-report', threshold_h: STALE_THRESHOLD_H });
    return;
  }

  let lastRun: { run_id?: string; completed_at?: string; started_at?: string };
  try {
    lastRun = JSON.parse(readFileSync(LATEST_RUN_PATH, 'utf-8'));
  } catch (e: any) {
    console.error(`${tag} Failed to parse latest run report: ${e.message}`);
    logEntry({ status: 'parse-error', error: e.message });
    return;
  }

  const completedAt = lastRun.completed_at ?? lastRun.started_at;
  if (!completedAt) {
    console.warn(`${tag} No completed_at in latest run report`);
    logEntry({ status: 'no-timestamp', run_id: lastRun.run_id });
    return;
  }

  const lastRunMs = new Date(completedAt).getTime();
  const ageMs = nowMs - lastRunMs;
  const ageH = ageMs / (1000 * 60 * 60);
  const ageStr = ageH < 1
    ? `${Math.round(ageMs / 60000)}m`
    : `${ageH.toFixed(1)}h`;

  console.log(`${tag} Last run: ${lastRun.run_id ?? '?'} at ${completedAt} (${ageStr} ago)`);
  console.log(`${tag} Threshold: ${STALE_THRESHOLD_H}h — ${ageH >= STALE_THRESHOLD_H ? '⚠️  STALE' : '✓ fresh'}`);

  if (ageH < STALE_THRESHOLD_H) {
    logEntry({ status: 'ok', run_id: lastRun.run_id, age_h: ageH, threshold_h: STALE_THRESHOLD_H });
    return;
  }

  // Stale — alert
  const alertMsg = [
    `⚠️ <b>SCS-001 Pipeline Stale</b>`,
    ``,
    `Last run: <code>${lastRun.run_id ?? 'unknown'}</code>`,
    `Completed: ${completedAt}`,
    `Age: <b>${ageStr}</b> (threshold: ${STALE_THRESHOLD_H}h)`,
    ``,
    `Action: check PM2 logs → <code>pm2 logs scs001-pipeline</code>`,
  ].join('\n');

  logEntry({ status: 'stale', run_id: lastRun.run_id, age_h: ageH, threshold_h: STALE_THRESHOLD_H, alert_sent: !DRY_RUN });

  if (DRY_RUN) {
    console.log(`${tag} DRY RUN — would send:\n${alertMsg}`);
    return;
  }

  try {
    await sendTelegram(alertMsg);
    console.log(`${tag} Alert sent for stale pipeline (${ageStr} since last run)`);
  } catch (e: any) {
    console.error(`${tag} Failed to send Telegram alert: ${e.message}`);
  }
}

main().catch((e) => {
  console.error('[heartbeat] Fatal:', e.message);
  process.exit(1);
});
