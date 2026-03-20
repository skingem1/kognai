#!/usr/bin/env npx ts-node
/**
 * alpha-launch-notify.ts — Sprint 328
 * Sends alpha launch welcome message to all waitlisted users via Telegram.
 *
 * Reads workspace/achiri/waitlist.jsonl for user chat IDs.
 * Logs sent notifications to workspace/achiri/alpha-notify-log.jsonl.
 * Skips users who were already notified (idempotent).
 *
 * Usage:
 *   npx ts-node scripts/achiri/alpha-launch-notify.ts           # send to all
 *   npx ts-node scripts/achiri/alpha-launch-notify.ts --dry-run  # preview only
 *   npx ts-node scripts/achiri/alpha-launch-notify.ts --count    # just count
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD = process.cwd();
const WAITLIST_PATH = join(CWD, 'workspace', 'achiri', 'waitlist.jsonl');
const NOTIFY_LOG_PATH = join(CWD, 'workspace', 'achiri', 'alpha-notify-log.jsonl');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');
const COUNT_ONLY = process.argv.includes('--count');

interface WaitlistEntry {
  chatId: string;
  firstName: string;
  username?: string;
  joinedAt: string;
}

interface NotifyEntry {
  chatId: string;
  sentAt: string;
  success: boolean;
}

function loadWaitlist(): WaitlistEntry[] {
  if (!existsSync(WAITLIST_PATH)) return [];
  return readFileSync(WAITLIST_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as WaitlistEntry; } catch { return null; } })
    .filter(Boolean) as WaitlistEntry[];
}

function loadNotifyLog(): Set<string> {
  if (!existsSync(NOTIFY_LOG_PATH)) return new Set();
  const entries = readFileSync(NOTIFY_LOG_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as NotifyEntry; } catch { return null; } })
    .filter(Boolean) as NotifyEntry[];
  return new Set(entries.filter(e => e.success).map(e => e.chatId));
}

function buildWelcomeMessage(firstName: string): string {
  return [
    `🎉 Marhba ${firstName}!`,
    '',
    `Achiri Alpha is now LIVE! 🚀`,
    '',
    `You're one of the first to try Achiri — your AI companion that speaks your language.`,
    '',
    `Here's how to get started:`,
    `💬 Just send me a message — I'll chat in English, French, or Darija`,
    `🧠 I remember our conversations, so we can pick up where we left off`,
    `🎯 Ask me anything — studies, career, health, relationships, or just to chat`,
    '',
    `Some things to try:`,
    `• Tell me about yourself — I'll remember!`,
    `• Ask for study tips or career advice`,
    `• Chat in Darija — Ana nfhemek! 😄`,
    '',
    `As an alpha tester, your feedback helps shape Achiri.`,
    `After a few chats, I'll ask how it's going (1-5 rating).`,
    '',
    `Yalla, let's talk! 💬`,
  ].join('\n');
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.log(`[alpha-notify] No BOT_TOKEN set`);
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[alpha-notify] Telegram error for ${chatId}: ${res.status} ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[alpha-notify] Send failed for ${chatId}: ${(err as Error).message}`);
    return false;
  }
}

async function main(): Promise<void> {
  const waitlist = loadWaitlist();
  const alreadyNotified = loadNotifyLog();

  const pending = waitlist.filter(u => !alreadyNotified.has(u.chatId));

  console.log(`[alpha-notify] Waitlist: ${waitlist.length} | Already notified: ${alreadyNotified.size} | Pending: ${pending.length}`);

  if (COUNT_ONLY) return;

  if (pending.length === 0) {
    console.log('[alpha-notify] No new users to notify. Done.');
    return;
  }

  if (DRY_RUN) {
    console.log('[alpha-notify] DRY RUN — messages will NOT be sent');
    for (const user of pending) {
      console.log(`  Would notify: ${user.firstName} (${user.chatId})`);
    }
    return;
  }

  mkdirSync(join(CWD, 'workspace', 'achiri'), { recursive: true });

  let sent = 0;
  let failed = 0;

  for (const user of pending) {
    const message = buildWelcomeMessage(user.firstName);
    const success = await sendTelegram(user.chatId, message);

    const entry: NotifyEntry = {
      chatId: user.chatId,
      sentAt: new Date().toISOString(),
      success,
    };
    appendFileSync(NOTIFY_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');

    if (success) {
      sent++;
      console.log(`[alpha-notify] ✅ Notified: ${user.firstName} (${user.chatId})`);
    } else {
      failed++;
      console.log(`[alpha-notify] ❌ Failed: ${user.firstName} (${user.chatId})`);
    }

    // Small delay between messages to avoid rate limiting
    if (pending.length > 5) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`[alpha-notify] Done. Sent: ${sent}, Failed: ${failed}`);
}

main().catch(e => { console.error(`[alpha-notify] Error: ${e.message}`); process.exit(1); });
