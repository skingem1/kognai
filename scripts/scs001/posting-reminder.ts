/**
 * posting-reminder.ts — Sprint 832
 *
 * PM2 cron: reads posting-schedule.json and sends the operator their
 * next video to post with caption and file attached.
 *
 * Runs every 30 min. If the current time is within 30 min of a scheduled
 * slot, sends the video for that slot. Tracks sent reminders to avoid dupes.
 *
 * Usage:
 *   npx ts-node scripts/scs001/posting-reminder.ts
 *
 * PM2:
 *   kognai-posting-reminder (every 30 min cron)
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const BOT_TOKEN = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';
const SCHEDULE_PATH = join(ROOT, 'reports', 'posting-schedule.json');
const SENT_LOG = join(ROOT, 'logs', 'posting-reminders-sent.jsonl');
const MANUAL_POSTS = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

if (!BOT_TOKEN || !CHAT_ID) {
  console.log('[posting-reminder] Missing TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID');
  process.exit(0);
}

function readJsonLines(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function sendMessage(text: string): Promise<void> {
  const payload = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

function sendVideo(videoPath: string, caption: string): Promise<void> {
  const { readFileSync: readFs } = require('fs');
  const boundary = '----TgBotBoundary' + Date.now();
  const fileName = basename(videoPath);
  const videoData = readFs(videoPath);

  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${CHAT_ID}\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="video"; filename="${fileName}"\r\n`;
  body += `Content-Type: video/mp4\r\n\r\n`;

  const ending = `\r\n--${boundary}--\r\n`;
  const bodyStart = Buffer.from(body, 'utf-8');
  const bodyEnd = Buffer.from(ending, 'utf-8');
  const fullBody = Buffer.concat([bodyStart, videoData, bodyEnd]);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Video upload timeout')); });
    req.write(fullBody);
    req.end();
  });
}

function findVideoPath(videoId: string): string | null {
  // Check ledger for video_path
  const ledger = readJsonLines(join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  for (const e of ledger) {
    if (e.video_id === videoId && e.video_path && existsSync(e.video_path)) {
      return e.video_path;
    }
  }
  // Check delivered log
  const delivered = readJsonLines(join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl'));
  for (const e of delivered) {
    if (e.video_id === videoId && e.mp4_path && existsSync(e.mp4_path)) {
      return e.mp4_path;
    }
  }
  return null;
}

function buildCaption(videoId: string, topic?: string): string {
  const lines: string[] = [];
  if (topic) lines.push(topic);
  lines.push('#ai #tech #viral #shorts');
  lines.push('');
  lines.push(`After posting: /record ${videoId} 0 <tiktok_url>`);  // Sprint 1380
  return lines.join('\n');
}

async function main() {
  if (!existsSync(SCHEDULE_PATH)) {
    console.log('[posting-reminder] No schedule found. Run posting-schedule.ts first.');
    return;
  }

  const schedule = JSON.parse(readFileSync(SCHEDULE_PATH, 'utf-8'));
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  // Find today's entry in schedule
  const todayEntry = (schedule.schedule || []).find((s: any) => s.date === today);
  if (!todayEntry) {
    console.log(`[posting-reminder] No slots scheduled for today (${today}).`);
    return;
  }

  // Check which slots are due (within 30 min window before posting time)
  const sentReminders = new Set(
    readJsonLines(SENT_LOG).map((e: any) => `${e.date}_${e.time}_${e.video_id}`)
  );

  for (const slot of todayEntry.slots) {
    if (!slot.video_id) continue;

    const [slotHour, slotMin] = slot.time.split(':').map(Number);
    const slotMinutes = slotHour * 60 + slotMin;
    const nowMinutes = currentHour * 60 + currentMin;

    // Send reminder 30 min before to 5 min after the slot time
    if (nowMinutes < slotMinutes - 30 || nowMinutes > slotMinutes + 5) continue;

    const key = `${today}_${slot.time}_${slot.video_id}`;
    if (sentReminders.has(key)) {
      console.log(`[posting-reminder] Already sent reminder for ${slot.video_id} at ${slot.time}`);
      continue;
    }

    // Find the video
    const videoPath = findVideoPath(slot.video_id);
    const posted = readJsonLines(MANUAL_POSTS);
    const gateCount = posted.length;
    const remaining = Math.max(0, 30 - gateCount);

    const caption = [
      `🎯 *Scheduled Post — ${slot.time}*`,
      '',
      slot.topic ? `📝 ${slot.topic}` : '',
      `🆔 \`${slot.video_id}\``,
      slot.viral_score > 0 ? `🧬 Score: ${slot.viral_score.toFixed(2)}` : '',
      '',
      `📊 Gate: ${gateCount}/30 · ${remaining} remaining`,
      '',
      `After posting: \`/record ${slot.video_id} 0\``,
    ].filter(Boolean).join('\n');

    try {
      if (videoPath) {
        console.log(`[posting-reminder] Sending video: ${slot.video_id} (${slot.time})`);
        await sendVideo(videoPath, caption);
      } else {
        console.log(`[posting-reminder] No MP4 for ${slot.video_id}, sending text only`);
        await sendMessage(caption + '\n\n⚠️ _Video file not found — use /deliver to get it_');
      }

      // Log sent reminder
      mkdirSync(join(ROOT, 'logs'), { recursive: true });
      appendFileSync(SENT_LOG, JSON.stringify({
        date: today,
        time: slot.time,
        video_id: slot.video_id,
        video_sent: !!videoPath,
        sent_at: now.toISOString(),
      }) + '\n');

      console.log(`[posting-reminder] ✅ Reminder sent for ${slot.video_id}`);
    } catch (err: any) {
      console.error(`[posting-reminder] ❌ Failed to send: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('[posting-reminder] Fatal:', err.message);
  process.exit(1);
});
