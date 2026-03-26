// posting-reminder.ts — Sprint 155: Telegram posting nudge at 12:00 + 18:00
// Sends owner a "post this now" message with file path + hashtags + /record command.
// Exits silently if gate is already met (30 posts done).
//
// Usage: npx ts-node scripts/posting-reminder.ts
// PM2: kognai-post-noon (0 12 * * *), kognai-post-evening (0 18 * * *)

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const BOT_TOKEN = process.env.CEO_TELEGRAM_BOT_TOKEN
               || process.env.TELEGRAM_BOT_TOKEN
               || '';
const OWNER_ID  = process.env.OWNER_TELEGRAM_CHAT_ID
               || process.env.CEO_TELEGRAM_CHAT_ID
               || '';

const CWD          = process.cwd();
const LEDGER_PATH  = path.join(CWD, 'workspace', 'scs001', 'publish-ledger.jsonl');
const MANUAL_PATH  = path.join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const TOPICS_PATH  = path.join(CWD, 'workspace', 'scs001', 'viral-topics.json');
const EXP_PATH     = path.join(CWD, 'workspace', 'scs001', 'experiments.jsonl');
const POSTS_TARGET = 30;
const GATE_DATE    = new Date('2026-04-07T00:00:00Z');

interface ExperimentData {
  partial_viral_score?: number;
  speaker?: string;
  topic?: string;
  hook_formula?: string;
}

function loadExperiments(): Map<string, ExperimentData> {
  const map = new Map<string, ExperimentData>();
  if (!fs.existsSync(EXP_PATH)) return map;
  try {
    for (const line of fs.readFileSync(EXP_PATH, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id ?? '';
        if (id) map.set(id, { partial_viral_score: e.partial_viral_score, speaker: e.speaker, topic: e.topic, hook_formula: e.hook_formula });
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return map;
}

// Sprint 170: directory-scan approach (epoch-to-path had 1ms off-by-one — Sprint 164 fix)
function findCaptionedMp4(cwd: string, videoId: string): string | null {
  const scs001Dir = path.join(cwd, 'workspace', 'scs001');
  try {
    const runs = fs.readdirSync(scs001Dir).filter(d => d.startsWith('run-'));
    for (const run of runs) {
      const mp4 = path.join(scs001Dir, run, 'caption', `${videoId}-captioned.mp4`);
      if (fs.existsSync(mp4)) return mp4;
    }
  } catch { /* ignore */ }
  return null;
}

// Sprint 227: Send video file via Telegram sendVideo API
function sendVideoTelegram(chatId: string, videoPath: string, caption?: string): Promise<void> {
  const boundary = '----TgBotBoundary' + Date.now().toString(16);
  const filename = path.basename(videoPath);
  const fileData = fs.readFileSync(videoPath);

  const parts: Buffer[] = [];
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`
  ));
  if (caption) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`
    ));
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`
    ));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`
  ));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 180_000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { ok: boolean; description?: string };
          if (!parsed.ok) reject(new Error(`sendVideo failed: ${parsed.description ?? data.slice(0, 200)}`));
          else resolve();
        } catch { reject(new Error(`sendVideo parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('sendVideo timeout (180s)')); });
    req.write(body);
    req.end();
  });
}

function sendTelegram(chatId: string, text: string): Promise<void> {
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) reject(new Error(`Telegram error: ${parsed.description ?? data.slice(0, 200)}`));
          else resolve();
        } catch { reject(new Error(`Telegram parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Sprint 680: Send video without Markdown parse_mode (fallback)
function sendVideoTelegramPlain(chatId: string, videoPath: string, caption?: string): Promise<void> {
  const boundary = '----TgBotBoundary' + Date.now().toString(16);
  const filename = path.basename(videoPath);
  const fileData = fs.readFileSync(videoPath);

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  if (caption) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      timeout: 180_000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { ok: boolean; description?: string };
          if (!parsed.ok) reject(new Error(`sendVideo: ${parsed.description ?? data.slice(0, 200)}`));
          else resolve();
        } catch { reject(new Error(`sendVideo parse: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('sendVideo timeout')); });
    req.write(body);
    req.end();
  });
}

// Sprint 424: Import shared engagement caption module
const { buildEngagementCaption: _buildCaptionShared } = require('./scs001/engagement-caption');

function buildReminderCaption(videoId: string, hook_formula: string | null, speaker: string | null, hashtags: string): string {
  const extraHashtags = hashtags.split(' ').filter(t => t.startsWith('#'));
  const caption = _buildCaptionShared({ videoId, hookFormula: hook_formula, speaker, extraHashtags });
  return caption + '\n\n/record ' + videoId + ' 0 <tiktok_url>';  // Sprint 1380
}

async function main(): Promise<void> {
  if (!BOT_TOKEN) { process.stderr.write('[posting-reminder] BOT_TOKEN not set — exiting\n'); return; }
  if (!OWNER_ID)  { process.stderr.write('[posting-reminder] OWNER_ID not set — exiting\n'); return; }

  // Count recorded posts
  let recordedCount = 0;
  const recordedIds = new Set<string>();
  if (fs.existsSync(MANUAL_PATH)) {
    fs.readFileSync(MANUAL_PATH, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try { const e = JSON.parse(l); if (e.video_id) { recordedIds.add(e.video_id); recordedCount++; } } catch { /* skip */ }
    });
  }

  // Gate already met — exit silently
  if (recordedCount >= POSTS_TARGET) { process.stdout.write('[posting-reminder] Gate met — skipping\n'); return; }

  const daysLeft   = Math.max(1, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86400000));
  const postsNeeded = POSTS_TARGET - recordedCount;

  // Hashtags from viral-topics.json
  let viralHashtags: string[] = [];
  if (fs.existsSync(TOPICS_PATH)) {
    try { const vt = JSON.parse(fs.readFileSync(TOPICS_PATH, 'utf-8')); viralHashtags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`); } catch { /* ignore */ }
  }
  if (viralHashtags.length === 0) viralHashtags = ['#ai', '#tech'];
  const hashtags = [...viralHashtags, '#fyp', '#viral', '#learnontiktok'].join(' ');

  // Sprint 281: Find top 3 unposted videos (sorted by viral score desc)
  const BATCH_SIZE = 3;
  interface ReadyVideo {
    video_id: string;
    absPath: string;
    speaker: string | null;
    topic: string | null;
    hook_formula: string | null;
    viralScore: number | null;
  }
  const readyVideos: ReadyVideo[] = [];

  if (fs.existsSync(LEDGER_PATH)) {
    const entries: Array<{ video_id: string; run_id: string; speaker?: string; topic?: string }> =
      fs.readFileSync(LEDGER_PATH, 'utf-8').split('\n').filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    const experiments = loadExperiments();
    const ready = entries
      .filter(e => !recordedIds.has(e.video_id) && findCaptionedMp4(CWD, e.video_id))
      .sort((a, b) => (experiments.get(b.video_id)?.partial_viral_score ?? -1) - (experiments.get(a.video_id)?.partial_viral_score ?? -1));

    for (const entry of ready.slice(0, BATCH_SIZE)) {
      const exp = experiments.get(entry.video_id);
      readyVideos.push({
        video_id: entry.video_id,
        absPath: findCaptionedMp4(CWD, entry.video_id)!,
        speaker: exp?.speaker ?? entry.speaker ?? null,
        topic: exp?.topic ?? entry.topic ?? null,
        hook_formula: exp?.hook_formula ?? null,
        viralScore: exp?.partial_viral_score ?? null,
      });
    }
  }

  const lines: string[] = [
    `⏰ *Posting time!* Gate: ${postsNeeded} posts needed, ${daysLeft}d left`,
    '',
  ];

  if (readyVideos.length === 0) {
    lines.push('⚠️ No ready videos on disk. Run pipeline: `pm2 start ecosystem.config.js --only scs001-pipeline`');
  } else {
    lines.push(`📦 *${readyVideos.length} videos ready to post:*`);
    lines.push('');
    for (let i = 0; i < readyVideos.length; i++) {
      const v = readyVideos[i];
      const vsStr = v.viralScore != null ? ` 🧬${v.viralScore}` : '';
      const spkStr = v.speaker && v.speaker !== 'unknown' ? ` 🎙️${v.speaker}` : '';
      const hookStr = v.hook_formula && v.hook_formula !== 'unknown' ? ` 🎣${v.hook_formula}` : '';
      lines.push(`${i + 1}. \`${v.video_id}\`${vsStr}${spkStr}${hookStr}`);
    }
    lines.push('');
    lines.push(`🏷️ ${hashtags}`);
    lines.push('');
    lines.push(`_After posting each: \`/record <id> 0\`_`);
  }

  try {
    await sendTelegram(OWNER_ID, lines.join('\n'));
  } catch (err) {
    // Sprint 680: Fallback — retry without Markdown on parse failure
    if ((err as Error).message?.includes("can't parse entities")) {
      process.stderr.write('[posting-reminder] Markdown parse failed, retrying as plain text\n');
      const plain = lines.join('\n').replace(/\\/g, '').replace(/\*/g, '').replace(/_/g, '');
      const payload = JSON.stringify({ chat_id: OWNER_ID, text: plain });
      await new Promise<void>((resolve, reject) => {
        const req = https.request({
          hostname: 'api.telegram.org',
          path: `/bot${BOT_TOKEN}/sendMessage`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        }, (res) => {
          let data = '';
          res.on('data', (c: string) => (data += c));
          res.on('end', () => { resolve(); });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    } else {
      throw err;
    }
  }

  // Sprint 281 + Sprint 422: Send all batch videos with engagement captions
  for (const v of readyVideos) {
    const vidCaption = buildReminderCaption(v.video_id, v.hook_formula, v.speaker, hashtags);
    try {
      await sendVideoTelegram(OWNER_ID, v.absPath, vidCaption);
      process.stdout.write(`[posting-reminder] Video sent: ${v.video_id}\n`);
    } catch (err) {
      // Sprint 680: Retry video without Markdown caption on parse failure
      if ((err as Error).message?.includes("can't parse entities")) {
        process.stderr.write(`[posting-reminder] Markdown caption failed for ${v.video_id}, retrying without parse_mode\n`);
        try {
          const plainCaption = vidCaption.replace(/\\/g, '').replace(/\*/g, '').replace(/_/g, '');
          await sendVideoTelegramPlain(OWNER_ID, v.absPath, plainCaption);
          process.stdout.write(`[posting-reminder] Video sent (plain): ${v.video_id}\n`);
        } catch (err2) {
          process.stderr.write(`[posting-reminder] Plain video also failed (${v.video_id}): ${(err2 as Error).message}\n`);
        }
      } else {
        process.stderr.write(`[posting-reminder] Video send failed (${v.video_id}): ${(err as Error).message}\n`);
      }
    }
  }

  process.stdout.write(`[posting-reminder] Sent ${readyVideos.length} videos to owner (${postsNeeded} posts needed, ${daysLeft}d)\n`);
}

main().catch(e => { process.stderr.write(`[posting-reminder] Error: ${e.message}\n`); process.exit(1); });
