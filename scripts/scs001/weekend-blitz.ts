// Sprint 341 — weekend-blitz.ts
// PM2 cron (Saturday 09:00) — batch-sends 5 top-scored videos with captions.
// Operator can batch-post on weekends to catch up on the 30-post gate.
// Silent if gate already met or no ready videos.
//
// Usage: npx ts-node scripts/scs001/weekend-blitz.ts
// PM2:   kognai-weekend-blitz (0 9 * * 6)

import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'fs';
import { join, basename } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

try {
  require('dotenv').config({ path: join(ROOT, '.env') });
} catch { /* dotenv optional */ }

const BOT_TOKEN = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';

if (!BOT_TOKEN || !CHAT_ID) {
  console.log('[weekend-blitz] Missing TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID');
  process.exit(0);
}

const MANUAL_POSTS_PATH = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const EXPERIMENTS_PATH = join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
const VIRAL_TOPICS_PATH = join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
const DELIVERED_LOG = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const GATE_TARGET = 30;
const GATE_DATE = new Date('2026-04-07T00:00:00Z');
const BLITZ_COUNT = 5;

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

function findCaptionedMp4(videoId: string): string | null {
  try {
    const scsDir = join(ROOT, 'workspace', 'scs001');
    const runDirs = readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

function getExperimentData(videoId: string): { speaker: string; hook_formula: string; viral_score: number | null } {
  const result = { speaker: 'unknown', hook_formula: 'unknown', viral_score: null as number | null };
  for (const e of readJsonLines(EXPERIMENTS_PATH)) {
    const id = e.clip_id ?? e.video_id;
    if (id === videoId) {
      if (e.speaker) result.speaker = e.speaker;
      if (e.hook_formula) result.hook_formula = e.hook_formula;
      if (e.partial_viral_score != null) result.viral_score = e.partial_viral_score;
    }
  }
  return result;
}

function buildTikTokCaption(videoId: string): string {
  const exp = getExperimentData(videoId);
  let topicTags: string[] = [];
  try {
    const vt = JSON.parse(readFileSync(VIRAL_TOPICS_PATH, 'utf-8'));
    topicTags = (vt.topics ?? []).slice(0, 5).map((t: string) => `#${t.replace(/\s+/g, '')}`);
  } catch { /* fallback */ }
  const baseTags = ['#fyp', '#viral', '#learnontiktok', '#ai', '#tech'];
  const tagSet: Record<string, boolean> = {};
  for (const t of [...topicTags, ...baseTags]) tagSet[t] = true;
  const allTags = Object.keys(tagSet).slice(0, 8);
  const lines: string[] = [];
  if (exp.speaker && exp.speaker !== 'unknown') lines.push(`🎙️ ${exp.speaker}`);
  if (exp.hook_formula && exp.hook_formula !== 'unknown') lines.push(`Hook: ${exp.hook_formula}`);
  lines.push('');
  lines.push(allTags.join(' '));
  return lines.join('\n');
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
      res.on('end', () => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Telegram ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sendVideoFile(videoPath: string, caption: string): Promise<void> {
  const boundary = '----TgBotBoundary' + Date.now().toString(16);
  const filename = basename(videoPath);
  const fileData = readFileSync(videoPath);

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${CHAT_ID}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`));
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

// Delay helper to avoid Telegram rate limits
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('[weekend-blitz] Starting Saturday batch delivery...');

  const manualPosts = readJsonLines(MANUAL_POSTS_PATH);
  if (manualPosts.length >= GATE_TARGET) {
    console.log('[weekend-blitz] Gate target met. Skipping.');
    return;
  }

  const daysLeft = Math.max(1, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const postsLeft = Math.max(0, GATE_TARGET - manualPosts.length);

  const recordedIds = new Set(manualPosts.map((e: any) => e.video_id).filter(Boolean));

  // Load today's deliveries to avoid re-sending
  const today = new Date().toISOString().slice(0, 10);
  const deliveredToday = new Set<string>();
  for (const d of readJsonLines(DELIVERED_LOG)) {
    if ((d.delivered_at ?? '').startsWith(today)) deliveredToday.add(d.video_id);
  }

  const viralScores = new Map<string, number>();
  for (const e of readJsonLines(EXPERIMENTS_PATH)) {
    const id = e.clip_id ?? e.video_id;
    if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
  }

  const ledger = readJsonLines(LEDGER_PATH);
  const candidates = ledger
    .filter((e: any) =>
      e.video_id &&
      !recordedIds.has(e.video_id) &&
      !deliveredToday.has(e.video_id) &&
      findCaptionedMp4(e.video_id) !== null
    )
    .sort((a: any, b: any) =>
      (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1)
    );

  const batch = candidates.slice(0, BLITZ_COUNT);

  if (batch.length === 0) {
    console.log('[weekend-blitz] No ready videos. Skipping.');
    await sendMessage(`⚠️ *Weekend Blitz* — No videos ready to post. Run /refresh first.`);
    return;
  }

  await sendMessage(
    `🚀 *Weekend Posting Blitz!*\n\n` +
    `Sending ${batch.length} top-scored videos for batch posting.\n` +
    `📊 Gate: ${manualPosts.length}/${GATE_TARGET} · ${postsLeft} left · ${daysLeft}d\n\n` +
    `Save each video, post to TikTok, then /posted for each one.`
  );

  let sent = 0;
  for (const entry of batch) {
    const videoId = entry.video_id;
    const mp4Path = findCaptionedMp4(videoId)!;
    const caption = buildTikTokCaption(videoId);
    const vs = viralScores.get(videoId);
    const vsStr = vs != null ? `🧬 ${vs.toFixed(1)}` : '';
    const safeCaption = caption.replace(/([_*`\[\]])/g, '\\$1');

    const tgCaption =
      `🚀 *Blitz ${sent + 1}/${batch.length}* ${vsStr}\n\n` +
      `${safeCaption}\n\n` +
      `After posting: /record ${videoId} 0 <tiktok_url>`;  // Sprint 1380

    try {
      await sendVideoFile(mp4Path, tgCaption);
      sent++;
      // Log delivery
      appendFileSync(DELIVERED_LOG, JSON.stringify({
        video_id: videoId,
        delivered_at: new Date().toISOString(),
        viral_score: vs ?? null,
        mp4_path: mp4Path,
        source: 'weekend-blitz',
      }) + '\n');
      // Rate limit: 1 video per 3 seconds
      if (sent < batch.length) await delay(3000);
    } catch (err: any) {
      console.error(`[weekend-blitz] Failed to send ${videoId}: ${err.message}`);
    }
  }

  await sendMessage(
    `✅ *Blitz complete!* Sent ${sent}/${batch.length} videos.\n\n` +
    `Post them all, then type /posted after each one.\n` +
    `${sent >= 5 ? '💪 Great batch! You can hit 5 posts today!' : ''}`
  );

  console.log(`[weekend-blitz] Done. Sent ${sent}/${batch.length} videos.`);
}

main().catch(err => {
  console.error('[weekend-blitz] Fatal:', err);
  process.exit(1);
});
