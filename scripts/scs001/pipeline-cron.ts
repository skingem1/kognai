/**
 * pipeline-cron.ts — Sprint 532
 * PM2 cron wrapper: runs pipeline → auto-deliver → log metrics.
 * Designed for 4x/day (06:00, 10:00, 14:00, 18:00).
 *
 * Usage: npx ts-node scripts/scs001/pipeline-cron.ts [--limit N]
 */

import { execSync } from 'child_process';
import { join } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID;

function getLimit(): number {
  const idx = process.argv.indexOf('--limit');
  if (idx >= 0 && process.argv[idx + 1]) return parseInt(process.argv[idx + 1], 10) || 3;
  return 3;
}

function sendTelegram(message: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return Promise.resolve();
  const payload = JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', () => resolve());
    req.write(payload);
    req.end();
  });
}

function run(cmd: string, label: string, timeout = 600000): boolean {
  console.log(`[pipeline-cron] ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', timeout });
    console.log(`[pipeline-cron] ${label} — OK`);
    return true;
  } catch (e: any) {
    console.log(`[pipeline-cron] ${label} — FAILED (exit ${e.status || 'unknown'})`);
    return false;
  }
}

async function main() {
  const limit = getLimit();
  const now = new Date().toISOString();
  console.log(`[pipeline-cron] Starting at ${now} (limit: ${limit})`);

  // Step 1: Run pipeline
  const pipelineOk = run(
    `npx ts-node scripts/scs001/run-full-pipeline.ts --mock --limit ${limit}`,
    `Pipeline (${limit} videos)`,
    600000 // 10min
  );

  if (!pipelineOk) {
    await sendTelegram(`🚨 *Pipeline Cron FAILED*\nTime: ${now}\nLimit: ${limit}`);
    process.exit(1);
    return;
  }

  // Step 2: Auto-deliver
  const deliverOk = run(
    `npx ts-node scripts/scs001/posting-auto-deliver.ts --batch ${limit}`,
    `Auto-deliver (${limit} videos)`,
    120000 // 2min
  );

  // Step 3: Log metrics
  run(
    'npx ts-node scripts/scs001/log-pipeline-metrics.ts',
    'Metrics logging',
    30000
  );

  // Step 4: Cleanup old runs (keep last 5)
  run(
    'npx ts-node scripts/scs001/pipeline-cleanup.ts --keep 5',
    'Disk cleanup',
    30000
  );

  // Step 5: Notify
  const status = pipelineOk && deliverOk ? 'OK' : 'PARTIAL';
  await sendTelegram(
    `📊 *Pipeline Cron ${status}*\n` +
    `Videos: ${limit}\n` +
    `Pipeline: ${pipelineOk ? '✅' : '❌'}\n` +
    `Deliver: ${deliverOk ? '✅' : '❌'}\n` +
    `Time: ${now}`
  );

  console.log(`[pipeline-cron] Done — ${status}`);
}

main().catch(e => { console.error(e); process.exit(1); });
