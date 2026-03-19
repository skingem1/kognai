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

function loadViralScores(): Map<string, number> {
  const map = new Map<string, number>();
  if (!fs.existsSync(EXP_PATH)) return map;
  try {
    for (const line of fs.readFileSync(EXP_PATH, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id ?? '';
        if (id && e.partial_viral_score != null) map.set(id, e.partial_viral_score);
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

  // Find best unposted video (sorted by viral score desc)
  let videoId: string | null = null;
  let filePath: string | null = null;
  let speaker: string | null = null;
  let topic: string | null = null;
  let viralScore: number | null = null;

  if (fs.existsSync(LEDGER_PATH)) {
    const entries: Array<{ video_id: string; run_id: string; speaker?: string; topic?: string }> =
      fs.readFileSync(LEDGER_PATH, 'utf-8').split('\n').filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    const viralScores = loadViralScores();
    const ready = entries
      .filter(e => !recordedIds.has(e.video_id) && findCaptionedMp4(CWD, e.video_id))
      .sort((a, b) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

    if (ready.length > 0) {
      const best = ready[0];
      videoId    = best.video_id;
      filePath   = findCaptionedMp4(CWD, best.video_id)!.replace(process.env.HOME ?? '/Users/tarekmnif', '~');
      speaker    = best.speaker ?? null;
      topic      = best.topic   ?? null;
      viralScore = viralScores.get(best.video_id) ?? null;
    }
  }

  const lines: string[] = [
    `⏰ *Posting time!* Gate: ${postsNeeded} posts needed, ${daysLeft}d left`,
    '',
  ];

  if (!videoId || !filePath) {
    lines.push('⚠️ No ready videos on disk. Run pipeline: `pm2 start ecosystem.config.js --only scs001-pipeline`');
  } else {
    lines.push(`📹 \`${videoId}\``);
    if (viralScore != null) lines.push(`🧬 Viral: ${viralScore}`);
    if (speaker) lines.push(`🎙️ ${speaker}`);
    if (topic)   lines.push(`📝 ${topic.slice(0, 70)}`);
    lines.push(`📁 \`${filePath}\``);
    lines.push(`🏷️ ${hashtags}`);
    lines.push('');
    lines.push(`→ After posting: \`/record ${videoId} 0\``);
  }

  await sendTelegram(OWNER_ID, lines.join('\n'));

  // Sprint 227: Send the actual video file so operator can save to phone and post
  if (videoId) {
    const absPath = findCaptionedMp4(CWD, videoId);
    if (absPath) {
      try {
        const vidCaption = [topic?.slice(0, 80), hashtags, `\n/record ${videoId} 0`].filter(Boolean).join('\n');
        await sendVideoTelegram(OWNER_ID, absPath, vidCaption);
        process.stdout.write(`[posting-reminder] Video sent: ${videoId}\n`);
      } catch (err) {
        process.stderr.write(`[posting-reminder] Video send failed: ${(err as Error).message}\n`);
      }
    }
  }

  process.stdout.write(`[posting-reminder] Sent reminder to owner (${postsNeeded} posts needed, ${daysLeft}d)\n`);
}

main().catch(e => { process.stderr.write(`[posting-reminder] Error: ${e.message}\n`); process.exit(1); });
