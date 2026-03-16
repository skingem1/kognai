// Kognai TikTok Content Agent — Telegram Bot Daemon
// Phase 1: long-polling, beta mode (owner-only), no PM2 yet
//
// Usage:
//   npx ts-node agents/telegram-bot/index.ts
//
// Env (from .env):
//   TELEGRAM_BOT_TOKEN       — required
//   OWNER_TELEGRAM_CHAT_ID   — required (beta gate: only owner can interact)
//
// Offset persisted to: data/telegram-bot-offset.txt

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

import { getUpdates, getMe, TelegramUpdate } from './bot';
import {
  handleStart, handleHelp, handlePreview,
  handleSchedule, handleStats, handleStatus, handleSubscribe, handleUnknown,
  handleAchiri, handleGate, handleWaitlist, handleAchiriHealth, handlePostReminder,
  handleReview,
} from './commands';

// ── Config ────────────────────────────────────────────────────────────────────

const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN        || '';
const OWNER_CHAT_ID   = process.env.OWNER_TELEGRAM_CHAT_ID    || '';
const BETA_MODE       = true;  // flip to false when Stripe goes live + public launch

const OFFSET_FILE = path.join(process.cwd(), 'data', 'telegram-bot-offset.txt');

if (!BOT_TOKEN) {
  console.error('[telegram-bot] TELEGRAM_BOT_TOKEN not set in .env');
  process.exit(1);
}
if (!OWNER_CHAT_ID) {
  console.error('[telegram-bot] OWNER_TELEGRAM_CHAT_ID not set in .env');
  process.exit(1);
}

// ── Offset persistence ────────────────────────────────────────────────────────

function loadOffset(): number {
  try {
    const raw = fs.readFileSync(OFFSET_FILE, 'utf-8').trim();
    return parseInt(raw, 10) || 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset: number): void {
  try {
    fs.mkdirSync(path.dirname(OFFSET_FILE), { recursive: true });
    fs.writeFileSync(OFFSET_FILE, String(offset), 'utf-8');
  } catch {
    // non-fatal
  }
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

function isAuthorised(chatId: number): boolean {
  if (!BETA_MODE) return true;
  return String(chatId) === String(OWNER_CHAT_ID);
}

// ── Update dispatcher ─────────────────────────────────────────────────────────

async function dispatch(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId    = msg.chat.id;
  const firstName = msg.from?.first_name ?? 'there';
  const username  = msg.from?.username;
  const text      = msg.text.trim();

  if (!isAuthorised(chatId)) {
    // Silently ignore unauthorised users during beta
    process.stdout.write(`[telegram-bot] Ignored unauthorised chatId ${chatId}\n`);
    return;
  }

  const cmd = text.split(/\s+/)[0].toLowerCase();

  switch (cmd) {
    case '/start':      await handleStart(chatId, firstName, username);   break;
    case '/help':       await handleHelp(chatId);                         break;
    case '/preview':    await handlePreview(chatId);                      break;
    case '/schedule':   await handleSchedule(chatId, text);               break;
    case '/status':     await handleStatus(chatId);                       break;
    case '/stats':      await handleStats(chatId);                        break;
    case '/subscribe':  await handleSubscribe(chatId, text.split(/\s+/)[1]); break;
    case '/achiri':     await handleAchiri(chatId, text.slice('/achiri'.length).trim()); break;
    case '/gate':       await handleGate(chatId);                         break;
    case '/waitlist':       await handleWaitlist(chatId, firstName, username, text.split(/\s+/)[1], OWNER_CHAT_ID); break;
    case '/achiri-health':   await handleAchiriHealth(chatId, OWNER_CHAT_ID);  break;
    case '/post-reminder':   await handlePostReminder(chatId, OWNER_CHAT_ID);  break;
    case '/review':          await handleReview(chatId, OWNER_CHAT_ID);        break;
    default:                 await handleUnknown(chatId, text);                break;
  }
}

// ── Main polling loop ─────────────────────────────────────────────────────────

let running = true;

process.on('SIGTERM', () => { running = false; process.stdout.write('[telegram-bot] SIGTERM — shutting down\n'); });
process.on('SIGINT',  () => { running = false; process.stdout.write('[telegram-bot] SIGINT  — shutting down\n'); });

async function main(): Promise<void> {
  const me = await getMe();
  const username = me.result?.username ?? 'unknown';
  process.stdout.write(`[telegram-bot] @${username} online (beta=${BETA_MODE})\n`);

  let offset = loadOffset();

  while (running) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;
        saveOffset(offset);

        try {
          await dispatch(update);
        } catch (err) {
          process.stderr.write(`[telegram-bot] dispatch error: ${(err as Error).message}\n`);
        }
      }
    } catch (err) {
      process.stderr.write(`[telegram-bot] poll error: ${(err as Error).message}\n`);
      // Brief back-off on network errors
      await new Promise(r => setTimeout(r, 5_000));
    }
  }

  process.stdout.write('[telegram-bot] Stopped.\n');
}

main().catch(err => {
  process.stderr.write(`[telegram-bot] Fatal: ${err.message}\n`);
  process.exit(1);
});
