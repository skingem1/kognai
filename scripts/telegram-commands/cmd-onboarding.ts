/**
 * cmd-onboarding.ts — Telegram /start onboarding flow
 * Sprint 471: TikTok bio → kognai.ai/start → Telegram → 7-day trial → Stripe
 *
 * Flow:
 * 1. User clicks TikTok bio link → kognai.ai/start → redirects to t.me/KognaiBot?start=tiktok
 * 2. Telegram bot receives /start [source] → triggers onboarding
 * 3. Welcome message + what Kognai does + trial offer
 * 4. User clicks "Start Free Trial" → Stripe checkout with 7-day trial
 * 5. On success → user added to subscribers list
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { sendMessage } from './telegram-api';
import { ROOT } from './shared';

const FUNNEL_EVENTS_PATH = path.join(ROOT, 'workspace/billing/funnel-events.jsonl');
const SUBSCRIBERS_PATH = path.join(ROOT, 'workspace/billing/subscribers.json');

interface FunnelEvent {
  timestamp: string;
  event: string;
  chat_id: string;
  source: string;
  data?: Record<string, unknown>;
}

function logFunnelEvent(event: FunnelEvent): void {
  try {
    fs.mkdirSync(path.dirname(FUNNEL_EVENTS_PATH), { recursive: true });
    fs.appendFileSync(FUNNEL_EVENTS_PATH, JSON.stringify(event) + '\n');
  } catch {}
}

/**
 * Handle /start command — main onboarding entry point
 * Triggered when user opens bot from TikTok bio link or direct
 */
export async function cmdStart(chatId: string, args: string): Promise<void> {
  const source = args.trim() || 'direct';

  // Log funnel event
  logFunnelEvent({
    timestamp: new Date().toISOString(),
    event: 'start',
    chat_id: chatId,
    source,
  });

  // Welcome message
  const welcome = [
    '*Welcome to Kognai* 🎬',
    '',
    'Kognai creates TikTok & YouTube Shorts videos for you automatically.',
    '',
    '*How it works:*',
    '1. We find trending topics in your niche',
    '2. AI writes a viral script with hook optimization',
    '3. We produce a professional short-form video',
    '4. You review and post — or we auto-publish',
    '',
    '*What you get:*',
    '• 10+ videos per week, ready to post',
    '• Viral hook formulas from top creators',
    '• A/B tested formats (split-screen, reaction, greenscreen)',
    '• Performance analytics & optimization',
    '',
    '*Start your 7-day free trial* — no credit card required to explore.',
    '',
    'Commands:',
    '`/trial` — Start 7-day free trial',
    '`/plans` — View subscription plans',
    '`/demo` — See a sample video',
    '`/help` — All available commands',
  ].join('\n');

  await sendMessage(chatId, welcome);
}

/**
 * /trial — Start 7-day free trial via Stripe checkout
 */
export async function cmdTrial(chatId: string): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const priceGrowth = process.env.STRIPE_PRICE_GROWTH || '';

  logFunnelEvent({
    timestamp: new Date().toISOString(),
    event: 'trial_click',
    chat_id: chatId,
    source: 'telegram',
  });

  if (!stripeKey || !priceGrowth) {
    await sendMessage(chatId, [
      '*Free Trial*',
      '',
      'The trial system is being set up. In the meantime:',
      '',
      '1. Send `/demo` to see a sample video',
      '2. Send `/plans` to view pricing',
      "3. We'll notify you when trials are live!",
      '',
      '_Your interest has been recorded._',
    ].join('\n'));

    // Log interest for manual follow-up
    logFunnelEvent({
      timestamp: new Date().toISOString(),
      event: 'trial_interest_no_stripe',
      chat_id: chatId,
      source: 'telegram',
    });
    return;
  }

  // Create Stripe checkout session with 7-day trial
  const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://kognai.ai/success';
  const cancelUrl = process.env.STRIPE_CANCEL_URL || 'https://kognai.ai/cancel';

  const body = new URLSearchParams({
    'mode': 'subscription',
    'line_items[0][price]': priceGrowth,
    'line_items[0][quantity]': '1',
    'subscription_data[trial_period_days]': '7',
    'success_url': successUrl,
    'cancel_url': cancelUrl,
    'metadata[chat_id]': chatId,
    'metadata[source]': 'telegram_trial',
  }).toString();

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json() as any;

    if (res.ok && data.url) {
      logFunnelEvent({
        timestamp: new Date().toISOString(),
        event: 'checkout_created',
        chat_id: chatId,
        source: 'telegram',
        data: { session_id: data.id },
      });

      await sendMessage(chatId, [
        '*Start Your 7-Day Free Trial*',
        '',
        `[Click here to activate your trial](${data.url})`,
        '',
        '• 7 days free — cancel anytime',
        '• Growth plan: €19/mo after trial',
        '• 10+ videos per week',
        '',
        "_You won't be charged during the trial period._",
      ].join('\n'));
    } else {
      await sendMessage(chatId, `⚠️ Could not create trial session. Error: ${data.error?.message || 'unknown'}`);
    }
  } catch (e: any) {
    await sendMessage(chatId, `❌ Network error: ${e.message}`);
  }
}

/**
 * /plans — Show subscription plans
 */
export async function cmdPlans(chatId: string): Promise<void> {
  logFunnelEvent({
    timestamp: new Date().toISOString(),
    event: 'plans_view',
    chat_id: chatId,
    source: 'telegram',
  });

  const plans = [
    '*Kognai Plans*',
    '',
    '*Growth* — €19/mo',
    '• 10 videos per week',
    '• 3 video templates',
    '• Hook optimization',
    '• Basic analytics',
    '• 7-day free trial',
    '',
    '*Premium* — €49/mo',
    '• 25 videos per week',
    '• All templates + custom',
    '• Advanced A/B testing',
    '• Priority support',
    '• Multi-platform publishing',
    '• 7-day free trial',
    '',
    'Start with `/trial` for 7 days free.',
    'Or `/checkout growth` / `/checkout premium` to subscribe directly.',
  ].join('\n');

  await sendMessage(chatId, plans);
}
