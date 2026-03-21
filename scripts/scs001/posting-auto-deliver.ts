// Sprint 338 — posting-auto-deliver.ts
// PM2 cron — auto-sends the NEXT scheduled video + TikTok-ready caption to operator.
// Runs at 07:30, 12:00, 18:00. Sends the actual mp4 file, not just a text nudge.
// Tracks what was delivered to avoid duplicates.
//
// Usage: npx ts-node scripts/scs001/posting-auto-deliver.ts
// PM2:   kognai-auto-deliver-morning  (30 7 * * *)
//        kognai-auto-deliver-noon     (0 12 * * *)
//        kognai-auto-deliver-evening  (0 18 * * *)

import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'fs';
import { join, basename } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

// Load .env
try {
  require('dotenv').config({ path: join(ROOT, '.env') });
} catch { /* dotenv optional */ }

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';

if (!BOT_TOKEN || !CHAT_ID) {
  console.log('[auto-deliver] Missing TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID');
  process.exit(0);
}

const MANUAL_POSTS_PATH = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const EXPERIMENTS_PATH = join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
const VIRAL_TOPICS_PATH = join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
const DELIVERED_LOG = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const GATE_TARGET = 30;
const GATE_DATE = new Date('2026-04-07T00:00:00Z');

// ─── Helpers ──────────────────────────────────────────────────────────

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
    // Check legacy run-* dirs
    const runDirs = readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (existsSync(p)) return p;
    }
    // Sprint 607: Check multiformat-runs output dirs
    const mfDir = join(scsDir, 'multiformat-runs');
    if (existsSync(mfDir)) {
      const mfRuns = readdirSync(mfDir).filter(d => d.startsWith('mf-'));
      for (const dir of mfRuns) {
        const outDir = join(mfDir, dir, 'output');
        if (!existsSync(outDir)) continue;
        for (const suffix of ['_final.mp4', '_final_av.mp4', '_video_only.mp4', '_base.mp4']) {
          const p = join(outDir, `${videoId}${suffix}`);
          if (existsSync(p)) return p;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

function getExperimentData(videoId: string): { speaker: string; hook_formula: string; viral_score: number | null; topic: string | null } {
  const result = { speaker: 'unknown', hook_formula: 'unknown', viral_score: null as number | null, topic: null as string | null };
  const lines = readJsonLines(EXPERIMENTS_PATH);
  for (const e of lines) {
    const id = e.clip_id ?? e.video_id;
    if (id === videoId) {
      if (e.speaker) result.speaker = e.speaker;
      if (e.hook_formula) result.hook_formula = e.hook_formula;
      if (e.partial_viral_score != null) result.viral_score = e.partial_viral_score;
      if (e.topic) result.topic = e.topic;
    }
  }
  return result;
}

// Sprint 424: Import shared engagement caption module
const { buildEngagementCaption } = require('./engagement-caption');

// Sprint 680: Escape Telegram special chars in dynamic text
function escapeTg(text: string): string {
  return text.replace(/[<>]/g, '').replace(/([_*`\[\]])/g, '\\$1');
}

// Sprint 686: Strip ALL markdown/entity chars for plain-text captions
function stripEntities(text: string): string {
  return text.replace(/[_*`\[\]()~>#+=|{}.!\\-]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// Sprint 686: Load delivery failure counts to skip persistently-failing videos
function loadFailureCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  const failLog = join(ROOT, 'workspace', 'scs001', 'delivery-failures.jsonl');
  if (!existsSync(failLog)) return counts;
  try {
    const lines = readFileSync(failLog, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (e.video_id) counts.set(e.video_id, (counts.get(e.video_id) || 0) + 1);
      } catch {}
    }
  } catch {}
  return counts;
}

function recordFailure(videoId: string, error: string): void {
  const failLog = join(ROOT, 'workspace', 'scs001', 'delivery-failures.jsonl');
  const entry = JSON.stringify({ video_id: videoId, error, ts: new Date().toISOString() });
  appendFileSync(failLog, entry + '\n');
}

function buildTikTokCaption(videoId: string): string {
  const exp = getExperimentData(videoId);
  let topicTags: string[] = [];
  try {
    const vt = JSON.parse(readFileSync(VIRAL_TOPICS_PATH, 'utf-8'));
    topicTags = (vt.topics ?? []).slice(0, 3).map((t: string) => `#${t.replace(/\s+/g, '')}`);
  } catch { /* fallback */ }
  return buildEngagementCaption({ videoId, hookFormula: exp.hook_formula, speaker: exp.speaker, topic: exp.topic, extraHashtags: topicTags });
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

// Sprint 686: Core sendVideo with configurable caption
function sendVideoRaw(videoPath: string, caption: string): Promise<void> {
  const boundary = '----TgBotBoundary' + Date.now().toString(16);
  const filename = basename(videoPath);
  const fileData = readFileSync(videoPath);

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${CHAT_ID}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
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

// Sprint 686: Retry with stripped caption on entity parse errors
async function sendVideoFile(videoPath: string, caption: string): Promise<void> {
  try {
    await sendVideoRaw(videoPath, caption);
  } catch (err: any) {
    if (err.message?.includes("parse entities")) {
      console.log('[auto-deliver] Retrying with stripped caption (entity parse error)');
      await sendVideoRaw(videoPath, stripEntities(caption));
    } else {
      throw err;
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

// Sprint 525: --batch N flag to send multiple videos in one run
function parseBatchCount(): number {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--batch');
  if (idx >= 0 && args[idx + 1]) return Math.min(parseInt(args[idx + 1], 10) || 1, 20);
  return 1;
}

async function main(): Promise<void> {
  const batchSize = parseBatchCount();
  console.log(`[auto-deliver] Starting auto-deliver (batch: ${batchSize})...`);

  // Check if gate already met
  const manualPosts = readJsonLines(MANUAL_POSTS_PATH);
  if (manualPosts.length >= GATE_TARGET) {
    console.log('[auto-deliver] Gate target met (30+ posts). Skipping.');
    return;
  }

  // Gate math
  const daysLeft = Math.max(1, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const postsLeft = Math.max(0, GATE_TARGET - manualPosts.length);
  const dailyTarget = Math.ceil(postsLeft / daysLeft);

  // Sprint 665: Load ALL delivered IDs (not just today) to prevent re-delivery
  const today = new Date().toISOString().slice(0, 10);
  const deliveredToday = new Set<string>();
  const deliveredAll = new Set<string>();
  const deliveredLines = readJsonLines(DELIVERED_LOG);
  for (const d of deliveredLines) {
    if (d.video_id) deliveredAll.add(d.video_id);
    if ((d.delivered_at ?? '').startsWith(today)) {
      deliveredToday.add(d.video_id);
    }
  }

  // Load recorded (already posted) IDs
  const recordedIds = new Set(manualPosts.map((e: any) => e.video_id).filter(Boolean));

  // Load ledger and viral scores
  const ledger = readJsonLines(LEDGER_PATH);
  const viralScores = new Map<string, number>();
  for (const e of readJsonLines(EXPERIMENTS_PATH)) {
    const id = e.clip_id ?? e.video_id;
    if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
  }

  // Sprint 417: Build ledger dates for freshness scoring
  const ledgerDates = new Map<string, string>();
  for (const e of ledger) {
    if (e.video_id && e.published_at) ledgerDates.set(e.video_id, e.published_at);
  }

  // Sprint 417: Freshness decay (matches Sprint 413 /deliver logic)
  function freshnessScore(vid: string, rawScore: number): number {
    const pubAt = ledgerDates.get(vid);
    if (!pubAt) return rawScore;
    const ageDays = (Date.now() - new Date(pubAt).getTime()) / 86_400_000;
    if (ageDays <= 3) return rawScore;
    return rawScore * Math.pow(0.85, ageDays - 3);
  }

  // Sprint 417: Load speaker and hook maps for diversity
  const speakerMap = new Map<string, string>();
  const hookMap = new Map<string, string>();
  for (const e of readJsonLines(EXPERIMENTS_PATH)) {
    const id = e.clip_id ?? e.video_id;
    if (id && e.speaker && e.speaker !== 'unknown') speakerMap.set(id, e.speaker);
    if (id && e.hook_formula && e.hook_formula !== 'unknown') hookMap.set(id, e.hook_formula);
  }

  // Check recently delivered speakers/hooks (last 5 deliveries)
  const recentDeliveries = deliveredLines.slice(-5);
  const recentSpeakers = recentDeliveries.map((d: any) => speakerMap.get(d.video_id) ?? '').filter(Boolean);
  const recentHooks = recentDeliveries.map((d: any) => hookMap.get(d.video_id) ?? '').filter(Boolean);
  const lastSpeaker = recentSpeakers[recentSpeakers.length - 1] ?? '';
  const lastHook = recentHooks[recentHooks.length - 1] ?? '';
  const consecutiveSpeaker = recentSpeakers.filter(s => s === lastSpeaker).length;
  const consecutiveHook = recentHooks.filter(h => h === lastHook).length;

  // Sprint 686: Skip videos that failed delivery 3+ times
  const failureCounts = loadFailureCounts();
  const MAX_DELIVERY_FAILURES = 3;

  // Find best unposted, un-delivered video with captioned mp4
  // Sprint 665: Dedupe by video_id — ledger can have multiple entries per video
  const seenVids = new Set<string>();
  const candidates = ledger
    .filter((e: any) => {
      if (!e.video_id || seenVids.has(e.video_id)) return false;
      if (recordedIds.has(e.video_id) || deliveredAll.has(e.video_id)) return false;
      if ((failureCounts.get(e.video_id) || 0) >= MAX_DELIVERY_FAILURES) return false;
      if (!findCaptionedMp4(e.video_id)) return false;
      seenVids.add(e.video_id);
      return true;
    })
    .sort((a: any, b: any) =>
      freshnessScore(b.video_id, viralScores.get(b.video_id) ?? 0) -
      freshnessScore(a.video_id, viralScores.get(a.video_id) ?? 0)
    );

  if (candidates.length === 0) {
    console.log('[auto-deliver] No ready videos to deliver.');
    await sendMessage(
      `⚠️ Auto-Deliver — No videos ready to post.\n\nRun the pipeline to generate new content.`
    );
    return;
  }

  // Sprint 525: Batch loop — send up to batchSize videos
  const sentIds = new Set<string>();
  let sentCount = 0;
  const now = new Date();
  const timeLabel = now.getHours() < 10 ? '☀️ Morning' : now.getHours() < 15 ? '🌤️ Midday' : '🌙 Evening';

  for (let b = 0; b < batchSize && candidates.length > 0; b++) {
    // Sprint 417: Pick video respecting speaker + hook diversity (max 2 consecutive)
    let pick = candidates[0];
    for (const c of candidates) {
      if (sentIds.has(c.video_id)) continue;
      const cSpeaker = speakerMap.get(c.video_id) ?? '';
      const cHook = hookMap.get(c.video_id) ?? '';
      const speakerOk = !(consecutiveSpeaker >= 2 && cSpeaker === lastSpeaker && lastSpeaker);
      const hookOk = !(consecutiveHook >= 2 && cHook === lastHook && lastHook);
      if (speakerOk && hookOk) {
        pick = c;
        break;
      }
    }
    if (sentIds.has(pick.video_id)) break; // No more unique candidates

    const videoId = pick.video_id;
    sentIds.add(videoId);
    // Remove from candidates for next iteration
    const pickIdx = candidates.indexOf(pick);
    if (pickIdx >= 0) candidates.splice(pickIdx, 1);

    const mp4Path = findCaptionedMp4(videoId)!;
    const caption = buildTikTokCaption(videoId);
    const vs = viralScores.get(videoId);
    const vsStr = vs != null ? `🧬 ${vs.toFixed(1)}` : '';
    const speaker = speakerMap.get(videoId);
    const spkStr = speaker ? ` · 🎙️ ${escapeTg(speaker)}` : '';
    const hook = hookMap.get(videoId);
    const hookStr = hook ? ` · 🎣 ${escapeTg(hook)}` : '';
    const pubAt = ledgerDates.get(videoId);
    const ageDays = pubAt ? Math.round((Date.now() - new Date(pubAt).getTime()) / 86_400_000) : 0;
    const ageStr = ageDays > 0 ? ` · ${ageDays}d old` : '';

    const tgCaption =
      `📦 ${timeLabel} Auto-Deliver [${b + 1}/${batchSize}] ${vsStr}${spkStr}${hookStr}${ageStr}\n\n` +
      `${caption}\n\n` +
      `📊 ${manualPosts.length}/${GATE_TARGET} posts · ${daysLeft}d left · ${dailyTarget}/day\n\n` +
      `Save video → post to TikTok → /record ${videoId} 0`;

    console.log(`[auto-deliver] Sending ${videoId} [${b + 1}/${batchSize}] (${mp4Path})`);

    try {
      await sendVideoFile(mp4Path, tgCaption);
      console.log(`[auto-deliver] ✅ Sent ${videoId}`);
      sentCount++;

      const entry = JSON.stringify({
        video_id: videoId,
        delivered_at: now.toISOString(),
        viral_score: vs ?? null,
        speaker: speaker ?? null,
        hook_formula: hook ?? null,
        mp4_path: mp4Path,
      });
      appendFileSync(DELIVERED_LOG, entry + '\n');
    } catch (err: any) {
      console.error(`[auto-deliver] ❌ Failed to send ${videoId}: ${err.message}`);
      recordFailure(videoId, err.message);
    }
  }

  console.log(`[auto-deliver] Batch complete: ${sentCount}/${batchSize} sent`);
}

main().catch(err => {
  console.error('[auto-deliver] Fatal:', err);
  process.exit(1);
});
