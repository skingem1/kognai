// Stripe webhook handler — Phase 1 TikTok Content Agent
// Verifies Stripe-Signature using HMAC-SHA256 (no stripe npm package).
// Handles subscription lifecycle events, updates TelegramDB, notifies user via Telegram.
//
// Required env: STRIPE_WEBHOOK_SECRET (whsec_...)

import * as crypto from 'crypto';
import { TelegramDB, SubscriptionTier } from '../telegram-bot/db';
import { sendMessage } from '../telegram-bot/bot';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const TOLERANCE_SECS = 300;  // reject events older than 5 minutes

// ── Signature verification ────────────────────────────────────────────────────

export function verifyStripeSignature(rawBody: string, sigHeader: string): boolean {
  if (!WEBHOOK_SECRET) {
    process.stderr.write('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — skipping verification\n');
    return true;  // dev fallback: allow if no secret configured
  }

  // Header format: t=TIMESTAMP,v1=SIG1,v1=SIG2,...
  const parts     = sigHeader.split(',');
  const tPart     = parts.find(p => p.startsWith('t='));
  const v1Parts   = parts.filter(p => p.startsWith('v1='));

  if (!tPart || v1Parts.length === 0) return false;

  const timestamp = parseInt(tPart.slice(2), 10);
  const now       = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TOLERANCE_SECS) return false;

  const signed   = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(signed, 'utf-8')
    .digest('hex');

  return v1Parts.some(p => crypto.timingSafeEqual(
    Buffer.from(p.slice(3), 'hex'),
    Buffer.from(expected, 'hex')
  ));
}

// ── Event types we handle ─────────────────────────────────────────────────────

interface StripeEvent {
  type:   string;
  data:   { object: Record<string, unknown> };
}

function extractChatId(obj: Record<string, unknown>): number | null {
  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.chatId) return parseInt(meta.chatId, 10);
  // fallback: client_reference_id (set during checkout)
  const ref = obj.client_reference_id as string | undefined;
  if (ref) return parseInt(ref, 10);
  return null;
}

function planFromMetadata(obj: Record<string, unknown>): SubscriptionTier {
  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.plan === 'premium') return 'premium';
  if (meta?.plan === 'growth')  return 'growth';
  return 'free';
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function onSubscriptionCreated(obj: Record<string, unknown>): Promise<void> {
  const chatId = extractChatId(obj);
  if (!chatId) return;

  const tier            = planFromMetadata(obj);
  const stripeCustomerId = obj.customer as string | undefined;
  const existing        = TelegramDB.get(chatId);
  if (!existing) return;

  TelegramDB.upsert(chatId, { ...existing, tier, stripeCustomerId, active: true });

  const badge = tier === 'premium' ? '⭐ Premium' : '🚀 Growth';
  await sendMessage(chatId, [
    `🎉 *Subscription activated!*`,
    '',
    `You're now on the *${badge}* plan.`,
    `Your TikTok agent will start posting ${existing.postsPerDay} times/day once TikTok App Review is approved.`,
    '',
    'Type /stats to see pipeline activity.',
  ].join('\n'));
}

async function onSubscriptionCanceled(obj: Record<string, unknown>): Promise<void> {
  const chatId = extractChatId(obj);
  if (!chatId) return;

  const existing = TelegramDB.get(chatId);
  if (!existing) return;

  TelegramDB.upsert(chatId, { ...existing, tier: 'free', active: true });

  await sendMessage(chatId, [
    '📭 *Subscription cancelled.*',
    '',
    'You\'ve been moved to the Free plan (3 posts/day).',
    'You can resubscribe anytime with /subscribe.',
  ].join('\n'));
}

async function onPaymentFailed(obj: Record<string, unknown>): Promise<void> {
  const chatId = extractChatId(obj);
  if (!chatId) return;

  await sendMessage(chatId, [
    '⚠️ *Payment failed.*',
    '',
    'We couldn\'t process your subscription payment. Please update your payment method on Stripe.',
    'Your plan will downgrade to Free if not resolved within 3 days.',
  ].join('\n'));
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function handleWebhookEvent(rawBody: string, sigHeader: string): Promise<{ status: 200 | 400; message: string }> {
  if (!verifyStripeSignature(rawBody, sigHeader)) {
    return { status: 400, message: 'Invalid signature' };
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return { status: 400, message: 'Invalid JSON' };
  }

  const obj = event.data.object;

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'checkout.session.completed':
        await onSubscriptionCreated(obj);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionCanceled(obj);
        break;
      case 'invoice.payment_failed':
        await onPaymentFailed(obj);
        break;
      default:
        // Unhandled event — log and ack
        process.stdout.write(`[stripe-webhook] Unhandled event: ${event.type}\n`);
    }
  } catch (err) {
    process.stderr.write(`[stripe-webhook] Handler error for ${event.type}: ${(err as Error).message}\n`);
  }

  return { status: 200, message: 'ok' };
}
