// Sprint 337 — weekly-usage-digest.ts
// PM2 cron (Sunday 10:00) — Achiri weekly usage report to operator.
// Summarizes: DAU trend, top users, message volume, retention, memory growth.
//
// Usage: npx ts-node scripts/achiri/weekly-usage-digest.ts
// PM2:   cron_restart: "0 10 * * 0"

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

// Load .env
try {
  require('dotenv').config({ path: join(ROOT, '.env') });
} catch { /* dotenv optional */ }

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';

if (!BOT_TOKEN || !CHAT_ID) {
  console.log('[achiri-weekly] Missing TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID');
  process.exit(0);
}

function sendTelegram(text: string): Promise<void> {
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

interface DayCounts { [userId: string]: number; }

function loadDailyCounts(): Record<string, DayCounts> {
  const p = join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function getWeekDays(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function isTestUser(userId: string): boolean {
  return /^(validate-|e2e-|smoke-|tarek[_-]test|user-premium)/.test(userId);
}

async function main(): Promise<void> {
  console.log('[achiri-weekly] Generating weekly usage digest...');

  const counts = loadDailyCounts();
  const weekDays = getWeekDays();
  const daysToAlpha = Math.max(0, Math.ceil((new Date('2026-04-25').getTime() - Date.now()) / 86_400_000));

  // Weekly stats
  let weekMsgs = 0;
  const weekUsers = new Set<string>();
  const userMsgTotals = new Map<string, number>();
  const dailyStats: Array<{ date: string; users: number; msgs: number }> = [];

  for (const day of weekDays) {
    const dayCounts = counts[day] ?? {};
    let dayMsgs = 0;
    let dayUsers = 0;

    for (const [userId, count] of Object.entries(dayCounts)) {
      if (isTestUser(userId)) continue;
      dayMsgs += count;
      dayUsers++;
      weekUsers.add(userId);
      userMsgTotals.set(userId, (userMsgTotals.get(userId) ?? 0) + count);
    }

    weekMsgs += dayMsgs;
    dailyStats.push({ date: day, users: dayUsers, msgs: dayMsgs });
  }

  // Top users this week
  const topUsers = Array.from(userMsgTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Memory files (real users only)
  const memDir = join(ROOT, 'workspace', 'achiri', 'memory');
  let memFiles = 0;
  let totalTurns = 0;
  if (existsSync(memDir)) {
    const files = readdirSync(memDir).filter(f => f.endsWith('.jsonl') && !isTestUser(f.replace('.jsonl', '')));
    memFiles = files.length;
    for (const f of files) {
      totalTurns += readFileSync(join(memDir, f), 'utf-8').split('\n').filter(l => l.trim()).length;
    }
  }

  // Feedback summary
  const feedbackPath = join(ROOT, 'workspace', 'achiri', 'feedback.jsonl');
  let feedbackCount = 0;
  let feedbackAvg = 0;
  if (existsSync(feedbackPath)) {
    const entries = readFileSync(feedbackPath, 'utf-8').split('\n').filter(l => l.trim());
    feedbackCount = entries.length;
    if (feedbackCount > 0) {
      const sum = entries.reduce((s, l) => {
        try { return s + (JSON.parse(l).rating ?? 0); } catch { return s; }
      }, 0);
      feedbackAvg = Math.round((sum / feedbackCount) * 10) / 10;
    }
  }

  // Waitlist
  const wlPath = join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
  let waitlistCount = 0;
  if (existsSync(wlPath)) {
    waitlistCount = readFileSync(wlPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  }

  // Build digest
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const dateRange = `${weekDays[0]} → ${weekDays[6]}`;

  const lines = [
    `📊 *Achiri Weekly Digest* (${dayOfWeek})`,
    `_${dateRange}_`,
    '',
    `🎯 *Alpha Launch:* ${daysToAlpha} days (Apr 25)`,
    '',
    '*Weekly Summary*',
    `💬 Messages: *${weekMsgs}*`,
    `👥 Active users: *${weekUsers.size}*`,
    `📈 Avg msgs/day: *${weekMsgs > 0 ? Math.round(weekMsgs / 7) : 0}*`,
    '',
    '*Daily Trend*',
    ...dailyStats.map(d => {
      const bar = '█'.repeat(Math.min(d.msgs, 20));
      const dayName = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      return `${dayName}: ${bar} ${d.msgs} (${d.users}u)`;
    }),
    '',
  ];

  if (topUsers.length > 0) {
    lines.push('*Top Users*');
    for (const [userId, msgs] of topUsers) {
      lines.push(`  \`${userId.slice(0, 12)}\`: ${msgs} msgs`);
    }
    lines.push('');
  }

  lines.push('*System*');
  lines.push(`🧠 Memory files: ${memFiles} | Stored turns: ${totalTurns}`);
  lines.push(`🙋 Waitlist: ${waitlistCount}`);
  if (feedbackCount > 0) {
    lines.push(`⭐ Feedback: ${feedbackAvg}/5 avg (${feedbackCount} ratings)`);
  } else {
    lines.push('⭐ No feedback yet');
  }

  await sendTelegram(lines.join('\n'));
  console.log(`[achiri-weekly] Sent. ${weekMsgs} msgs, ${weekUsers.size} users this week.`);
}

main().catch(err => {
  console.error(`[achiri-weekly] Error: ${err.message}`);
  process.exit(1);
});
