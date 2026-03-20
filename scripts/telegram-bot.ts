#!/usr/bin/env ts-node

/**
 * Kognai Telegram Bot — Thin Router
 *
 * Sprint 496: Refactored from 2193-line monolith to ~400-line router.
 * All command implementations live in telegram-commands/*.ts modules.
 *
 * Run via PM2 (autorestart: true, not cron-based).
 */

import * as fs from 'fs';
import * as path from 'path';

// Sprint 496: Import Telegram API from shared module
import {
  BOT_TOKEN, OWNER_CHAT_ID, AUDIT_LOG, ROOT,
  telegramRequest, getUpdates, sendMessage, sendMessageWithButtons,
  answerCallbackQuery, sendVideoFile, sendVideoWithButtons,
} from './telegram-commands/telegram-api';

// Sprint 455: Import extracted command modules (Part 1: A-M)
import { cmdPm2, cmdHealth, cmdTier, cmdSprint, cmdReport, cmdCrons, cmdTikTokAuth, cmdQuickStart, cmdEnvCheck, cmdStripeStatus, cmdReadiness, cmdGitStats, cmdBoot, cmdShutdown, cmdReload, cmdSwarmStats } from './telegram-commands/cmd-system';
import { cmdGate, cmdGoLive, cmdAudit, cmdStreak, cmdPace, cmdCalendar } from './telegram-commands/cmd-gate';
import { cmdRecord, cmdQueue, cmdReview, cmdCaption, cmdPosted, cmdOnboard, cmdPipeline, cmdToday, cmdAnalytics, cmdDiversity, cmdThumbnail, cmdCompetitor } from './telegram-commands/cmd-content';
import { cmdMetrics, cmdPostPlan, cmdYouTube, cmdAutoPost, cmdLastRun, cmdViral, cmdDashboard, cmdDigest, cmdSchedule, cmdLeaderboard, cmdBestTime, cmdHookTest, cmdHookStats, cmdViralStats, cmdQueueOpt, cmdGateAnalytics, cmdRevenue, cmdBatch, cmdPostLog, cmdXPost } from './telegram-commands/cmd-posting';
import { cmdHistory, cmdArchive, cmdUnarchive, cmdStale, cmdPurge, cmdNote, cmdUpdateViews, cmdExport, cmdWeeklyReport, cmdSpeakerTest, cmdFilmKit, cmdContentPlan, cmdSuggest, cmdCompare, cmdScorecard, cmdProgress, cmdCleanup, cmdDedup, cmdTop30, cmdAbResults, cmdStatus } from './telegram-commands/cmd-management';
import { cmdHelp } from './telegram-commands/cmd-help';

// Sprint 496: Import extracted command modules (Part 2: N-Z + interactive)
import { cmdSession, cmdDone, cmdEndSession, cmdMenu } from './telegram-commands/cmd-session';
import { cmdDeliver, cmdPublish, cmdPostNow, cmdPickup, cmdTodayCaptions, cmdBroadcast, cmdRefresh, cmdProduce, cmdInstagram } from './telegram-commands/cmd-delivery';
import { cmdCheckout, cmdSubscribers, cmdPortal, cmdFunnel, cmdAchiri, cmdTestStripe, cmdUsage } from './telegram-commands/cmd-stripe';
import { cmdStart, cmdTrial, cmdPlans } from './telegram-commands/cmd-onboarding';

// ─── Env validation ──────────────────────────────────────────────────

if (!BOT_TOKEN) { console.error('[Bot] CEO_TELEGRAM_BOT_TOKEN not set'); process.exit(1); }
if (!OWNER_CHAT_ID) { console.error('[Bot] OWNER_TELEGRAM_CHAT_ID not set'); process.exit(1); }

// ─── Offset management ──────────────────────────────────────────────

const OFFSET_FILE = path.join(ROOT, 'data', 'telegram-bot-offset.txt');

function loadOffset(): number {
  try { return parseInt(fs.readFileSync(OFFSET_FILE, 'utf-8').trim(), 10) || 0; } catch { return 0; }
}

function saveOffset(offset: number): void {
  try { fs.writeFileSync(OFFSET_FILE, String(offset)); } catch {}
}

// ─── Command router ─────────────────────────────────────────────────

async function handleCommand(chatId: string, text: string): Promise<void> {
  const cmd = text.split('@')[0].toLowerCase().trim();
  console.log(`[Bot] Command from ${chatId}: ${cmd}`);

  if (chatId !== OWNER_CHAT_ID) {
    await sendMessage(chatId, '🔒 Unauthorized.');
    return;
  }

  const spaceIdx = text.indexOf(' ');
  const cmdName = spaceIdx === -1 ? cmd : text.slice(0, spaceIdx).split('@')[0].toLowerCase().trim();
  const cmdArgs = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();

  // ── Async commands (send multiple messages / videos / spawn processes) ──

  const asyncHandlers: Record<string, () => Promise<void>> = {
    '/refresh':      () => cmdRefresh(chatId),
    '/produce':      () => cmdProduce(chatId),
    '/postnow':      () => cmdPostNow(chatId),
    '/todaycaptions': () => cmdTodayCaptions(chatId),
    '/broadcast':    () => cmdBroadcast(chatId, cmdArgs),
    '/menu':         () => cmdMenu(chatId),
    '/boot':         () => cmdBoot(chatId),
    '/reload':       () => cmdReload(chatId),
    '/shutdown':     () => cmdShutdown(chatId),
    '/pickup':       () => cmdPickup(chatId),
    '/session':      () => cmdSession(chatId),
    '/done':         () => cmdDone(chatId),
    '/endsession':   () => cmdEndSession(chatId),
    '/publish':      () => cmdPublish(chatId, cmdArgs),
    '/deliver':      async () => { const r = await cmdDeliver(chatId, cmdArgs); await sendMessage(chatId, r); },
    '/checkout':     () => cmdCheckout(chatId, cmdArgs),
    '/subscribers':  () => cmdSubscribers(chatId),
    '/stripestatus': async () => { const r = await cmdStripeStatus(); await sendMessage(chatId, r); },
    '/test-stripe':  () => cmdTestStripe(chatId),
    '/teststripe':   () => cmdTestStripe(chatId),
    '/start':        () => cmdStart(chatId, cmdArgs),
    '/trial':        () => cmdTrial(chatId),
    '/plans':        () => cmdPlans(chatId),
    '/instagram':    () => cmdInstagram(chatId, cmdArgs),
  };

  const asyncHandler = asyncHandlers[cmdName];
  if (asyncHandler) {
    try {
      await asyncHandler();
    } catch (e: any) {
      await sendMessage(chatId, `❌ ${cmdName.slice(1)} error: ${e.message?.slice(0, 200)}`);
    }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
    return;
  }

  // ── Sync commands (return string response) ──

  let response: string;
  switch (cmdName) {
    case '/report':  response = cmdReport(); break;
    case '/pm2':     response = cmdPm2();    break;
    case '/health':  response = cmdHealth(); break;
    case '/tier':    response = cmdTier();   break;
    case '/sprint':  response = cmdSprint(); break;
    case '/gate':    response = cmdGate();   break;
    case '/record':  response = cmdRecord(cmdArgs); break;
    case '/posted':  response = cmdPosted(); break;
    case '/tiktokauth': response = cmdTikTokAuth(); break;
    case '/crons':      response = cmdCrons(); break;
    case '/queue':   response = cmdQueue();  break;
    case '/review':  response = cmdReview(); break;
    case '/caption': response = cmdCaption(cmdArgs); break;
    case '/streak':    response = cmdStreak(); break;
    case '/analytics': response = cmdAnalytics(); break;
    case '/onboard':   response = cmdOnboard(); break;
    case '/pipeline':  response = cmdPipeline(); break;
    case '/today':     response = cmdToday();  break;
    case '/calendar':  response = cmdCalendar(); break;
    case '/golive':    response = cmdGoLive();  break;
    case '/audit':      response = cmdAudit();      break;
    case '/quickstart':  response = cmdQuickStart();  break;
    case '/schedule':    response = cmdSchedule();    break;
    case '/leaderboard': response = cmdLeaderboard(); break;
    case '/updateviews': response = cmdUpdateViews(cmdArgs); break;
    case '/achiri':      response = cmdAchiri();             break;
    case '/digest':      response = cmdDigest();             break;
    case '/metrics':     response = cmdMetrics();            break;
    case '/pace':        response = cmdPace();               break;
    case '/revenue':     response = cmdRevenue();            break;
    case '/autopost':    response = cmdAutoPost();           break;
    case '/lastrun':     response = cmdLastRun();            break;
    case '/viral':       response = cmdViral();              break;
    case '/postplan':    response = cmdPostPlan();           break;
    case '/dashboard':   response = cmdDashboard();          break;
    case '/viralstats':  response = cmdViralStats();         break;
    case '/hookstats':   response = cmdHookStats();          break;
    case '/queueopt':    response = cmdQueueOpt();           break;
    case '/gateanalytics': response = cmdGateAnalytics();   break;
    case '/youtube':     response = cmdYouTube();            break;
    case '/portal':      response = cmdPortal(cmdArgs);        break;
    case '/funnel':      response = cmdFunnel();              break;
    case '/hooktest':    response = cmdHookTest();            break;
    case '/besttime':    response = cmdBestTime();            break;
    case '/export':      response = cmdExport(cmdArgs);       break;
    case '/weeklyreport': response = cmdWeeklyReport();       break;
    case '/speakertest': response = cmdSpeakerTest();        break;
    case '/contentplan': response = cmdContentPlan();        break;
    case '/filmkit':     response = cmdFilmKit();            break;
    case '/progress':    response = cmdProgress();           break;
    case '/scorecard':   response = cmdScorecard();          break;
    case '/compare':     response = cmdCompare(cmdArgs);     break;
    case '/suggest':     response = cmdSuggest();            break;
    case '/history':     response = cmdHistory();            break;
    case '/archive':     response = cmdArchive(cmdArgs);     break;
    case '/unarchive':   response = cmdUnarchive(cmdArgs);   break;
    case '/stale':       response = cmdStale(cmdArgs);       break;
    case '/purge':       response = cmdPurge(cmdArgs);       break;
    case '/note':        response = cmdNote(cmdArgs);        break;
    case '/status':      response = cmdStatus();             break;
    case '/dedup':       response = cmdDedup();              break;
    case '/top30':       response = cmdTop30();              break;
    case '/abresults':   response = cmdAbResults();          break;
    case '/cleanup':     response = cmdCleanup();            break;
    case '/envcheck':    response = cmdEnvCheck();           break;
    case '/batch':       response = cmdBatch(cmdArgs);       break;
    case '/postlog':     response = cmdPostLog();            break;
    case '/readiness':   response = cmdReadiness();          break;
    case '/gitstats':    response = cmdGitStats();           break;
    case '/thumbnail':   response = cmdThumbnail(cmdArgs);   break;
    case '/diversity':   response = cmdDiversity();          break;
    case '/competitor':  response = cmdCompetitor(cmdArgs);  break;
    case '/swarmstats': response = cmdSwarmStats();          break;
    case '/xpost':      response = cmdXPost(cmdArgs);        break;
    case '/usage':      response = cmdUsage();               break;
    case '/help':        response = cmdHelp();        break;
    default:
      response = `Unknown command: \`${cmdName}\`\n\n${cmdHelp()}`;
  }

  // Inline keyboard buttons for key commands
  const buttonMap: Record<string, Array<Array<{ text: string; callback_data: string }>>> = {
    '/digest': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '📊 Gate', callback_data: 'cmd:/gate' }],
      [{ text: '🔄 Refresh', callback_data: 'cmd:/refresh' }, { text: '📈 History', callback_data: 'cmd:/history' }],
    ],
    '/gate': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '🔥 Streak', callback_data: 'cmd:/streak' }],
      [{ text: '📋 Queue', callback_data: 'cmd:/queue' }, { text: '📅 Today', callback_data: 'cmd:/today' }],
    ],
    '/today': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '💡 Suggest', callback_data: 'cmd:/suggest' }],
      [{ text: '🎬 Film Kit', callback_data: 'cmd:/filmkit' }, { text: '📋 Digest', callback_data: 'cmd:/digest' }],
    ],
    '/queue': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '📦 Deliver 3', callback_data: 'cmd:/deliver 3' }],
    ],
    '/status': [
      [{ text: '🎬 Pickup', callback_data: 'cmd:/pickup' }, { text: '📋 Queue', callback_data: 'cmd:/queue' }],
      [{ text: '📊 Progress', callback_data: 'cmd:/progress' }, { text: '🔄 Refresh', callback_data: 'cmd:/refresh' }],
    ],
    '/progress': [
      [{ text: '🎬 Pickup', callback_data: 'cmd:/pickup' }, { text: '📋 Queue', callback_data: 'cmd:/queue' }],
    ],
    '/help': [
      [{ text: '🎬 Pickup', callback_data: 'cmd:/pickup' }, { text: '📊 Gate', callback_data: 'cmd:/gate' }],
      [{ text: '📋 Digest', callback_data: 'cmd:/digest' }, { text: '🔄 Refresh', callback_data: 'cmd:/refresh' }],
    ],
    '/dashboard': [
      [{ text: '📦 Deliver 1', callback_data: 'cmd:/deliver 1' }, { text: '🎬 Session', callback_data: 'cmd:/session' }],
      [{ text: '📊 Gate', callback_data: 'cmd:/gate' }, { text: '🤖 Achiri', callback_data: 'cmd:/achiri' }],
      [{ text: '🔄 Refresh', callback_data: 'cmd:/refresh' }, { text: '📈 A/B Results', callback_data: 'cmd:/abresults' }],
    ],
  };

  const buttons = buttonMap[cmdName];

  try {
    if (buttons) {
      await sendMessageWithButtons(chatId, response, buttons);
    } else {
      await sendMessage(chatId, response);
    }
  } catch (e: any) {
    if (response.length > 4000) {
      await sendMessage(chatId, response.slice(0, 3900) + '\n\n_(truncated)_');
    } else {
      try { await sendMessage(chatId, response); } catch { throw e; }
    }
  }

  const timestamp = new Date().toISOString();
  fs.appendFileSync(AUDIT_LOG, `[${timestamp}] [TELEGRAM_BOT] Command: ${cmd} from ${chatId}\n`);
}

// ─── Bot command registration ────────────────────────────────────────

async function registerBotCommands(): Promise<void> {
  const commands = [
    { command: 'menu', description: 'Quick access button menu' },
    { command: 'deliver', description: 'Send top videos for posting' },
    { command: 'gate', description: 'Phase 1.5 gate countdown' },
    { command: 'streak', description: 'Posting streak + pace' },
    { command: 'queue', description: 'Unposted videos ranked by score' },
    { command: 'today', description: 'Daily posting brief' },
    { command: 'record', description: 'Record a manual TikTok post' },
    { command: 'posted', description: 'Mark last video as posted' },
    { command: 'digest', description: 'Morning digest: gate + pipeline' },
    { command: 'autopost', description: 'Auto-post readiness status' },
    { command: 'analytics', description: 'Content performance insights' },
    { command: 'lastrun', description: 'Latest pipeline run report' },
    { command: 'status', description: 'Full system status overview' },
    { command: 'golive', description: 'Go-live readiness checklist' },
    { command: 'revenue', description: 'Revenue dashboard + MRR' },
    { command: 'schedule', description: 'Today\'s posting time slots' },
    { command: 'quickstart', description: 'Post first video in 5 min' },
    { command: 'boot', description: 'Start all essential PM2 crons' },
    { command: 'publish', description: 'One-tap publish to TikTok+IG+YouTube' },
    { command: 'cleanup', description: 'Archive old runs, free disk space' },
    { command: 'help', description: 'List all commands' },
  ];
  try {
    await telegramRequest('setMyCommands', { commands });
    console.log(`[Bot] Registered ${commands.length} commands for autocomplete`);
  } catch (err: any) {
    console.warn(`[Bot] setMyCommands failed (non-fatal): ${err.message}`);
  }
}

// ─── Polling loop ────────────────────────────────────────────────────

async function poll(): Promise<void> {
  let offset = loadOffset();
  let backoffMs = 1000;

  console.log(`[Bot] Starting Telegram bot — polling for updates (offset: ${offset})`);
  console.log(`[Bot] Owner chat ID: ${OWNER_CHAT_ID}`);

  await registerBotCommands();

  while (true) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);

        if (update.callback_query) {
          const cb = update.callback_query;
          const cbChatId = String(cb.message?.chat?.id ?? '');
          const cbData: string = cb.data ?? '';
          if (cbChatId && cbData.startsWith('cmd:')) {
            const cbCmd = cbData.slice(4);
            answerCallbackQuery(cb.id, 'Running...').catch(() => {});
            await handleCommand(cbChatId, cbCmd).catch((e: any) => {
              console.error(`[Bot] Callback handler error: ${e.message}`);
            });
          }
          if (cbChatId && cbData.startsWith('posted:')) {
            const videoId = cbData.slice(7);
            answerCallbackQuery(cb.id, 'Recording post...').catch(() => {});
            await handleCommand(cbChatId, `/record ${videoId} 0`).catch((e: any) => {
              console.error(`[Bot] Posted callback error: ${e.message}`);
            });
          }
          continue;
        }

        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        const text: string = msg.text;

        if (text.startsWith('/')) {
          await handleCommand(chatId, text).catch((e: any) => {
            console.error(`[Bot] Handler error: ${e.message}`);
          });
        }
      }

      if (updates.length > 0) {
        saveOffset(offset);
      }

      backoffMs = 1000;
    } catch (e: any) {
      console.error(`[Bot] Poll error: ${e.message}`);
      await new Promise(r => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60000);
    }
  }
}

// ─── Entry ───────────────────────────────────────────────────────────

poll().catch(err => {
  console.error('[Bot] Fatal:', err);
  process.exit(1);
});
