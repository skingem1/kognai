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
const POSTS_TARGET = 30;
const GATE_DATE    = new Date('2026-04-07T00:00:00Z');

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

  // Find first unposted video with captioned mp4 on disk
  let videoId: string | null = null;
  let filePath: string | null = null;
  let speaker: string | null = null;
  let topic: string | null = null;

  if (fs.existsSync(LEDGER_PATH)) {
    const entries: Array<{ video_id: string; run_id: string; speaker?: string; topic?: string }> =
      fs.readFileSync(LEDGER_PATH, 'utf-8').split('\n').filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    for (const e of entries) {
      if (recordedIds.has(e.video_id)) continue;
      const mp4 = findCaptionedMp4(CWD, e.video_id);
      if (mp4) {
        videoId  = e.video_id;
        filePath = mp4.replace(process.env.HOME ?? '/Users/tarekmnif', '~');
        speaker  = e.speaker ?? null;
        topic    = e.topic   ?? null;
        break;
      }
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
    if (speaker) lines.push(`🎙️ ${speaker}`);
    if (topic)   lines.push(`📝 ${topic.slice(0, 70)}`);
    lines.push(`📁 \`${filePath}\``);
    lines.push(`🏷️ ${hashtags}`);
    lines.push('');
    lines.push(`→ After posting: \`/record ${videoId} 0\``);
  }

  await sendTelegram(OWNER_ID, lines.join('\n'));
  process.stdout.write(`[posting-reminder] Sent reminder to owner (${postsNeeded} posts needed, ${daysLeft}d)\n`);
}

main().catch(e => { process.stderr.write(`[posting-reminder] Error: ${e.message}\n`); process.exit(1); });
