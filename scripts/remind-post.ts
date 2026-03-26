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
const DELIVERED_PATH = path.join(ROOT, 'workspace/scs001/auto-delivered.jsonl');
const MANUAL_POSTS_PATH = path.join(ROOT, 'workspace/scs001/manual-posts.jsonl');

function readJsonLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Sprint 1010: pick the top-scored unposted video for the reminder
const DRY_METHODS = ['browser-post-dry', 'batch-browser-dry', 'dry'];
function pickNextVideo(): { video_id: string; topic: string; mp4_path: string } | null {
  const postedIds = new Set<string>();
  readJsonLines(MANUAL_POSTS_PATH).forEach((e: any) => {
    if (!e.video_id) return;
    if (e.method && DRY_METHODS.some(d => String(e.method).includes(d))) return;
    postedIds.add(e.video_id);
  });
  const candidates = readJsonLines(DELIVERED_PATH)
    .filter((e: any) => e.video_id && !postedIds.has(e.video_id) && e.mp4_path && fs.existsSync(e.mp4_path))
    .sort((a: any, b: any) => (b.viral_score ?? 0) - (a.viral_score ?? 0));
  if (!candidates.length) return null;
  const top = candidates[0];
  return { video_id: top.video_id, topic: (top.topic ?? top.hook_formula ?? ''), mp4_path: top.mp4_path };
}

// Sprint 1018: send mp4 file to Telegram
function sendVideoFile(videoPath: string, caption: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return Promise.resolve();
  const boundary = '----RmdBoundary' + Date.now().toString(16);
  const fileData = fs.readFileSync(videoPath);
  const filename = path.basename(videoPath);
  const parts: Buffer[] = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  const body = Buffer.concat(parts);
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendVideo`,
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
        timeout: 120_000,
      },
      (res) => { res.resume(); resolve(); }
    );
    req.on('error', (e) => { console.error('[remind] video send error:', e.message); resolve(); });
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

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
  const next = pickNextVideo();
  const nextLine = next
    ? `\n\n*Next up:* \`${next.video_id}\`${next.topic ? `\n📝 ${next.topic.slice(0, 60)}` : ''}\n_Video below ↓ — after posting: \`/record ${next.video_id} 0\`_`
    : '\n\n_No unposted video found — run /postnext to check_';
  const msg = `${urgency} *Posting Reminder* — ${postsRemaining} videos still needed by ${deadline} (${daysRemaining}d left)\n\nDone so far: ${postsDone}/30${nextLine}`;

  sendTelegram(msg);

  // Sprint 1018: also send the mp4 file so operator can post directly from phone
  if (next?.mp4_path) {
    sendVideoFile(next.mp4_path, `/record ${next.video_id} 0 <tiktok_url>`).catch(() => {});  // Sprint 1382
  }

  console.log(`[remind] sent — ${postsRemaining} remaining, ${daysRemaining}d left`);
}

main();
