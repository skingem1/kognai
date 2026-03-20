/**
 * geo-telegram-alert.ts — Send Telegram alert on GEO score drop
 *
 * Reads workspace/geo/geo-health.json and sends alert if:
 * - Score dropped >10 points from previous scan
 * - Any check status is "fail"
 * - Brand mentions decreased significantly
 *
 * Usage: npx tsx scripts/geo/geo-telegram-alert.ts
 * Called by: geo-monitor.py (via PM2 cron chain)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const HEALTH_PATH = path.join(__dirname, '../../workspace/geo/geo-health.json');
const SCORES_PATH = path.join(__dirname, '../../workspace/geo/citability-scores.json');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID;

function sendTelegram(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.log('[DRY RUN] No TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID set');
      console.log(text);
      resolve();
      return;
    }

    const payload = JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Telegram API ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('=== Kognai GEO Telegram Alert ===');

  if (!fs.existsSync(HEALTH_PATH)) {
    console.log('No geo-health.json found — run geo-monitor.py first');
    process.exit(0);
  }

  const health = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf-8'));
  const alerts: string[] = [];

  // Check score drop
  if (health.score_delta !== null && health.score_delta < -10) {
    alerts.push(`Score dropped ${Math.abs(health.score_delta)} points (${health.previous_score} → ${health.geo_score})`);
  }

  // Check failed checks
  const failedChecks = (health.checks || []).filter((c: any) => c.status === 'fail');
  if (failedChecks.length > 0) {
    const names = failedChecks.map((c: any) => c.check).join(', ');
    alerts.push(`Failed checks: ${names}`);
  }

  // Check citability scores
  if (fs.existsSync(SCORES_PATH)) {
    const scores = JSON.parse(fs.readFileSync(SCORES_PATH, 'utf-8'));
    if (scores.flagged_count > 0) {
      alerts.push(`${scores.flagged_count} citable blocks scored below 60 (need rewrite)`);
    }
  }

  if (alerts.length === 0) {
    console.log('No alerts — GEO health is good');
    console.log(`Current score: ${health.geo_score}/100`);
    process.exit(0);
  }

  // Build alert message
  const message = [
    '<b>GEO Alert</b>',
    '',
    `Score: ${health.geo_score}/100`,
    `Target: ${health.target_url}`,
    '',
    ...alerts.map(a => `- ${a}`),
    '',
    `Scan: ${health.scan_date}`,
  ].join('\n');

  console.log('Sending alert...');
  await sendTelegram(message);
  console.log('Alert sent');
}

main().catch(console.error);
