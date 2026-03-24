/**
 * Sprint 1006: Posting Time Reminder
 * Reads gate status and sends Telegram reminder to post a video.
 * Run via PM2 cron — noon and 7pm daily.
 * Silently exits if gate already met.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const ROOT = path.resolve(__dirname, '..');
const GATE_PATH = path.join(ROOT, 'workspace/gates/phase1-5-gate.json');

function sendTelegram(text: string): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[remind] No Telegram credentials — message:', text);
    return;
  }
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  const req = https.request(
    {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    },
    (res) => { res.resume(); }
  );
  req.on('error', (e) => console.error('[remind] Telegram error:', e.message));
  req.write(body);
  req.end();
}

function main(): void {
  try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch {}

  let gate: any = {};
  try {
    gate = JSON.parse(fs.readFileSync(GATE_PATH, 'utf8'));
  } catch {
    console.log('[remind] Gate file not found — skipping');
    return;
  }

  const raw = gate.raw ?? {};
  const postsRemaining: number = raw.posts_remaining ?? 0;
  const deadline: string = gate.deadline ?? 'Apr 7';
  const daysRemaining: number = gate.days_remaining ?? 0;
  const postsDone: number = raw.posts_count ?? 0;

  // Gate met — no reminder needed
  if (postsRemaining <= 0) {
    console.log('[remind] Gate met — no reminder needed');
    return;
  }

  const urgency = daysRemaining <= 3 ? '🚨' : daysRemaining <= 7 ? '⚠️' : '⏰';
  const msg = `${urgency} *Posting Reminder* — ${postsRemaining} videos still needed by ${deadline} (${daysRemaining}d left)\n\nDone so far: ${postsDone}/30\nPost one now to stay on track.`;

  sendTelegram(msg);
  console.log(`[remind] sent — ${postsRemaining} remaining, ${daysRemaining}d left`);
}

main();
