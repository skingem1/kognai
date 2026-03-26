#!/usr/bin/env npx ts-node
/**
 * achiri-reengage.ts — Sprint 326
 * Identifies alpha users who haven't chatted in 3+ days and sends a friendly
 * Telegram check-in message to drive retention.
 *
 * Reads daily-counts.json for user activity history.
 * Tracks sent re-engagements in workspace/achiri/reengage-log.jsonl to avoid spam.
 *
 * PM2 cron: daily at 15:00 (afternoon in Tunisia)
 *   pm2 start scripts/achiri/achiri-reengage.ts --name achiri-reengage --cron "0 15 * * *" --no-autorestart
 *
 * Usage: npx ts-node scripts/achiri/achiri-reengage.ts [--dry-run]
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD = process.cwd();
const DAILY_COUNTS_PATH = join(CWD, 'workspace', 'achiri', 'daily-counts.json');
const REENGAGE_LOG_PATH = join(CWD, 'workspace', 'achiri', 'reengage-log.jsonl');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');

const LAPSE_DAYS = 3;        // Days of inactivity before re-engagement
const COOLDOWN_DAYS = 7;     // Don't re-engage same user within this many days
const MAX_PER_RUN = 5;       // Max users to re-engage per run

// Sprint 1417: Real Telegram chatIds are numeric (positive for users, negative for groups).
// Test/E2E users injected by validate-e2e-alpha.ts have IDs like 'e2e-test-...', 'e2e-safety-...',
// 'validate-sprint-...' — these fail with 400 "chat not found" when we try to message them.
const REAL_USER_REGEX = /^-?\d+$/;

// Check-in messages — casual, multilingual (Darija + French + English)
const CHECKIN_MESSAGES = [
  "Hey! 👋 Winek? Ma 7keytlich men zouz. Kifech el 7al?",
  "Salut! 😊 Ça fait quelques jours — tu vas bien? N'hésite pas à passer!",
  "Hey there! 👋 Haven't heard from you in a while. How's everything going?",
  "Aslema! 🌟 3andek chi jdid? Nesta7a9ou nta7kou 3la chi 7aja.",
  "Coucou! 💬 Tu me manques. Dis-moi quoi de neuf!",
];

interface ReengageEntry {
  userId: string;
  sentAt: string;
  message: string;
  daysLapsed: number;
}

function loadDailyCounts(): Record<string, Record<string, number>> {
  if (!existsSync(DAILY_COUNTS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DAILY_COUNTS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function loadReengageLog(): ReengageEntry[] {
  if (!existsSync(REENGAGE_LOG_PATH)) return [];
  return readFileSync(REENGAGE_LOG_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as ReengageEntry; } catch { return null; } })
    .filter(Boolean) as ReengageEntry[];
}

function getLastActiveDate(userId: string, counts: Record<string, Record<string, number>>): string | null {
  const dates = Object.keys(counts)
    .filter(d => (counts[d][userId] ?? 0) > 0)
    .sort()
    .reverse();
  return dates[0] ?? null;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.log(`[reengage] No BOT_TOKEN — would send to ${chatId}: ${text}`);
    return false;
  }
  if (DRY_RUN) {
    console.log(`[reengage] DRY RUN — would send to ${chatId}: ${text}`);
    return true;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[reengage] Telegram error ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[reengage] Send failed: ${(err as Error).message}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`[reengage] Achiri Re-engagement Check${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const counts = loadDailyCounts();
  const reengageLog = loadReengageLog();
  const today = new Date().toISOString().split('T')[0];

  // Find all unique users
  const allUsers = new Set<string>();
  for (const day of Object.values(counts)) {
    for (const userId of Object.keys(day)) {
      allUsers.add(userId);
    }
  }

  // Sprint 1417: filter out test/E2E synthetic user IDs — only real Telegram chatIds are numeric
  const allUsersRaw = allUsers.size;
  for (const userId of Array.from(allUsers)) {
    if (!REAL_USER_REGEX.test(userId)) allUsers.delete(userId);
  }
  if (allUsersRaw > allUsers.size) {
    console.log(`[reengage] Skipping ${allUsersRaw - allUsers.size} non-numeric test user(s) (e.g. e2e-test-*, validate-sprint-*)`);
  }

  console.log(`[reengage] Total unique users: ${allUsers.size}`);

  // Build cooldown set: users re-engaged within COOLDOWN_DAYS
  const recentlyEngaged = new Set<string>();
  for (const entry of reengageLog) {
    if (daysSince(entry.sentAt) < COOLDOWN_DAYS) {
      recentlyEngaged.add(entry.userId);
    }
  }

  // Find lapsed users
  const lapsedUsers: Array<{ userId: string; daysLapsed: number }> = [];
  for (const userId of Array.from(allUsers)) {
    if (recentlyEngaged.has(userId)) continue;

    const lastActive = getLastActiveDate(userId, counts);
    if (!lastActive) continue;

    const daysInactive = daysSince(lastActive);
    if (daysInactive >= LAPSE_DAYS) {
      lapsedUsers.push({ userId, daysLapsed: daysInactive });
    }
  }

  // Sort by most recently lapsed first (easier to re-engage)
  lapsedUsers.sort((a, b) => a.daysLapsed - b.daysLapsed);

  console.log(`[reengage] Lapsed users (${LAPSE_DAYS}+ days): ${lapsedUsers.length}`);
  console.log(`[reengage] In cooldown: ${recentlyEngaged.size}`);

  if (lapsedUsers.length === 0) {
    console.log('[reengage] No lapsed users to re-engage. Done.');
    return;
  }

  // Ensure log directory exists
  mkdirSync(join(CWD, 'workspace', 'achiri'), { recursive: true });

  let sent = 0;
  for (const user of lapsedUsers.slice(0, MAX_PER_RUN)) {
    // Pick a random check-in message
    const message = CHECKIN_MESSAGES[Math.floor(Math.random() * CHECKIN_MESSAGES.length)];

    const success = await sendTelegram(user.userId, message);
    if (success) {
      const entry: ReengageEntry = {
        userId: user.userId,
        sentAt: new Date().toISOString(),
        message,
        daysLapsed: user.daysLapsed,
      };
      appendFileSync(REENGAGE_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
      sent++;
      console.log(`[reengage] ✅ Sent to ${user.userId} (${user.daysLapsed}d lapsed)`);
    }
  }

  console.log(`[reengage] Done. Sent: ${sent}/${Math.min(lapsedUsers.length, MAX_PER_RUN)}`);
}

main().catch(e => { console.error(`[reengage] Error: ${e.message}`); process.exit(1); });
