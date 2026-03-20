#!/usr/bin/env npx ts-node
/**
 * daily-engagement.ts — Sprint 398
 * Sends active Achiri users a daily morning message with:
 * - Darija word of the day
 * - Quick trivia question
 * - Engagement streak counter
 *
 * "Active" = messaged within the last 7 days.
 * Skips users who already messaged today (they're already engaged).
 *
 * PM2 cron: daily at 08:00 UTC (9am Tunisia CET)
 *   pm2 start ecosystem.config.js --only achiri-daily-engage
 *
 * Usage: npx ts-node scripts/achiri/daily-engagement.ts [--dry-run]
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD = process.cwd();
const DAILY_COUNTS_PATH = join(CWD, 'workspace', 'achiri', 'daily-counts.json');
const ENGAGE_LOG_PATH = join(CWD, 'workspace', 'achiri', 'daily-engage-log.jsonl');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');

const ACTIVE_WINDOW_DAYS = 7;
const MAX_PER_RUN = 20;

// --- Darija words (subset for daily push) ---
const WORDS = [
  { word: 'يزي', latin: 'yezzi', meaning: 'Enough / Stop', example: 'Yezzi, ma t3awdch!' },
  { word: 'برشا', latin: 'barcha', meaning: 'A lot', example: 'N7ebek barcha!' },
  { word: 'شنوة', latin: 'chnowa', meaning: 'What?', example: 'Chnowa t7eb?' },
  { word: 'كيفاش', latin: 'kifech', meaning: 'How?', example: 'Kifech 7alek?' },
  { word: 'فيسع', latin: 'fisa3', meaning: 'Quickly', example: 'Arwah fisa3!' },
  { word: 'صحبي', latin: 'sa7bi', meaning: 'My friend', example: 'Ahla sa7bi!' },
  { word: 'نحب', latin: 'n7eb', meaning: 'I want / I love', example: 'N7eb 9ahwa.' },
  { word: 'بالاهي', latin: 'bellahi', meaning: 'Please', example: 'Bellahi 3awenni.' },
  { word: 'يعيشك', latin: 'ya3ichek', meaning: 'Thank you', example: 'Ya3ichek, barcha!' },
  { word: 'شوية', latin: 'chwaya', meaning: 'A little', example: 'Stanna chwaya.' },
  { word: 'توّا', latin: 'tawa', meaning: 'Now', example: 'Tawa nemchi.' },
  { word: 'غدوة', latin: 'ghodwa', meaning: 'Tomorrow', example: 'Nchoufek ghodwa!' },
  { word: 'قهوة', latin: '9ahwa', meaning: 'Coffee / Café', example: 'Nemchiw lel 9ahwa?' },
  { word: 'بنين', latin: 'bnin', meaning: 'Delicious', example: 'El kosksi bnin barcha!' },
  { word: 'حومة', latin: '7ouma', meaning: 'Neighborhood', example: 'El 7ouma mte3i hkeya.' },
];

const TRIVIA = [
  { q: '🏛️ What ancient city was near modern Tunis?', a: 'Carthage!' },
  { q: '🌶️ What is Tunisia\'s signature condiment?', a: 'Harissa!' },
  { q: '🏝️ Which island is the land of the Lotus Eaters?', a: 'Djerba!' },
  { q: '💙 Which city is "Blue and White"?', a: 'Sidi Bou Said!' },
  { q: '🍲 What is Tunisia\'s national dish?', a: 'Couscous!' },
  { q: '📅 When did Tunisia gain independence?', a: '1956!' },
  { q: '🏟️ Which city has Africa\'s largest amphitheatre?', a: 'El Jem!' },
  { q: '🌍 "Africa" comes from which old name?', a: 'Ifriqiya!' },
];

// --- Helpers ---

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

type DailyCounts = Record<string, Record<string, number>>;

function loadDailyCounts(): DailyCounts {
  if (!existsSync(DAILY_COUNTS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DAILY_COUNTS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function getActiveUsers(counts: DailyCounts): string[] {
  const today = todayKey();
  const users = new Set<string>();

  for (const [date, userCounts] of Object.entries(counts)) {
    if (daysBetween(date) <= ACTIVE_WINDOW_DAYS && date !== today) {
      for (const userId of Object.keys(userCounts)) {
        users.add(userId);
      }
    }
  }

  // Exclude users who already messaged today
  const todayCounts = counts[today] ?? {};
  for (const userId of Object.keys(todayCounts)) {
    users.delete(userId);
  }

  return Array.from(users);
}

function getEngagementStreak(counts: DailyCounts, userId: string): number {
  let streak = 0;
  for (let i = 1; i <= 30; i++) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    if ((counts[d]?.[userId] ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

function alreadySentToday(userId: string): boolean {
  if (!existsSync(ENGAGE_LOG_PATH)) return false;
  const today = todayKey();
  try {
    const lines = readFileSync(ENGAGE_LOG_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.user_id === userId && e.date === today) return true;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return false;
}

function buildMessage(userId: string, counts: DailyCounts): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

  // Word of the day (rotates daily)
  const word = WORDS[dayOfYear % WORDS.length];

  // Trivia (rotates daily, offset from word)
  const trivia = TRIVIA[(dayOfYear + 3) % TRIVIA.length];

  // Streak
  const streak = getEngagementStreak(counts, userId);
  const streakEmoji = streak === 0 ? '❄️' : streak < 3 ? '🔥' : streak < 7 ? '🔥🔥' : '🔥🔥🔥';

  const lines = [
    `☀️ *Sbah el kheir!* — Good morning from Achiri`,
    '',
    `📚 *Kilma jdida* — Word of the Day`,
    `   *${word.word}* (${word.latin}) — ${word.meaning}`,
    `   _"${word.example}"_`,
    '',
    `${trivia.q}`,
    `   → ${trivia.a}`,
    '',
    `${streakEmoji} Streak: *${streak}* day${streak !== 1 ? 's' : ''}`,
    '',
    `_Type /learn for a quiz · /tip for wisdom · /quiz for trivia_`,
  ];

  return lines.join('\n');
}

function sendTelegram(chatId: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Telegram ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  console.log(`[achiri-daily-engage] Starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  if (!BOT_TOKEN && !DRY_RUN) {
    console.error('[achiri-daily-engage] TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  const counts = loadDailyCounts();
  const activeUsers = getActiveUsers(counts).slice(0, MAX_PER_RUN);

  console.log(`[achiri-daily-engage] Active users (last ${ACTIVE_WINDOW_DAYS}d, not yet today): ${activeUsers.length}`);

  let sent = 0;
  for (const userId of activeUsers) {
    if (alreadySentToday(userId)) {
      console.log(`  Skip ${userId} — already sent today`);
      continue;
    }

    const msg = buildMessage(userId, counts);

    if (DRY_RUN) {
      console.log(`  [DRY] Would send to ${userId}:`);
      console.log(msg.split('\n').map(l => '    ' + l).join('\n'));
    } else {
      try {
        await sendTelegram(userId, msg);
        sent++;
        console.log(`  ✅ Sent to ${userId}`);
      } catch (err: any) {
        console.error(`  ❌ Failed ${userId}: ${err.message}`);
      }
    }

    // Log
    const logDir = join(CWD, 'workspace', 'achiri');
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const entry = { user_id: userId, date: todayKey(), timestamp: new Date().toISOString(), dry_run: DRY_RUN };
    appendFileSync(ENGAGE_LOG_PATH, JSON.stringify(entry) + '\n');
  }

  console.log(`[achiri-daily-engage] Done. Sent: ${sent}/${activeUsers.length}`);
}

main().catch(err => {
  console.error(`[achiri-daily-engage] Fatal: ${err.message}`);
  process.exit(1);
});
