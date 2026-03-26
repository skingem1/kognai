/**
 * promo-command.ts — Sprint TICKET-008-PROMO-04
 *
 * Telegram /promo command handler.
 * Usage: /promo <marketplace_url>
 *
 * Flow:
 *   1. Validate URL
 *   2. Send progress messages (Scraping... / Writing script... / Rendering... / Done!)
 *   3. Run promo pipeline
 *   4. Send final.mp4 via Telegram sendVideo (or link if too large)
 */

import { join } from 'path';
import { existsSync, statSync } from 'fs';
import { randomBytes } from 'crypto';
import { hasCredits, deductCredit, getCredits, createStripePaymentLink, formatCreditMessage } from '../../scripts/promo/promo-credits';

const ROOT = join(__dirname, '..', '..');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');

// Import sendMessage from the bot module (already used in index.ts)
let _sendMessage: (chatId: number | string, text: string, opts?: { parse_mode?: string }) => Promise<void>;
let _sendVideo: (chatId: number | string, videoPath: string, caption: string) => Promise<void>;

function initBotFns() {
  if (!_sendMessage) {
    const bot = require('./bot');
    _sendMessage = bot.sendMessage;
    _sendVideo = bot.sendVideo ?? (async (chatId: any, videoPath: string, caption: string) => {
      // Fallback: send as document if sendVideo not available
      const bot2 = require('./bot');
      if (bot2.sendDocument) await bot2.sendDocument(chatId, videoPath, caption);
      else await _sendMessage(chatId, `Video ready: ${videoPath}\n${caption}`);
    });
  }
}

const STEP_MESSAGES: Record<string, string> = {
  scrape:    '🔍 Scraping product data...',
  script:    '✍️ Writing promotional script...',
  heygen:    '🎥 Rendering avatar video...',
  images:    '🖼️ Downloading product images...',
  composite: '🎬 Compositing final video...',
  done:      '✅ Done!',
};

export async function handlePromo(chatId: number | string, text: string, ownerChatId: string): Promise<void> {
  initBotFns();

  // Only owner can use /promo
  if (String(chatId) !== String(ownerChatId)) {
    await _sendMessage(chatId, '❌ /promo is owner-only.');
    return;
  }

  // Extract URL from command: /promo <url> or /promo dry-run <url>
  const parts = text.replace(/^\/promo\s*/i, '').trim().split(/\s+/);
  const dryRun = parts.includes('--dry-run') || parts.includes('dry-run');
  const url = parts.find(p => p.startsWith('http'));

  if (!url) {
    await _sendMessage(chatId, '❌ Usage: `/promo <marketplace_url>`\nExample: `/promo https://amazon.com/dp/B08N5W`');
    return;
  }

  // ── Credit gate ───────────────────────────────────────────────────────────
  const userId = String(chatId);
  if (!hasCredits(userId)) {
    const { url: paymentUrl, error: payErr } = createStripePaymentLink(userId);
    if (paymentUrl) {
      await _sendMessage(chatId,
        `💳 *No promo credits remaining*\nPurchase 10 videos for $9.99:\n${paymentUrl}`);
    } else {
      await _sendMessage(chatId,
        `❌ No credits remaining. Contact support to top up. (${payErr || 'payment link unavailable'})`);
    }
    return;
  }

  const jobId = `promo-${randomBytes(4).toString('hex')}`;
  const creditsBefore = getCredits(userId);
  await _sendMessage(chatId, `🚀 *Promo job started*\nJob: \`${jobId}\`\nURL: ${url.slice(0, 80)}\n${formatCreditMessage(creditsBefore)}${dryRun ? '\n⚠️ Dry-run mode' : ''}`);

  let lastStep = '';

  const onProgress = async (step: string, message: string) => {
    // Send progress update for each new step (not every poll tick)
    if (step !== lastStep) {
      const emoji = STEP_MESSAGES[step] || `📍 ${step}`;
      await _sendMessage(chatId, emoji).catch(() => {});
      lastStep = step;
    }
    // For heygen rendering, send the raw message to keep user informed
    if (step === 'heygen' && message.includes('rendering')) {
      await _sendMessage(chatId, `⏳ ${message}`).catch(() => {});
    }
    console.error(`[/promo] [${step}] ${message}`);
  };

  try {
    const { runPromo } = require('../../scripts/promo/pipelines/promo');
    const result = await runPromo(url, jobId, { dryRun, tone: 'enthusiastic', onProgress });

    if (!result.ok) {
      await _sendMessage(chatId, `❌ Pipeline failed: ${result.error?.slice(0, 200)}`);
      return;
    }

    const { outputPath, productName, durationS } = result.job!;

    if (!existsSync(outputPath)) {
      await _sendMessage(chatId, `❌ Output file not found: ${outputPath}`);
      return;
    }

    // Deduct credit on success
    const creditsAfter = deductCredit(userId);
    const sizeMb = (statSync(outputPath).size / 1024 / 1024).toFixed(1);
    const caption = `🎬 *${productName}*\nDuration: ${durationS}s | Size: ${sizeMb}MB\nJob: \`${jobId}\`\n${formatCreditMessage(creditsAfter)}`;

    // Telegram video limit is 50MB for sendVideo
    if (parseFloat(sizeMb) < 50 && _sendVideo) {
      try {
        await _sendVideo(chatId, outputPath, caption);
        return;
      } catch {}
    }

    // Fallback: text message with file path
    await _sendMessage(chatId, `${caption}\n📁 File: \`${outputPath}\``);
  } catch (err: any) {
    await _sendMessage(chatId, `❌ Error: ${err.message?.slice(0, 200)}`).catch(() => {});
    console.error('[/promo] Fatal:', err);
  }
}
