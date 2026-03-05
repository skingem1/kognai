#!/usr/bin/env ts-node
/**
 * run-ceo-bot.ts — Standalone CEO AI Bot process
 *
 * Runs the Invoica CEO executive bot (ceoBot.ts) as a dedicated PM2 process,
 * isolated from the backend API server.
 *
 * Why standalone:
 *   ceoBot has a process.exit(1) watchdog (recovers stuck Telegram poll loops).
 *   Running it inside the backend caused the API server to crash every ~2 min
 *   (4827 restarts in 6 days). Isolated here, it only restarts itself.
 *
 * PM2: ecosystem.config.js → ceo-ai-bot (autorestart: true)
 *      Uses CEO_TELEGRAM_BOT_TOKEN (same as ceoBot.ts)
 *
 * Note: scripts/telegram-bot.ts (simple status bot) has been retired —
 *       this AI bot handles all /report /status /help commands with full context.
 */

import 'dotenv/config';
import path from 'path';

// Resolve paths correctly whether running from /scripts or project root
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

// Import and start the CEO bot
import('../backend/src/telegram/ceoBot')
  .then(({ startCeoBot }) => startCeoBot())
  .catch((err) => {
    console.error('[ceo-bot] Fatal startup error:', err.message);
    process.exit(1);
  });

// Keep process alive (the poll loop inside startCeoBot handles restarts internally)
process.on('SIGTERM', () => {
  console.log('[ceo-bot] SIGTERM received — shutting down gracefully');
  process.exit(0);
});
