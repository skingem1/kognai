#!/usr/bin/env node
'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');

const BOT_TOKEN    = '8767188473:AAH0-ua-U5SQLi1x5eptB0P8laIe8qYNswQ';
const OWNER_CHAT_ID = '6001921477';
const ROOT          = path.resolve(__dirname, '..');
const SENT_PATH     = path.join(ROOT, 'workspace/scs001/telegram-sent.jsonl');

// ─── helpers ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sendMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }));
    const req = https.request(
      { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }, timeout: 15000 },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('sendMessage timeout')); });
    req.write(body); req.end();
  });
}

function sendVideoWithButtons(chatId, videoPath, caption, buttons) {
  const boundary  = '----BatchSend' + Date.now().toString(16);
  const filename   = path.basename(videoPath);
  const fileData   = fs.readFileSync(videoPath);
  const replyMarkup = JSON.stringify({ inline_keyboard: buttons });
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reply_markup"\r\n\r\n${replyMarkup}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendVideo`, method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
        timeout: 240000 },
      res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          const parsed = JSON.parse(d);
          if (!parsed.ok) reject(new Error(`Telegram error: ${JSON.stringify(parsed)}`));
          else resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`sendVideo timeout (240s) for ${filename}`)); });
    req.write(body); req.end();
  });
}

function logSent(video_id, mp4) {
  fs.mkdirSync(path.dirname(SENT_PATH), { recursive: true });
  fs.appendFileSync(SENT_PATH, JSON.stringify({ video_id, mp4, sent_at: new Date().toISOString() }) + '\n', 'utf-8');
}

// ─── build list ─────────────────────────────────────────────────────────────

const SENT = new Set();
if (fs.existsSync(SENT_PATH)) {
  fs.readFileSync(SENT_PATH, 'utf-8').split('\n').filter(Boolean).forEach(l => {
    try { const e = JSON.parse(l); if (e.video_id) SENT.add(e.video_id); } catch {}
  });
}

const videos = [];

// run-* captioned clips
const scs001Dir = path.join(ROOT, 'workspace/scs001');
fs.readdirSync(scs001Dir).filter(d => d.startsWith('run-')).forEach(dir => {
  const capDir = path.join(scs001Dir, dir, 'caption');
  if (!fs.existsSync(capDir)) return;
  fs.readdirSync(capDir).filter(f => f.endsWith('-captioned.mp4')).forEach(f => {
    const videoId = f.replace('-captioned.mp4', '');
    if (SENT.has(videoId)) return;
    const fullPath = path.join(capDir, f);
    const sizeMB = fs.statSync(fullPath).size / 1024 / 1024;
    if (sizeMB > 49 || sizeMB < 0.001) return;
    videos.push({ video_id: videoId, mp4: fullPath, type: 'clip', title: null });
  });
});

// vlog / demo / ent pipeline
const pipelines = [
  { base: 'vlog-runs',          type: 'vlog',  prefix: 'vlog-' },
  { base: 'code-demo-runs',     type: 'demo',  prefix: 'demo-' },
  { base: 'entertainment-runs', type: 'ent',   prefix: 'ent-'  },
];
for (const { base, type, prefix } of pipelines) {
  const baseDir = path.join(scs001Dir, base);
  if (!fs.existsSync(baseDir)) continue;
  fs.readdirSync(baseDir).forEach(dir => {
    if (!dir.startsWith(prefix.split('-')[0])) return;
    const mp4 = path.join(baseDir, dir, dir + '.mp4');
    if (!fs.existsSync(mp4)) return;
    if (SENT.has(dir)) return;
    const sizeMB = fs.statSync(mp4).size / 1024 / 1024;
    if (sizeMB > 49 || sizeMB < 0.1) return;
    let title = dir;
    const meta = path.join(baseDir, dir, 'meta.json');
    if (fs.existsSync(meta)) { try { title = JSON.parse(fs.readFileSync(meta,'utf-8')).title || dir; } catch {} }
    videos.push({ video_id: dir, mp4, type, title });
  });
}

// ─── sort: vlog first, then demo, then ent, then clips ──────────────────────
const ORDER = { vlog: 0, demo: 1, ent: 2, clip: 3 };
videos.sort((a, b) => ORDER[a.type] - ORDER[b.type]);

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const total = videos.length;
  console.log(`Sending ${total} videos to Telegram…`);

  await sendMessage(OWNER_CHAT_ID,
    `📬 *Batch Review: ${total} videos incoming*\n\nTap ✅ Approve / ❌ Reject / 🔧 Rework under each video.`
  ).catch(() => {});

  let sent = 0;
  let failed = 0;

  for (const v of videos) {
    const num = sent + failed + 1;
    const typeTag = { vlog: '🎭 Vlog', demo: '💻 Demo', ent: '🎬 Ent', clip: '📎 Clip' }[v.type] || v.type;
    const caption = [
      `${typeTag} *[${num}/${total}]*`,
      v.title && v.title !== v.video_id ? `📌 ${v.title}` : null,
      `\`${v.video_id}\``
    ].filter(Boolean).join('\n');

    const buttons = [[
      { text: '✅ Approve', callback_data: `approve:${v.video_id}` },
      { text: '❌ Reject',  callback_data: `reject:${v.video_id}` },
      { text: '🔧 Rework',  callback_data: `rework:${v.video_id}` },
    ]];

    try {
      await sendVideoWithButtons(OWNER_CHAT_ID, v.mp4, caption, buttons);
      logSent(v.video_id, v.mp4);
      sent++;
      console.log(`✅ [${num}/${total}] ${v.video_id}`);
    } catch (err) {
      failed++;
      console.error(`❌ [${num}/${total}] ${v.video_id}: ${err.message}`);
    }

    // Rate limit: 3s between videos
    if (num < total) await sleep(3000);
  }

  await sendMessage(OWNER_CHAT_ID,
    `✅ *Batch send complete*\nSent: ${sent} | Failed: ${failed}\n\nReview and tap ✅/❌/🔧 on each.`
  ).catch(() => {});

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
