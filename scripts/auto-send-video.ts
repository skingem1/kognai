#!/usr/bin/env ts-node
// §17 Compliance: EXEMPT — zero LLM calls. No routeCall() needed.
// auto-send-video.ts — PM2 cron: delivers next ready captioned video to owner via Telegram
// Cron: 30 7,17 * * *  (07:30 + 17:30 UTC every day)
// Env required: TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_CHAT_ID

import * as https  from 'https';
import * as fs     from 'fs';
import * as path   from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN      || '';
const OWNER_CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID  || '';
const CWD           = process.cwd();
const SCS_DIR       = path.join(CWD, 'workspace', 'scs001');
const LEDGER_PATH   = path.join(SCS_DIR, 'publish-ledger.jsonl');
const SENT_PATH     = path.join(SCS_DIR, 'telegram-sent.jsonl');
const TOPICS_PATH   = path.join(SCS_DIR, 'viral-topics.json');

// ── Telegram helpers (self-contained, no bot.ts import) ──────────────────────

function tgSendMessage(chatId: string, text: string): Promise<void> {
  const payload = JSON.stringify({
    chat_id: chatId, text,
    parse_mode: 'Markdown', disable_web_page_preview: true,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 35_000 },
      (res) => { let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve()); }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('tgSendMessage timeout')); });
    req.write(payload); req.end();
  });
}

function tgSendVideo(chatId: string, videoPath: string, caption: string): Promise<void> {
  const boundary = '----TgAutoSend' + Date.now().toString(16);
  const filename  = path.basename(videoPath);
  const fileData  = fs.readFileSync(videoPath);

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`));
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`
  ));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendVideo`, method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
        timeout: 180_000 },
      (res) => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => {
          try {
            const r = JSON.parse(d) as { ok: boolean; description?: string };
            if (!r.ok) reject(new Error(`sendVideo failed: ${r.description ?? d.slice(0, 200)}`));
            else resolve();
          } catch { reject(new Error(`sendVideo parse error: ${d.slice(0, 200)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('tgSendVideo timeout (180s)')); });
    req.write(body); req.end();
  });
}

function tgSendVideoWithButtons(chatId: string, videoPath: string, caption: string, buttons: Array<Array<{ text: string; callback_data: string }>>): Promise<void> {
  const boundary = '----TgAutoSend' + Date.now().toString(16);
  const filename  = path.basename(videoPath);
  const fileData  = fs.readFileSync(videoPath);
  const replyMarkup = JSON.stringify({ inline_keyboard: buttons });

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reply_markup"\r\n\r\n${replyMarkup}\r\n`));
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`
  ));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendVideo`, method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
        timeout: 180_000 },
      (res) => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => {
          try {
            const r = JSON.parse(d) as { ok: boolean; description?: string };
            if (!r.ok) reject(new Error(`sendVideoWithButtons failed: ${r.description ?? d.slice(0, 200)}`));
            else resolve();
          } catch { reject(new Error(`sendVideoWithButtons parse error: ${d.slice(0, 200)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('tgSendVideoWithButtons timeout (180s)')); });
    req.write(body); req.end();
  });
}

// ── Disk helpers ──────────────────────────────────────────────────────────────

function findCaptionedMp4(videoId: string): string | null {
  try {
    const runDirs = fs.readdirSync(SCS_DIR).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = path.join(SCS_DIR, dir, 'caption', `${videoId}-captioned.mp4`);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

function findScriptJson(videoId: string): string | null {
  try {
    const runDirs = fs.readdirSync(SCS_DIR).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = path.join(SCS_DIR, dir, 'script', `${videoId}-script.json`);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface LedgerEntry { video_id: string; run_id: string; speaker?: string; topic?: string; }

async function main(): Promise<void> {
  if (!BOT_TOKEN)     { console.error('[auto-send-video] TELEGRAM_BOT_TOKEN not set'); process.exit(1); }
  if (!OWNER_CHAT_ID) { console.error('[auto-send-video] OWNER_TELEGRAM_CHAT_ID not set'); process.exit(1); }

  if (!fs.existsSync(LEDGER_PATH)) {
    console.log('[auto-send-video] No publish-ledger.jsonl yet — nothing to send');
    process.exit(0);
  }

  // Load already-sent IDs
  const sentIds = new Set<string>();
  if (fs.existsSync(SENT_PATH)) {
    try {
      fs.readFileSync(SENT_PATH, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { const e = JSON.parse(l); if (e.video_id) sentIds.add(e.video_id); } catch { /* skip */ } });
    } catch { /* ignore */ }
  }

  // Load ledger entries
  const allEntries: LedgerEntry[] = fs.readFileSync(LEDGER_PATH, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as LedgerEntry[];

  // Find first unsent with a captioned mp4 on disk
  let target: { entry: LedgerEntry; mp4: string } | null = null;
  for (const entry of allEntries) {
    if (sentIds.has(entry.video_id)) continue;
    const mp4 = findCaptionedMp4(entry.video_id);
    if (mp4) { target = { entry, mp4 }; break; }
  }

  if (!target) {
    console.log('[auto-send-video] No new videos to send — all delivered or no ready mp4');
    process.exit(0);
  }

  // Build TikTok caption
  let hookText = target.entry.topic ?? target.entry.video_id;
  const scriptPath = findScriptJson(target.entry.video_id);
  if (scriptPath) {
    try {
      const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
      hookText = script.hook ?? script.title ?? script.headline ?? hookText;
    } catch { /* fallback */ }
  }

  let viralHashtags: string[] = [];
  if (fs.existsSync(TOPICS_PATH)) {
    try {
      const vt = JSON.parse(fs.readFileSync(TOPICS_PATH, 'utf-8'));
      viralHashtags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`);
    } catch { /* ignore */ }
  }
  if (viralHashtags.length === 0) viralHashtags = ['#ai', '#tech'];
  const hashtags = [...viralHashtags, '#fyp', '#viral', '#learnontiktok'].join(' ');
  const caption  = `${hookText}\n\n${hashtags}`;

  const reviewButtons = [
    [
      { text: '✅ Approve', callback_data: `approve:${target.entry.video_id}` },
      { text: '❌ Reject',  callback_data: `reject:${target.entry.video_id}` },
      { text: '🔧 Rework',  callback_data: `rework:${target.entry.video_id}` },
    ],
  ];

  console.log(`[auto-send-video] Delivering ${target.entry.video_id} → Telegram ${OWNER_CHAT_ID}`);
  await tgSendMessage(OWNER_CHAT_ID, `📤 Auto-delivering \`${target.entry.video_id}\`…`);

  try {
    await tgSendVideoWithButtons(OWNER_CHAT_ID, target.mp4, caption, reviewButtons);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[auto-send-video] sendVideo failed: ${msg}`);
    await tgSendMessage(OWNER_CHAT_ID, `❌ Auto-send failed: ${msg}`);
    process.exit(1);
  }

  // Log to telegram-sent.jsonl
  fs.mkdirSync(SCS_DIR, { recursive: true });
  fs.appendFileSync(SENT_PATH, JSON.stringify({
    video_id: target.entry.video_id,
    sent_at:  new Date().toISOString(),
    mp4:      target.mp4,
  }) + '\n', 'utf-8');

  console.log(`[auto-send-video] ✓ Sent + logged: ${target.entry.video_id}`);

  await tgSendMessage(OWNER_CHAT_ID,
    `✅ *Video delivered!*\n\n` +
    `🎬 \`${target.entry.video_id}\`\n\n` +
    `📋 *Caption (copy & paste to TikTok):*\n\`\`\`\n${caption}\n\`\`\`\n\n` +
    `✅ After posting: \`/record ${target.entry.video_id} 0\``
  );

  process.exit(0);
}

main().catch(err => {
  console.error('[auto-send-video] Fatal:', err.message);
  process.exit(1);
});
