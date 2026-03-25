#!/usr/bin/env ts-node
/**
 * pipeline-watchdog.ts — SCS-001 pipeline staleness detector
 *
 * Checks if scs001-pipeline wrote to publish-ledger.jsonl within the last 4h.
 * If stale, sends a Telegram alert to the owner.
 * Runs silently if pipeline is healthy (no message sent).
 *
 * Run via PM2 cron (kognai-pipeline-watchdog, every 30 min) or manually:
 *   npx ts-node scripts/pipeline-watchdog.ts
 *
 * Dry-run (prints alert to stdout, no Telegram send):
 *   WATCHDOG_DRY_RUN=1 npx ts-node scripts/pipeline-watchdog.ts
 *
 * Env:
 *   CEO_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN  — required (unless dry-run)
 *   OWNER_TELEGRAM_CHAT_ID or CEO_TELEGRAM_CHAT_ID — required (unless dry-run)
 *   WATCHDOG_DRY_RUN=1                             — skip Telegram, print to stdout
 *   STALE_HOURS=4                                  — override stale threshold (default 4)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const ROOT = path.resolve(__dirname, '..');

// ── Env ───────────────────────────────────────────────────────────────────────

const BOT_TOKEN   = process.env.CEO_TELEGRAM_BOT_TOKEN
                 || process.env.TELEGRAM_BOT_TOKEN
                 || '';
const OWNER_ID    = process.env.OWNER_TELEGRAM_CHAT_ID
                 || process.env.CEO_TELEGRAM_CHAT_ID
                 || '';
const DRY_RUN     = process.env.WATCHDOG_DRY_RUN === '1';
const STALE_THRESHOLD_HOURS = parseFloat(process.env.STALE_HOURS ?? '4');

// ── File paths ────────────────────────────────────────────────────────────────

const LEDGER_PATH       = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const MANUAL_POSTS_PATH = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function sendTelegram(chatId: string, text: string): Promise<void> {
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(`Telegram error: ${parsed.description ?? JSON.stringify(parsed)}`));
          } else {
            resolve();
          }
        } catch {
          reject(new Error(`Telegram parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const now = Date.now();

  // Find the most recent published_at in the ledger
  const entries = readLines(LEDGER_PATH);
  let lastPublishedMs = 0;
  if (entries.length > 0) {
    for (const e of entries) {
      if (e.published_at) {
        const t = new Date(e.published_at).getTime();
        if (t > lastPublishedMs) lastPublishedMs = t;
      }
    }
  }

  // Also check file mtime as fallback
  if (lastPublishedMs === 0 && fs.existsSync(LEDGER_PATH)) {
    lastPublishedMs = fs.statSync(LEDGER_PATH).mtimeMs;
  }

  const staleMs = now - lastPublishedMs;
  const staleHours = staleMs / 3_600_000;

  if (staleHours < STALE_THRESHOLD_HOURS) {
    // Pipeline is healthy — exit silently
    process.stdout.write(`[pipeline-watchdog] OK — ledger updated ${staleHours.toFixed(1)}h ago\n`);
    process.exit(0);
  }

  // Pipeline is stale — build alert
  // Sprint 1352: Filter dry-run posts — gate requires real TikTok posts only
  const DRY_METHODS = ['browser-post-dry', 'batch-browser-dry', 'dry'];
  const allManualPosts = readLines(MANUAL_POSTS_PATH);
  const manualPosts = allManualPosts.filter((e: any) =>
    !e.method || !DRY_METHODS.some((d: string) => String(e.method).includes(d)));
  const recordedPosts = manualPosts.length;
  const APR_7 = new Date('2026-04-07T00:00:00Z');
  const daysToGate = Math.ceil((APR_7.getTime() - now) / 86_400_000);

  const lastStr = lastPublishedMs > 0
    ? `${staleHours.toFixed(1)}h ago`
    : 'never';

  const alert = [
    '⚠️ *SCS-001 Pipeline Stale*',
    '',
    `Last ledger entry: *${lastStr}*`,
    `Threshold: ${STALE_THRESHOLD_HOURS}h`,
    '',
    `Gate: ${recordedPosts}/30 posts — ${daysToGate} days to Apr 7`,
    '',
    'Check PM2:',
    '`pm2 logs scs001-pipeline --lines 20`',
    '`pm2 restart scs001-pipeline`',
  ].join('\n');

  process.stdout.write(`[pipeline-watchdog] STALE — ledger ${lastStr} — sending alert\n`);

  if (DRY_RUN) {
    process.stdout.write('\n[DRY RUN] Alert:\n' + alert + '\n');
    process.exit(0);
  }

  if (!BOT_TOKEN || !OWNER_ID) {
    process.stderr.write('[pipeline-watchdog] Missing BOT_TOKEN or OWNER_ID — cannot send alert\n');
    process.exit(1);
  }

  try {
    await sendTelegram(OWNER_ID, alert);
    process.stdout.write('[pipeline-watchdog] Alert sent\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[pipeline-watchdog] Telegram send failed: ${err}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  process.stderr.write(`[pipeline-watchdog] Fatal: ${err}\n`);
  process.exit(1);
});
