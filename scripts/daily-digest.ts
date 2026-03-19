#!/usr/bin/env ts-node
/**
 * daily-digest.ts — Morning pipeline digest pushed to Telegram
 *
 * Reads real data from workspace/scs001/ and reports/, formats a digest
 * with gate progress + pipeline health, and sends to OWNER_TELEGRAM_CHAT_ID.
 *
 * Run via PM2 cron (kognai-daily-digest, 07:00 daily) or manually:
 *   npx ts-node scripts/daily-digest.ts
 *
 * Dry-run (prints to stdout, no Telegram send):
 *   DIGEST_DRY_RUN=1 npx ts-node scripts/daily-digest.ts
 *
 * Env:
 *   CEO_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN  — required (unless dry-run)
 *   OWNER_TELEGRAM_CHAT_ID or CEO_TELEGRAM_CHAT_ID — required (unless dry-run)
 *   DIGEST_DRY_RUN=1                               — skip Telegram, print to stdout
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

// ── Env ───────────────────────────────────────────────────────────────────────

const BOT_TOKEN   = process.env.CEO_TELEGRAM_BOT_TOKEN
                 || process.env.TELEGRAM_BOT_TOKEN
                 || '';
const OWNER_ID    = process.env.OWNER_TELEGRAM_CHAT_ID
                 || process.env.CEO_TELEGRAM_CHAT_ID
                 || '';
const DRY_RUN     = process.env.DIGEST_DRY_RUN === '1';

// ── Data readers ──────────────────────────────────────────────────────────────

function readLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function readJSON<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

// ── Gate progress (manual-posts.jsonl) ───────────────────────────────────────

function getGateProgress(): { count: number; totalViews: number; avgViews: number } {
  const entries = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const count = entries.length;
  const totalViews = entries.reduce((s: number, e: any) => s + (e.views ?? 0), 0);
  const avgViews = count > 0 ? Math.round(totalViews / count) : 0;
  return { count, totalViews, avgViews };
}

// ── Pipeline ledger (publish-ledger.jsonl) ───────────────────────────────────

function getLedgerStats(): { total: number; todayCount: number; latestAt: string | null } {
  const entries = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const todayCount = entries.filter((e: any) => (e.published_at ?? '').startsWith(todayPrefix)).length;
  const latestAt = entries.map((e: any) => e.published_at ?? '').sort().reverse()[0] ?? null;
  return { total: entries.length, todayCount, latestAt };
}

// ── Top hook formula (experiments.jsonl) ─────────────────────────────────────

function getTopFormula(): string {
  const entries = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  if (!entries.length) return 'no data';

  const map: Record<string, { count: number; passed: number }> = {};
  for (const e of entries as any[]) {
    const f = e.hook_formula ?? 'unknown';
    if (!map[f]) map[f] = { count: 0, passed: 0 };
    map[f].count++;
    if (e.qc_passed) map[f].passed++;
  }

  const sorted = Object.entries(map)
    .sort((a, b) => (b[1].passed / b[1].count) - (a[1].passed / a[1].count));

  if (!sorted.length) return 'no data';
  const [formula, stats] = sorted[0];
  const pct = Math.round(stats.passed / stats.count * 100);
  return `${formula} (${pct}% QC pass)`;
}

// ── Viral topics (Sprint 161) ─────────────────────────────────────────────────

function getViralTopics(): string[] {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json'), 'utf-8'));
    return (Array.isArray(data.topics) ? data.topics : []).slice(0, 3);
  } catch { return []; }
}

// ── Queue stats (Sprint 151): unposted videos ─────────────────────────────────

// Sprint 165: scan run-* dirs to count videos with actual captioned mp4 on disk
function findCaptionedMp4Local(videoId: string): boolean {
  return findCaptionedMp4Path(videoId) !== null;
}

// Sprint 230: return actual path for video delivery
function findCaptionedMp4Path(videoId: string): string | null {
  try {
    const scsDir = path.join(ROOT, 'workspace', 'scs001');
    const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = path.join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

function loadViralScoresForDigest(): Map<string, number> {
  const map = new Map<string, number>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (!fs.existsSync(expPath)) return map;
  try {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); const id = e.clip_id ?? e.video_id; if (id && e.partial_viral_score != null) map.set(id, e.partial_viral_score); } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return map;
}

function getQueueStats(): { ledgerCount: number; recordedCount: number; unposted: number; readyCount: number; top3: string[] } {
  const ledger   = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const viralScores = loadViralScoresForDigest();
  const unpostedEntries = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));
  const readyCount = unpostedEntries.filter((e: any) => findCaptionedMp4Local(e.video_id)).length;
  const top3 = unpostedEntries.slice(0, 3).map((e: any) => e.video_id as string);
  return { ledgerCount: ledger.length, recordedCount: recorded.length, unposted: unpostedEntries.length, readyCount, top3 };
}

// ── Smoke test (reports/smoke-test-latest.json) ───────────────────────────────

function getSmokeTest(): string {
  const s = readJSON<any>(path.join(ROOT, 'reports', 'smoke-test-latest.json'));
  if (!s) return 'no report';
  const ok = s.passed ? '✅' : '❌';
  const stages = s.stage_count ?? 0;
  const ts = s.timestamp ? new Date(s.timestamp).toLocaleDateString('en-GB') : 'unknown';
  return `${ok} ${stages} stages — ${ts}`;
}

// ── Achiri alpha stats (Sprint 168) ──────────────────────────────────────────

function getAchiriAlphaStats(): { waitlist: number; invited: number } {
  const waitlistPath   = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
  const whitelistPath  = path.join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl');
  const waitlist  = readLines(waitlistPath).length;
  const invited   = readLines(whitelistPath).length;
  return { waitlist, invited };
}

// ── Content calendar (Sprint 193) ─────────────────────────────────────────────

function getCalendarToday(): Array<{ video_id: string; slot: string; viral_score: number | null; speaker: string; hook_formula?: string; topic?: string }> {
  const calPath = path.join(ROOT, 'workspace', 'scs001', 'content-calendar.json');
  if (!fs.existsSync(calPath)) return [];
  try {
    const cal = JSON.parse(fs.readFileSync(calPath, 'utf-8'));
    const today = new Date().toISOString().split('T')[0];
    return cal.schedule?.[today] ?? [];
  } catch { return []; }
}

// ── Gate countdown ────────────────────────────────────────────────────────────

function getDaysUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.ceil((target - now) / 86400000));
}

// ── Sprint 282: Posting streak ────────────────────────────────────────────────

function getPostingStreak(): { current: number; best: number; todayPosts: number } {
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  if (posts.length === 0) return { current: 0, best: 0, todayPosts: 0 };

  const daySet: Record<string, number> = {};
  for (const p of posts as any[]) {
    const date = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    if (date) daySet[date] = (daySet[date] || 0) + 1;
  }
  const days = Object.keys(daySet).sort();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let currentStreak = 0;
  const checkDate = days.includes(today) ? today : (days.includes(yesterday) ? yesterday : null);
  if (checkDate) {
    let d = new Date(checkDate);
    while (daySet[d.toISOString().slice(0, 10)]) {
      currentStreak++;
      d = new Date(d.getTime() - 86400000);
    }
  }

  let bestStreak = 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]).getTime();
    const curr = new Date(days[i]).getTime();
    if (curr - prev === 86400000) streak++;
    else { bestStreak = Math.max(bestStreak, streak); streak = 1; }
  }
  bestStreak = Math.max(bestStreak, streak);

  return { current: currentStreak, best: bestStreak, todayPosts: daySet[today] || 0 };
}

// ── Format digest message ─────────────────────────────────────────────────────

function buildDigest(): string {
  const gate     = getGateProgress();
  const ledger   = getLedgerStats();
  const queue    = getQueueStats();
  const formula  = getTopFormula();
  const smoke    = getSmokeTest();
  const viral    = getViralTopics();
  const achiri   = getAchiriAlphaStats();
  const calendarItems = getCalendarToday();
  const stripeStatus = process.env.STRIPE_SECRET_KEY
    ? '💳 Stripe: 🟢 LIVE'
    : '💳 Stripe: 🔴 NOT LIVE (set STRIPE_SECRET_KEY in .env)';

  const postsLeft  = Math.max(0, 30 - gate.count);
  const viewsLeft  = Math.max(0, 500 - gate.totalViews);
  const daysPhase  = getDaysUntil('2026-04-07T00:00:00Z');
  const daysAchiri = getDaysUntil('2026-04-25T00:00:00Z');

  const postIcon  = gate.count >= 30 ? '✅' : '❌';
  const viewsIcon = gate.totalViews >= 500 ? '✅' : '❌';

  // Urgency escalation: graded KILL RISK signal as Apr 7 approaches
  function getUrgencySignal(postsRemaining: number, days: number): string {
    if (postsRemaining <= 0 && gate.totalViews >= 500) return '✅ GATE: PROCEED';
    if (postsRemaining > 0 && gate.count === 0) return '⚠️ WARNING — 0 posts recorded. Start posting now.';
    if (days <= 3 && postsRemaining > 0) return '💀 GATE FAILED — kill switch trigger';
    if (days <= 7 && postsRemaining > days * 3) return `🚨 KILL RISK — ${postsRemaining} posts needed in ${days}d`;
    if (days <= 14 && postsRemaining > days * 2) return `⚠️ WARNING — behind pace (${postsRemaining} posts in ${days}d)`;
    return `⏳ IN PROGRESS — on track`;
  }
  const urgency = getUrgencySignal(postsLeft, daysPhase);
  const showKillReminder = urgency.includes('KILL') || urgency.includes('WARNING') || urgency.includes('FAILED');

  // Urgency: posts needed per remaining day to hit 30
  const postsPerDay = daysPhase > 0 && postsLeft > 0
    ? `_(need ${Math.ceil(postsLeft / daysPhase)}/day to hit target)_`
    : '';

  const streak = getPostingStreak();
  const streakEmoji = streak.current >= 7 ? '🔥🔥🔥' : streak.current >= 3 ? '🔥🔥' : streak.current >= 1 ? '🔥' : '❄️';

  const now = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const lines = [
    `🌅 *Kognai Morning Digest — ${now}*`,
    '',
    `${streakEmoji} Streak: *${streak.current}d* (best: ${streak.best}d) | Yesterday: ${streak.todayPosts > 0 ? `${streak.todayPosts} posted` : 'none'}`,
    '',
    `📊 *Phase 1.5 Gate* — ${daysPhase}d until Apr 7`,
    `${postIcon}  Posts:  *${gate.count}/30* ${postsLeft > 0 ? `(${postsLeft} more) ${postsPerDay}` : ''}`,
    `${viewsIcon}  Views:  *${gate.totalViews}/500* ${viewsLeft > 0 ? `(avg ${gate.avgViews}/post)` : ''}`,
    `→ ${urgency}`,
    ...(showKillReminder ? [`   _Kill switch: <500 views/30 posts by Apr 7_`] : []),
    ...(showKillReminder && queue.top3.length > 0 ? [
      '',
      '📌 *Post these now:*',
      ...queue.top3.map((id, i) => `${i + 1}. \`/record ${id} 0\``),
    ] : []),
    '',
    `🎬 *Pipeline* (dry-run)`,
    `• Total generated: ${ledger.total} | Today: ${ledger.todayCount}`,
    `📋 Queue: *${queue.readyCount}* ready to post (${queue.unposted} in ledger)`,
    `• Top formula: ${formula}`,
    `• Smoke test: ${smoke}`,
    '',
    stripeStatus,
    '',
    `📅 *Upcoming gates*`,
    `• Apr 7  — Phase 1.5 decision (${daysPhase}d)`,
    `• Apr 25 — Achiri alpha launch (${daysAchiri}d)`,
    '',
    `🤝 *Achiri Alpha:*`,
    `  • Waitlist: ${achiri.waitlist} signups`,
    `  • Invited:  ${achiri.invited} users`,
    `  • Launch:   Apr 25 (${daysAchiri}d away)`,
    '',
    ...(calendarItems.length > 0 ? [
      `📅 *Today's Posting Schedule:*`,
      ...calendarItems.flatMap((item, i) => {
        const vs = item.viral_score != null ? ` 🧬 ${item.viral_score}` : '';
        const lines = [`${i + 1}. ⏰ ${item.slot} — \`${item.video_id}\`${vs}`];
        const meta: string[] = [];
        if (item.speaker && item.speaker !== 'unknown') meta.push(`🎙️ ${item.speaker}`);
        if (item.hook_formula) meta.push(`🎣 ${item.hook_formula}`);
        if (meta.length > 0) lines.push(`   ${meta.join(' | ')}`);
        return lines;
      }),
      '',
    ] : []),
    ...(viral.length > 0 ? [
      `🔥 *Trending topics (post one of these today):*`,
      ...viral.map(t => `• ${t}`),
      '',
    ] : []),
    ledger.total > 0
      ? `💡 _Telegram: /queue to see unposted, /review for latest, /record <id> <views> to track_`
      : `⚠️ _No pipeline output yet — check PM2: \`pm2 status\` | /queue when ready_`,
  ];

  return lines.join('\n');
}

// ── Telegram send ─────────────────────────────────────────────────────────────

function sendTelegram(chatId: string, text: string): Promise<void> {
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(`Telegram error: ${parsed.description ?? JSON.stringify(parsed)}`));
          } else {
            resolve();
          }
        } catch {
          reject(new Error(`Telegram parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
    req.write(payload);
    req.end();
  });
}

// Sprint 230: Send video file via Telegram sendVideo API
function sendVideoTelegram(chatId: string, videoPath: string, caption?: string): Promise<void> {
  const boundary = '----TgBotBoundary' + Date.now().toString(16);
  const filename = path.basename(videoPath);
  const fileData = fs.readFileSync(videoPath);

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  if (caption) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`));
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

// ── Entry ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const digest = buildDigest();

  if (DRY_RUN) {
    process.stdout.write('=== DIGEST DRY RUN ===\n');
    process.stdout.write(digest + '\n');
    process.stdout.write('=== END ===\n');
    return;
  }

  if (!BOT_TOKEN) {
    process.stderr.write('[daily-digest] CEO_TELEGRAM_BOT_TOKEN not set — exiting\n');
    process.exit(1);
  }
  if (!OWNER_ID) {
    process.stderr.write('[daily-digest] OWNER_TELEGRAM_CHAT_ID not set — exiting\n');
    process.exit(1);
  }

  try {
    await sendTelegram(OWNER_ID, digest);
    process.stdout.write(`[daily-digest] Digest sent to ${OWNER_ID}\n`);
  } catch (err: any) {
    process.stderr.write(`[daily-digest] Send failed: ${err.message}\n`);
    process.exit(1);
  }

  // Sprint 230: Send top ready-to-post video with the morning digest
  try {
    const queue = getQueueStats();
    if (queue.top3.length > 0) {
      const topId = queue.top3[0];
      const mp4Path = findCaptionedMp4Path(topId);
      if (mp4Path) {
        const topicsPath = path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
        let hashtags = '#ai #tech #fyp #viral #learnontiktok';
        try {
          const vt = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
          const tags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`);
          if (tags.length > 0) hashtags = [...tags, '#fyp', '#viral', '#learnontiktok'].join(' ');
        } catch { /* fallback */ }
        await sendVideoTelegram(OWNER_ID, mp4Path, `Post this now!\n${hashtags}\n\n/record ${topId} 0`);
        process.stdout.write(`[daily-digest] Top video sent: ${topId}\n`);
      }
    }
  } catch (err: any) {
    process.stderr.write(`[daily-digest] Video send failed (non-fatal): ${err.message}\n`);
  }
}

main().catch(err => {
  process.stderr.write(`[daily-digest] Fatal: ${err.message}\n`);
  process.exit(1);
});
