/**
 * checkout-server.ts — Sprint 402: Stripe checkout web endpoint
 *
 * Standalone HTTP server for TikTok bio link → Stripe checkout.
 * Serves a simple landing page and redirects to Stripe Checkout sessions.
 *
 * Routes:
 *   GET  /                   → Landing page with pricing
 *   GET  /checkout/growth    → Redirect to Stripe Checkout (Growth plan)
 *   GET  /checkout/premium   → Redirect to Stripe Checkout (Premium plan)
 *   POST /webhook            → Stripe webhook (signature verified)
 *   GET  /portal?customer=X  → Stripe billing portal (subscription management)
 *   GET  /health             → Health check
 *
 * Env:
 *   STRIPE_SECRET_KEY       — required
 *   STRIPE_WEBHOOK_SECRET   — webhook signature verification
 *   STRIPE_PRICE_GROWTH     — Stripe Price ID
 *   STRIPE_PRICE_PREMIUM    — Stripe Price ID
 *   STRIPE_SUCCESS_URL      — post-checkout redirect
 *   STRIPE_CANCEL_URL       — cancel redirect
 *   CHECKOUT_PORT           — default 3002
 *   TELEGRAM_BOT_TOKEN      — for operator notifications
 *   OWNER_TELEGRAM_CHAT_ID  — operator chat ID
 *
 * Usage: npx ts-node scripts/scs001/checkout-server.ts
 * PM2:   kognai-checkout-server
 */

import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const PORT        = parseInt(process.env.CHECKOUT_PORT || '3002', 10);
const STRIPE_KEY  = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || `http://localhost:${PORT}/success`;
const CANCEL_URL  = process.env.STRIPE_CANCEL_URL || 'https://t.me';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const OWNER_CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';

const SUBSCRIBERS_LOG = path.join(process.cwd(), 'workspace', 'scs001', 'subscribers.jsonl');

const PLANS: Record<string, { name: string; price_env: string; amount: string; features: string[] }> = {
  growth: {
    name: 'Growth',
    price_env: 'STRIPE_PRICE_GROWTH',
    amount: '$19/mo',
    features: ['5 AI-generated TikTok videos/day', 'Viral score optimization', 'Trending topic research', 'Caption generation'],
  },
  premium: {
    name: 'Premium',
    price_env: 'STRIPE_PRICE_PREMIUM',
    amount: '$49/mo',
    features: ['10 AI-generated TikTok videos/day', 'Everything in Growth', 'Priority video processing', 'Custom speaker selection', 'A/B hook testing'],
  },
};

// ── Stripe API ──────────────────────────────────────────────────────────

// Sprint 441: Free trial duration (days) — set 0 to disable
const FREE_TRIAL_DAYS = parseInt(process.env.STRIPE_TRIAL_DAYS || '3', 10);

function createCheckoutSession(priceId: string, plan: string): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      'metadata[plan]': plan,
      'metadata[source]': 'tiktok-bio',
    });
    // Sprint 441: Add free trial if configured
    if (FREE_TRIAL_DAYS > 0) {
      params.set('subscription_data[trial_period_days]', String(FREE_TRIAL_DAYS));
    }
    const payload = params.toString();
    const auth = Buffer.from(`${STRIPE_KEY}:`).toString('base64');

    const req = https.request({
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15_000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message ?? 'Stripe error'));
          else if (parsed.url) resolve({ url: parsed.url });
          else reject(new Error('No checkout URL in response'));
        } catch { reject(new Error('Invalid Stripe response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Stripe timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Landing page HTML ───────────────────────────────────────────────────

function landingPage(): string {
  const isLive = STRIPE_KEY.startsWith('sk_live_');
  const mode = isLive ? '' : '<span style="color:#e74c3c;font-size:12px;">[TEST MODE]</span>';
  const trialBadge = FREE_TRIAL_DAYS > 0 ? `<span class="trial-badge">${FREE_TRIAL_DAYS}-day free trial</span>` : '';
  const trialCta = FREE_TRIAL_DAYS > 0 ? `Start Free Trial` : 'Get Started';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI TikTok Content Agent — Grow on Autopilot</title>
  <meta name="description" content="AI-generated TikTok videos optimized for virality. Trending topics, viral hooks, captions — all automated.">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .hero { text-align: center; margin-bottom: 48px; }
    h1 { font-size: 2.2rem; line-height: 1.2; margin-bottom: 12px; }
    @media (max-width: 600px) { h1 { font-size: 1.6rem; } }
    .subtitle { color: #999; margin-bottom: 20px; font-size: 1.1rem; line-height: 1.5; }
    .trial-badge { display: inline-block; background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: #fff; padding: 6px 16px; border-radius: 20px; font-size: 0.9rem; font-weight: 600; margin-bottom: 8px; }
    .social-proof { display: flex; justify-content: center; gap: 24px; margin: 24px 0; flex-wrap: wrap; }
    .proof-item { text-align: center; }
    .proof-num { font-size: 1.5rem; font-weight: 700; color: #6c5ce7; }
    .proof-label { font-size: 0.8rem; color: #888; }
    .how-it-works { background: #111; border-radius: 16px; padding: 32px; margin-bottom: 40px; }
    .how-it-works h2 { font-size: 1.2rem; text-align: center; margin-bottom: 24px; color: #a29bfe; }
    .steps { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
    @media (max-width: 600px) { .steps { grid-template-columns: 1fr; } }
    .step { text-align: center; }
    .step-icon { font-size: 2rem; margin-bottom: 8px; }
    .step-title { font-weight: 600; margin-bottom: 4px; }
    .step-desc { color: #999; font-size: 0.85rem; line-height: 1.4; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
    @media (max-width: 600px) { .cards { grid-template-columns: 1fr; } }
    .card { background: #1a1a2e; border-radius: 16px; padding: 32px 24px; border: 1px solid #333; position: relative; }
    .card.featured { border-color: #6c5ce7; }
    .card.featured::before { content: "MOST POPULAR"; position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #6c5ce7; color: #fff; padding: 4px 16px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.5px; }
    .card h2 { font-size: 1.3rem; margin-bottom: 8px; }
    .price { font-size: 2rem; font-weight: bold; margin: 16px 0; }
    .price span { font-size: 1rem; color: #999; }
    ul { list-style: none; margin: 20px 0; }
    ul li { padding: 6px 0; color: #ccc; }
    ul li::before { content: "\\2713 "; color: #6c5ce7; font-weight: bold; }
    .btn { display: block; width: 100%; padding: 14px; background: #6c5ce7; color: #fff; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 1rem; transition: all 0.2s; }
    .btn:hover { background: #5a4bd1; transform: translateY(-1px); }
    .btn.secondary { background: transparent; border: 2px solid #6c5ce7; }
    .btn.secondary:hover { background: #6c5ce710; }
    .guarantee { text-align: center; margin-bottom: 32px; padding: 20px; background: #111; border-radius: 12px; }
    .guarantee-title { font-weight: 600; margin-bottom: 4px; }
    .guarantee-text { color: #999; font-size: 0.9rem; }
    .footer { text-align: center; color: #666; font-size: 0.85rem; }
    .footer a { color: #6c5ce7; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      ${trialBadge}
      <h1>Stop Creating. Start Growing. ${mode}</h1>
      <p class="subtitle">AI finds trending topics, generates viral TikTok videos, writes captions and hashtags — delivered daily to your phone. You just post.</p>
      <div class="social-proof">
        <div class="proof-item"><div class="proof-num">200+</div><div class="proof-label">Videos Generated</div></div>
        <div class="proof-item"><div class="proof-num">22</div><div class="proof-label">Content Sources</div></div>
        <div class="proof-item"><div class="proof-num">9</div><div class="proof-label">Platforms Supported</div></div>
      </div>
    </div>

    <div class="how-it-works">
      <h2>How It Works</h2>
      <div class="steps">
        <div class="step">
          <div class="step-icon">&#x1F50D;</div>
          <div class="step-title">AI Finds Trends</div>
          <div class="step-desc">Our AI scans 22+ sources daily for viral topics in your niche.</div>
        </div>
        <div class="step">
          <div class="step-icon">&#x1F3AC;</div>
          <div class="step-title">Videos Are Generated</div>
          <div class="step-desc">Clips are scored for virality, edited with hooks, and captioned — all automatically.</div>
        </div>
        <div class="step">
          <div class="step-icon">&#x1F4F1;</div>
          <div class="step-title">You Post &amp; Grow</div>
          <div class="step-desc">Get videos + captions on Telegram. Save, post to TikTok, and watch your audience grow.</div>
        </div>
      </div>
    </div>

    <div class="cards">
      <div class="card">
        <h2>Growth</h2>
        <div class="price">$19<span>/month</span></div>
        <ul>
          <li>5 AI videos per day</li>
          <li>Viral score optimization</li>
          <li>Trending topic research</li>
          <li>Caption + hashtag generation</li>
        </ul>
        <a href="/checkout/growth" class="btn secondary">${trialCta}</a>
      </div>
      <div class="card featured">
        <h2>Premium</h2>
        <div class="price">$49<span>/month</span></div>
        <ul>
          <li>10 AI videos per day</li>
          <li>Everything in Growth</li>
          <li>Priority processing</li>
          <li>Custom speaker selection</li>
          <li>A/B hook testing</li>
        </ul>
        <a href="/checkout/premium" class="btn">${trialCta}</a>
      </div>
    </div>

    <div class="guarantee">
      <div class="guarantee-title">Cancel anytime. No questions asked.</div>
      <div class="guarantee-text">${FREE_TRIAL_DAYS > 0 ? `Try free for ${FREE_TRIAL_DAYS} days. ` : ''}If it doesn't work for you, cancel in one click from your billing portal.</div>
    </div>

    <p class="footer">Powered by <a href="#">Kognai</a> &middot; AI-first content automation<br>Questions? <a href="https://t.me">Contact us on Telegram</a></p>
  </div>
</body>
</html>`;
}

// ── Success page (Sprint 410) ─────────────────────────────────────────────

function successPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome Aboard — AI TikTok Content Agent</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { max-width: 600px; padding: 40px 20px; text-align: center; }
    .check { font-size: 4rem; margin-bottom: 20px; }
    h1 { font-size: 2rem; margin-bottom: 12px; }
    .subtitle { color: #999; font-size: 1.1rem; margin-bottom: 32px; }
    .steps { text-align: left; background: #1a1a2e; border-radius: 16px; padding: 28px; margin-bottom: 28px; }
    .steps h2 { font-size: 1.1rem; margin-bottom: 16px; color: #6c5ce7; }
    .step { display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-start; }
    .step-num { background: #6c5ce7; color: #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem; flex-shrink: 0; }
    .step-text { color: #ccc; line-height: 1.5; }
    .step-text strong { color: #fff; }
    .btn { display: inline-block; padding: 14px 32px; background: #6c5ce7; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 1rem; transition: background 0.2s; margin: 8px; }
    .btn:hover { background: #5a4bd1; }
    .btn.secondary { background: transparent; border: 2px solid #6c5ce7; }
    .footer { margin-top: 28px; color: #666; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">✅</div>
    <h1>You're In!</h1>
    <p class="subtitle">Your subscription is active. AI-powered TikTok content is on the way.</p>
    <div class="steps">
      <h2>What happens next?</h2>
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text"><strong>Videos are being generated</strong> — our AI pipeline discovers trending topics, scores content for virality, and produces videos optimized for TikTok.</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text"><strong>Check your Telegram</strong> — your personalized videos will be delivered through our Telegram bot with ready-to-use captions and hashtags.</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text"><strong>Post and grow</strong> — save videos to your camera roll, post to TikTok, and watch your audience grow with AI-optimized content.</div>
      </div>
    </div>
    <a href="https://t.me" class="btn">Open Telegram</a>
    <a href="/" class="btn secondary">Back to Home</a>
    <p class="footer">Need help? Reply to any message in Telegram. · Manage subscription: <a href="/portal" style="color:#6c5ce7;">Billing Portal</a></p>
  </div>
</body>
</html>`;
}

// ── Stripe Webhook (Sprint 407) ──────────────────────────────────────────

function verifyStripeSignature(payload: string, sigHeader: string): boolean {
  if (!WEBHOOK_SECRET || !sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => { const [k, v] = p.split('='); return [k, v]; })
  );
  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) return false;

  // Reject timestamps older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > 300) return false;

  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

function logSubscriberEvent(event: Record<string, unknown>): void {
  const line = JSON.stringify({ ...event, logged_at: new Date().toISOString() });
  fs.appendFileSync(SUBSCRIBERS_LOG, line + '\n');
}

function notifyOperator(text: string): void {
  if (!TELEGRAM_TOKEN || !OWNER_CHAT_ID) return;
  const payload = JSON.stringify({ chat_id: OWNER_CHAT_ID, text, parse_mode: 'Markdown' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    timeout: 10_000,
  });
  req.on('error', (e) => console.error(`[webhook] Telegram notify error: ${e.message}`));
  req.write(payload);
  req.end();
}

function handleWebhookEvent(body: string): { status: number; message: string } {
  let event: any;
  try { event = JSON.parse(body); } catch { return { status: 400, message: 'Invalid JSON' }; }

  const type: string = event.type ?? '';
  const obj = event.data?.object ?? {};

  console.log(`[webhook] Event: ${type} id=${event.id ?? 'unknown'}`);

  switch (type) {
    case 'checkout.session.completed': {
      const email = obj.customer_email ?? obj.customer_details?.email ?? 'unknown';
      const plan = obj.metadata?.plan ?? 'unknown';
      const amount = obj.amount_total ? (obj.amount_total / 100).toFixed(2) : '?';
      const currency = (obj.currency ?? 'usd').toUpperCase();
      logSubscriberEvent({ type, email, plan, amount, currency, stripe_customer: obj.customer, subscription: obj.subscription });
      notifyOperator(`💰 *New Subscriber!*\n\nEmail: ${email}\nPlan: *${plan}*\nAmount: ${amount} ${currency}\n\n_Checkout completed via Stripe_`);
      break;
    }
    case 'invoice.paid': {
      const email = obj.customer_email ?? 'unknown';
      const amount = obj.amount_paid ? (obj.amount_paid / 100).toFixed(2) : '?';
      const currency = (obj.currency ?? 'usd').toUpperCase();
      logSubscriberEvent({ type, email, amount, currency, stripe_customer: obj.customer, subscription: obj.subscription });
      console.log(`[webhook] Invoice paid: ${email} ${amount} ${currency}`);
      break;
    }
    case 'customer.subscription.deleted': {
      const email = obj.metadata?.email ?? 'unknown';
      const plan = obj.metadata?.plan ?? 'unknown';
      logSubscriberEvent({ type, email, plan, stripe_customer: obj.customer, subscription: obj.id });
      notifyOperator(`⚠️ *Subscription Cancelled*\n\nCustomer: ${obj.customer}\nPlan: ${plan}\n\n_Churn alert — follow up?_`);
      break;
    }
    default:
      console.log(`[webhook] Unhandled event type: ${type}`);
      logSubscriberEvent({ type, unhandled: true });
  }

  return { status: 200, message: 'ok' };
}

// ── Stripe Billing Portal (Sprint 409) ───────────────────────────────────

function createBillingPortalSession(customerId: string): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      customer: customerId,
      return_url: `http://localhost:${PORT}/`,
    });
    const payload = params.toString();
    const auth = Buffer.from(`${STRIPE_KEY}:`).toString('base64');

    const req = https.request({
      hostname: 'api.stripe.com',
      path: '/v1/billing_portal/sessions',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15_000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message ?? 'Stripe portal error'));
          else if (parsed.url) resolve({ url: parsed.url });
          else reject(new Error('No portal URL in response'));
        } catch { reject(new Error('Invalid Stripe response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Stripe timeout')); });
    req.write(payload);
    req.end();
  });
}

// Look up Stripe customer ID by email
function findCustomerByEmail(email: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ email, limit: '1' });
    const auth = Buffer.from(`${STRIPE_KEY}:`).toString('base64');

    const req = https.request({
      hostname: 'api.stripe.com',
      path: `/v1/customers?${params.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` },
      timeout: 15_000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.data?.[0]?.id) resolve(parsed.data[0].id);
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Stripe timeout')); });
    req.end();
  });
}

// ── HTTP Server ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'checkout-server', stripe: STRIPE_KEY ? 'configured' : 'missing', webhook: WEBHOOK_SECRET ? 'configured' : 'missing' }));
    return;
  }

  // Sprint 407: Stripe webhook endpoint
  if (url === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      const sig = req.headers['stripe-signature'] as string ?? '';

      if (WEBHOOK_SECRET && !verifyStripeSignature(body, sig)) {
        console.error('[webhook] Signature verification failed');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }

      const result = handleWebhookEvent(body);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
    return;
  }

  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(landingPage());
    return;
  }

  // Sprint 410: Post-checkout success page
  if (url === '/success' || url.startsWith('/success?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(successPage());
    return;
  }

  // Sprint 409: /portal?customer=cus_xxx or /portal?email=user@example.com
  if (url.startsWith('/portal') && req.method === 'GET') {
    if (!STRIPE_KEY) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Stripe not configured.');
      return;
    }
    const params = new URL(url, `http://localhost:${PORT}`).searchParams;
    let customerId = params.get('customer') || '';
    const email = params.get('email') || '';

    try {
      if (!customerId && email) {
        customerId = (await findCustomerByEmail(email)) ?? '';
      }
      if (!customerId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing customer ID or email. Use /portal?customer=cus_xxx or /portal?email=user@example.com');
        return;
      }
      const session = await createBillingPortalSession(customerId);
      res.writeHead(303, { 'Location': session.url });
      res.end();
      console.log(`[portal] Redirected customer ${customerId} to billing portal`);
    } catch (err: any) {
      console.error(`[portal] Error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Unable to create portal session. Please try again.');
    }
    return;
  }

  // /checkout/growth or /checkout/premium
  const checkoutMatch = url.match(/^\/checkout\/(growth|premium)$/);
  if (checkoutMatch && req.method === 'GET') {
    const plan = checkoutMatch[1];
    const priceEnv = PLANS[plan]?.price_env;
    const priceId = priceEnv ? process.env[priceEnv] : '';

    if (!STRIPE_KEY) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Stripe not configured. Please contact support.');
      return;
    }
    if (!priceId) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end(`Price not configured for ${plan} plan. Please contact support.`);
      return;
    }

    try {
      const session = await createCheckoutSession(priceId, plan);
      res.writeHead(303, { 'Location': session.url });
      res.end();
      console.log(`[checkout] Redirected to Stripe Checkout: plan=${plan}`);
    } catch (err: any) {
      console.error(`[checkout] Error creating session: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Unable to create checkout session. Please try again.');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const mode = STRIPE_KEY.startsWith('sk_live_') ? 'LIVE' : STRIPE_KEY ? 'TEST' : 'NO KEY';
  console.log(`[checkout] Server on http://127.0.0.1:${PORT} (Stripe: ${mode})`);
  console.log(`[checkout] Landing:  http://localhost:${PORT}/`);
  console.log(`[checkout] Growth:   http://localhost:${PORT}/checkout/growth`);
  console.log(`[checkout] Premium:  http://localhost:${PORT}/checkout/premium`);
  console.log(`[checkout] Portal:   http://localhost:${PORT}/portal?email=<email>`);
  console.log(`[checkout] Webhook:  http://localhost:${PORT}/webhook (${WEBHOOK_SECRET ? 'signature ON' : 'signature OFF'})`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
