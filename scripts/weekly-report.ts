#!/usr/bin/env ts-node
/**
 * weekly-report.ts — Sprint 283
 * Weekly posting recap sent via Telegram every Sunday at 20:00.
 * Shows: week's posts, gate progress, streak, pipeline output, projections.
 *
 * Run manually: npx ts-node scripts/weekly-report.ts
 * Dry-run:      WEEKLY_DRY_RUN=1 npx ts-node scripts/weekly-report.ts
 * PM2 cron:     kognai-weekly-report (0 20 * * 0)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const BOT_TOKEN = process.env.CEO_TELEGRAM_BOT_TOKEN
              || process.env.TELEGRAM_BOT_TOKEN
              || '';
const OWNER_ID  = process.env.OWNER_TELEGRAM_CHAT_ID
              || process.env.CEO_TELEGRAM_CHAT_ID
              || '';
const DRY_RUN   = process.env.WEEKLY_DRY_RUN === '1';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Sprint 1230: excludes dry-run entries from weekly report metrics
function readRealPostsWR(): any[] {
  const dryMethods = ['browser-post-dry', 'batch-browser-dry', 'dry'];
  return readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl')).filter(
    (e: any) => e.video_id && !(e.method && dryMethods.some((d: string) => String(e.method).includes(d)))
  );
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
          if (!parsed.ok) reject(new Error(`Telegram: ${parsed.description ?? data.slice(0, 200)}`));
          else resolve();
        } catch { reject(new Error(`Parse: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Data ─────────────────────────────────────────────────────────────────────

function buildWeeklyReport(): string {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  // Manual posts — Sprint 1230: use readRealPostsWR to exclude dry-run entries
  const allPosts = readRealPostsWR();
  const weekPosts = allPosts.filter((p: any) => {
    const date = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    return date >= weekStartStr && date <= todayStr;
  });
  const weekViews = weekPosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const totalPosts = allPosts.length;
  const totalViews = allPosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);

  // Best video this week
  const bestVideo = weekPosts.length > 0
    ? weekPosts.sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0))[0]
    : null;

  // Pipeline output this week
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const weekGenerated = ledger.filter((e: any) => {
    const date = (e.published_at ?? '').slice(0, 10);
    return date >= weekStartStr && date <= todayStr;
  }).length;

  // Streak calculation
  const daySet: Record<string, number> = {};
  for (const p of allPosts as any[]) {
    const date = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    if (date) daySet[date] = (daySet[date] || 0) + 1;
  }
  const days = Object.keys(daySet).sort();
  let currentStreak = 0;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const checkDate = daySet[todayStr] ? todayStr : (daySet[yesterday] ? yesterday : null);
  if (checkDate) {
    let d = new Date(checkDate);
    while (daySet[d.toISOString().slice(0, 10)]) {
      currentStreak++;
      d = new Date(d.getTime() - 86400000);
    }
  }

  // Gate projections
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(1, Math.ceil((gateDate.getTime() - now.getTime()) / 86400000));
  const postsLeft = Math.max(0, 30 - totalPosts);
  const pace = postsLeft > 0 ? Math.ceil(postsLeft / daysLeft) : 0;

  // Week date range for display
  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

  // Active posting days this week
  const activeDays = Object.keys(daySet).filter(d => d >= weekStartStr && d <= todayStr).length;

  const streakEmoji = currentStreak >= 7 ? '🔥🔥🔥' : currentStreak >= 3 ? '🔥🔥' : currentStreak >= 1 ? '🔥' : '❄️';
  const progressBar = totalPosts >= 30 ? '████████████████████ 100%' :
    '█'.repeat(Math.round(totalPosts / 30 * 20)) + '░'.repeat(20 - Math.round(totalPosts / 30 * 20)) + ` ${Math.round(totalPosts / 30 * 100)}%`;

  const lines = [
    `📊 *Weekly Report — ${weekLabel}*`,
    '',
    `*This week:*`,
    `📹 Posts: *${weekPosts.length}*`,
    `👀 Views: *${weekViews}*`,
    `📅 Active days: *${activeDays}/7*`,
    `🎬 Pipeline output: *${weekGenerated}* new videos`,
    '',
    ...(bestVideo ? [
      `🏆 *Best video:* \`${bestVideo.video_id}\``,
      `   Views: ${bestVideo.views ?? 0}`,
      '',
    ] : []),
    `*Gate progress:*`,
    `\`${progressBar}\``,
    `Posts: *${totalPosts}/30* | Views: *${totalViews}/500*`,
    `${streakEmoji} Streak: *${currentStreak}d*`,
    `⏳ ${daysLeft}d left — need *${pace}/day*`,
    '',
    ...(totalPosts >= 30 && totalViews >= 500 ? [
      `✅ *GATE: PROCEED* — ready for Phase 2A!`,
    ] : postsLeft > 0 ? [
      `💡 _Use \`/deliver\` to get videos ready to post._`,
    ] : [
      `📈 _${30 - totalPosts > 0 ? 'Keep posting!' : 'Hit 500 views to pass gate.'}_`,
    ]),
  ];

  return lines.join('\n');
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const report = buildWeeklyReport();

  if (DRY_RUN) {
    process.stdout.write('=== WEEKLY REPORT DRY RUN ===\n');
    process.stdout.write(report + '\n');
    process.stdout.write('=== END ===\n');
    return;
  }

  if (!BOT_TOKEN || !OWNER_ID) {
    process.stderr.write('[weekly-report] BOT_TOKEN or OWNER_ID not set\n');
    process.exit(1);
  }

  try {
    await sendTelegram(OWNER_ID, report);
    process.stdout.write('[weekly-report] Report sent\n');
  } catch (err: any) {
    process.stderr.write(`[weekly-report] Send failed: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch(e => { process.stderr.write(`[weekly-report] Fatal: ${e.message}\n`); process.exit(1); });
