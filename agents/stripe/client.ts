// Stripe API client — Phase 1 TikTok Content Agent
// Raw HTTPS — no stripe npm package required.
// Stripe v1 API uses Basic auth + application/x-www-form-urlencoded bodies.
//
// Required env vars:
//   STRIPE_SECRET_KEY        — sk_test_... (test) or sk_live_... (production)
//   STRIPE_PRICE_GROWTH      — Stripe Price ID for Growth plan ($19/mo)
//   STRIPE_PRICE_PREMIUM     — Stripe Price ID for Premium plan ($49/mo)
//   STRIPE_SUCCESS_URL       — redirect URL after payment (e.g. https://t.me/YOUR_BOT)
//   STRIPE_CANCEL_URL        — redirect URL on cancel

import * as https from 'https';

const STRIPE_KEY     = process.env.STRIPE_SECRET_KEY   || '';
const STRIPE_HOST    = 'api.stripe.com';

export type SubscriptionPlan = 'growth' | 'premium';

export interface CheckoutSession {
  id:  string;
  url: string;
}

export interface StripeSubscription {
  id:     string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | string;
  plan:   SubscriptionPlan;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function encodeForm(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

function stripeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, string | number>
): Promise<Record<string, unknown>> {
  const payload = body ? encodeForm(body) : '';
  const auth    = Buffer.from(`${STRIPE_KEY}:`).toString('base64');

  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      'Authorization': `Basic ${auth}`,
      'Accept':        'application/json',
    };
    if (payload) {
      headers['Content-Type']   = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(
      { hostname: STRIPE_HOST, path, method, headers, timeout: 15_000 },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try { resolve(JSON.parse(data) as Record<string, unknown>); }
          catch { reject(new Error(`Stripe: invalid JSON — ${data.slice(0, 100)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Stripe: request timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Price ID resolver ─────────────────────────────────────────────────────────

function priceId(plan: SubscriptionPlan): string {
  if (plan === 'growth')  return process.env.STRIPE_PRICE_GROWTH  || '';
  if (plan === 'premium') return process.env.STRIPE_PRICE_PREMIUM || '';
  return '';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session for a subscription plan.
 * chatId is stored in metadata so the webhook handler can map payment → subscriber.
 */
export async function createCheckoutSession(
  plan: SubscriptionPlan,
  chatId: number
): Promise<CheckoutSession> {
  if (!STRIPE_KEY) throw new Error('[stripe] STRIPE_SECRET_KEY not set');

  const price = priceId(plan);
  if (!price) throw new Error(`[stripe] STRIPE_PRICE_${plan.toUpperCase()} not set`);

  const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://t.me';
  const cancelUrl  = process.env.STRIPE_CANCEL_URL  || 'https://t.me';

  const res = await stripeRequest('POST', '/v1/checkout/sessions', {
    mode:                    'subscription',
    'line_items[0][price]':  price,
    'line_items[0][quantity]': 1,
    success_url:             successUrl,
    cancel_url:              cancelUrl,
    'metadata[chatId]':      String(chatId),
    'metadata[plan]':        plan,
    client_reference_id:     String(chatId),
  });

  if (res.error) {
    const err = res.error as { message?: string };
    throw new Error(`[stripe] Checkout session error: ${err.message ?? JSON.stringify(res.error)}`);
  }

  return { id: res.id as string, url: res.url as string };
}

/**
 * Cancel a Stripe subscription immediately.
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  if (!STRIPE_KEY) throw new Error('[stripe] STRIPE_SECRET_KEY not set');
  await stripeRequest('DELETE', `/v1/subscriptions/${subscriptionId}`);
}

/**
 * Retrieve a subscription by ID.
 */
export async function getSubscription(subscriptionId: string): Promise<{ status: string }> {
  const res = await stripeRequest('GET', `/v1/subscriptions/${subscriptionId}`);
  return { status: res.status as string };
}

/**
 * Returns true if Stripe is configured (key set).
 */
export function isConfigured(): boolean {
  return Boolean(STRIPE_KEY);
}
