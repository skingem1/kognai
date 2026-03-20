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

import { getUpdates, getMe, sendMessage, TelegramUpdate } from './bot';
import {
  handleStart, handleHelp, handlePreview,
  handleSchedule, handleStats, handleStatus, handleSubscribe, handleUnknown,
  handleAchiri, handleGate, handleWaitlist, handleAchiriHealth, handlePostReminder,
  handleReview, handleRecord, handleUpdateViews, handleInviteAchiri, handleDeployStatus,
  handleStripeStatus, handleQueue, handleTiktokStatus, handlePostNow, handleCaption, handlePace,
  handleToday, handleViral, handlePm2Status, handlePostBatch, handleSendVideo,
  handleViralStats, handleCalendar, handleHealth, handlePreflight,
  handleTiktokAuth, handleAutoPost, handleVerifyPosts, handleActivate,
  handleAchiriStats,
  handleAchiriProfile,
  handleAchiriFeedback,
  handleAchiriExport,
  handleAchiriErrors,
  handleAchiriReady,
  handleAchiriRetention,
  handleAchiriQuality,
  handleAchiriAnalytics,
  handleAchiriTopics,
  handleDashboard,
  handleLastRun,
  handleMetrics,
  handleRevenue,
  handleDedup,
  handlePipeline,
  handleRunPipeline,
  handlePostPlan,
  handleTodayCaptions,
} from './commands';

// ── Config ────────────────────────────────────────────────────────────────────

const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN        || '';
const OWNER_CHAT_ID   = process.env.OWNER_TELEGRAM_CHAT_ID    || '';
const BETA_MODE       = true;  // flip to false when Stripe goes live + public launch

const OFFSET_FILE = path.join(process.cwd(), 'data', 'telegram-bot-offset.txt');

// Sprint 319: Bot username for @mention detection in group chats
let BOT_USERNAME = '';

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
  const senderId  = msg.from?.id ?? chatId;  // Sprint 319: sender's user ID
  const firstName = msg.from?.first_name ?? 'there';
  const username  = msg.from?.username;
  const text      = msg.text.trim();
  const chatType  = msg.chat.type ?? 'private';  // Sprint 319: private|group|supergroup
  const isGroup   = chatType === 'group' || chatType === 'supergroup';

  // Sprint 319: Group chat — only respond to Achiri @mentions or replies to the bot
  if (isGroup) {
    const mentionTag = BOT_USERNAME ? `@${BOT_USERNAME}` : '';
    const isMention = mentionTag && text.toLowerCase().includes(mentionTag.toLowerCase());
    const isReply = !!(msg as any).reply_to_message?.from?.is_bot;

    if (isMention || isReply) {
      // Strip @mention from text and route to Achiri
      let cleanText = text;
      if (mentionTag) cleanText = cleanText.replace(new RegExp(`@${BOT_USERNAME}\\b`, 'gi'), '').trim();
      // Strip /achiri prefix if present
      if (cleanText.toLowerCase().startsWith('/achiri')) cleanText = cleanText.slice('/achiri'.length).trim();
      if (!cleanText) {
        await sendMessage(chatId, 'Qouli chay 😊  Mention me with your message!');
        return;
      }
      await handleAchiri(chatId, cleanText, senderId);
      return;
    }
    // Ignore non-mention messages in groups
    return;
  }

  if (!isAuthorised(chatId)) {
    // Silently ignore unauthorised users during beta
    process.stdout.write(`[telegram-bot] Ignored unauthorised chatId ${chatId}\n`);
    return;
  }

  const cmd = text.split(/\s+/)[0].toLowerCase();

  switch (cmd) {
    case '/start':      await handleStart(chatId, firstName, username);   break;
    case '/help':       await handleHelp(chatId, OWNER_CHAT_ID);           break;
    case '/preview':    await handlePreview(chatId);                      break;
    case '/schedule':   await handleSchedule(chatId, text);               break;
    case '/status':     await handleStatus(chatId);                       break;
    case '/stats':      await handleStats(chatId);                        break;
    case '/subscribe':  await handleSubscribe(chatId, text.split(/\s+/)[1]); break;
    case '/achiri':     await handleAchiri(chatId, text.slice('/achiri'.length).trim(), senderId); break;
    case '/gate':       await handleGate(chatId);                         break;
    case '/waitlist':       await handleWaitlist(chatId, firstName, username, text.split(/\s+/)[1], OWNER_CHAT_ID); break;
    case '/achirihealth':   await handleAchiriHealth(chatId, OWNER_CHAT_ID);  break;
    case '/postreminder':   await handlePostReminder(chatId, OWNER_CHAT_ID);  break;
    case '/review':          await handleReview(chatId, OWNER_CHAT_ID);        break;
    case '/record':          await handleRecord(chatId, OWNER_CHAT_ID, text);        break;
    case '/updateviews':    await handleUpdateViews(chatId, OWNER_CHAT_ID, text);        break;
    case '/inviteachiri':   await handleInviteAchiri(chatId, OWNER_CHAT_ID, text);       break;
    case '/deploystatus':   await handleDeployStatus(chatId, OWNER_CHAT_ID);            break;
    case '/stripestatus':   await handleStripeStatus(chatId, OWNER_CHAT_ID);           break;
    case '/queue':           await handleQueue(chatId, OWNER_CHAT_ID);                  break;
    case '/tiktokstatus':   await handleTiktokStatus(chatId, OWNER_CHAT_ID);           break;
    case '/postnow':        await handlePostNow(chatId, OWNER_CHAT_ID);                break;
    case '/caption':         await handleCaption(chatId, OWNER_CHAT_ID, text.split(/\s+/)[1]); break;
    case '/pace':            await handlePace(chatId, OWNER_CHAT_ID);                    break;
    case '/today':           await handleToday(chatId, OWNER_CHAT_ID);                  break;
    case '/viral':           await handleViral(chatId, OWNER_CHAT_ID);                  break;
    case '/pm2status':      await handlePm2Status(chatId, OWNER_CHAT_ID);              break;
    case '/postbatch':      await handlePostBatch(chatId, OWNER_CHAT_ID, text);        break;
    case '/sendvideo':      await handleSendVideo(chatId, OWNER_CHAT_ID, text);        break;
    case '/viralstats':     await handleViralStats(chatId, OWNER_CHAT_ID);             break;
    case '/calendar':        await handleCalendar(chatId, OWNER_CHAT_ID);              break;
    case '/health':          await handleHealth(chatId, OWNER_CHAT_ID);                break;
    case '/preflight':       await handlePreflight(chatId, OWNER_CHAT_ID);             break;
    case '/tiktokauth':     await handleTiktokAuth(chatId, OWNER_CHAT_ID);            break;
    case '/autopost':       await handleAutoPost(chatId, OWNER_CHAT_ID, text);        break;
    case '/verifyposts':    await handleVerifyPosts(chatId, OWNER_CHAT_ID, text);     break;
    case '/activate':       await handleActivate(chatId, OWNER_CHAT_ID);              break;
    case '/achiriprofile':  await handleAchiriProfile(chatId);                         break;
    case '/achiristats':    await handleAchiriStats(chatId, OWNER_CHAT_ID);           break;
    case '/achirifeedback': await handleAchiriFeedback(chatId, OWNER_CHAT_ID);       break;
    case '/achiriexport':   await handleAchiriExport(chatId, OWNER_CHAT_ID, text);  break;
    case '/achirierrors':   await handleAchiriErrors(chatId, OWNER_CHAT_ID);        break;
    case '/achiriready':      await handleAchiriReady(chatId, OWNER_CHAT_ID);         break;
    case '/achiriretention': await handleAchiriRetention(chatId, OWNER_CHAT_ID);    break;
    case '/achiriquality':   await handleAchiriQuality(chatId, OWNER_CHAT_ID);      break;
    case '/achirianalytics': await handleAchiriAnalytics(chatId, OWNER_CHAT_ID);  break;
    case '/achiritopics':   await handleAchiriTopics(chatId, OWNER_CHAT_ID);    break;
    case '/dashboard':      await handleDashboard(chatId, OWNER_CHAT_ID);       break;
    case '/lastrun':        await handleLastRun(chatId, OWNER_CHAT_ID);              break;
    case '/metrics':        await handleMetrics(chatId, OWNER_CHAT_ID);              break;
    case '/revenue':        await handleRevenue(chatId, OWNER_CHAT_ID);              break;
    case '/dedup':          await handleDedup(chatId, OWNER_CHAT_ID, text);          break;
    case '/pipeline':       await handlePipeline(chatId, OWNER_CHAT_ID);            break;
    case '/runpipeline':    await handleRunPipeline(chatId, OWNER_CHAT_ID, text);  break;
    case '/postplan':       await handlePostPlan(chatId, OWNER_CHAT_ID);           break;
    case '/todaycaptions': await handleTodayCaptions(chatId, OWNER_CHAT_ID);     break;
    default:                 await handleUnknown(chatId, text);                          break;
  }
}

// ── Main polling loop ─────────────────────────────────────────────────────────

let running = true;

process.on('SIGTERM', () => { running = false; process.stdout.write('[telegram-bot] SIGTERM — shutting down\n'); });
process.on('SIGINT',  () => { running = false; process.stdout.write('[telegram-bot] SIGINT  — shutting down\n'); });

async function main(): Promise<void> {
  const me = await getMe();
  const username = me.result?.username ?? 'unknown';
  BOT_USERNAME = username;  // Sprint 319: store for @mention detection in groups
  process.stdout.write(`[telegram-bot] @${username} online (beta=${BETA_MODE}, groups=on)\n`);

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
