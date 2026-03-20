/**
 * smoke-test-cron.ts — Sprint 530
 * Wrapper for smoke-test-full.ts that sends Telegram alert on failure.
 * Designed for PM2 cron (every 6h).
 *
 * Usage: npx ts-node scripts/smoke-test-cron.ts
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..');

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID;

function sendTelegramAlert(message: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[alert] TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID not set — skipping alert');
    return Promise.resolve();
  }

  const payload = JSON.stringify({
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'Markdown',
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', () => resolve());
    req.write(payload);
    req.end();
  });
}

async function main() {
  const now = new Date().toISOString();
  console.log(`[smoke-cron] Starting smoke test at ${now}`);

  let exitCode = 0;
  try {
    execSync('npx ts-node scripts/smoke-test-full.ts', {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 120000, // 2min max
    });
  } catch (e: any) {
    exitCode = e.status || 1;
  }

  // Read the report
  const reportPath = join(ROOT, 'reports', 'smoke-test-latest.json');
  if (!existsSync(reportPath)) {
    console.log('[smoke-cron] No report generated — smoke test may have crashed');
    await sendTelegramAlert(`🚨 *Kognai Smoke Test CRASHED*\n\nNo report file generated.\nTime: ${now}`);
    process.exit(1);
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

  if (report.fail > 0) {
    const failedTests = (report.results || [])
      .filter((r: any) => r.status === 'FAIL')
      .map((r: any) => `  - ${r.name}: ${r.detail}`)
      .join('\n');

    const msg = `🚨 *Kognai Smoke Test FAILED*\n\n` +
      `✅ ${report.pass} | ❌ ${report.fail} | ⏭️ ${report.skip}\n\n` +
      `Failed:\n${failedTests}\n\n` +
      `Time: ${report.timestamp}`;

    console.log('[smoke-cron] FAIL — sending Telegram alert');
    await sendTelegramAlert(msg);
  } else {
    console.log(`[smoke-cron] PASS — ${report.pass} checks passed, ${report.skip} skipped`);
  }

  process.exit(exitCode);
}

main().catch(e => { console.error(e); process.exit(1); });
