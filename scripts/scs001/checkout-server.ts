/**
 * checkout-server.ts — Sprint 402: Stripe checkout web endpoint
 *
 * Standalone HTTP server for TikTok bio link → Stripe checkout.
 * Serves a simple landing page and redirects to Stripe Checkout sessions.
 *
 * Routes:
 *   GET /                   → Landing page with pricing
 *   GET /checkout/growth    → Redirect to Stripe Checkout (Growth plan)
 *   GET /checkout/premium   → Redirect to Stripe Checkout (Premium plan)
 *   GET /health             → Health check
 *
 * Env:
 *   STRIPE_SECRET_KEY       — required
 *   STRIPE_PRICE_GROWTH     — Stripe Price ID
 *   STRIPE_PRICE_PREMIUM    — Stripe Price ID
 *   STRIPE_SUCCESS_URL      — post-checkout redirect
 *   STRIPE_CANCEL_URL       — cancel redirect
 *   CHECKOUT_PORT           — default 3002
 *
 * Usage: npx ts-node scripts/scs001/checkout-server.ts
 * PM2:   kognai-checkout-server
 */

import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const PORT        = parseInt(process.env.CHECKOUT_PORT || '3002', 10);
const STRIPE_KEY  = process.env.STRIPE_SECRET_KEY || '';
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || 'https://t.me';
const CANCEL_URL  = process.env.STRIPE_CANCEL_URL || 'https://t.me';

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI TikTok Content Agent</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 2rem; text-align: center; margin-bottom: 8px; }
    .subtitle { text-align: center; color: #999; margin-bottom: 40px; font-size: 1.1rem; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 600px) { .cards { grid-template-columns: 1fr; } }
    .card { background: #1a1a2e; border-radius: 16px; padding: 32px 24px; border: 1px solid #333; }
    .card.featured { border-color: #6c5ce7; }
    .card h2 { font-size: 1.3rem; margin-bottom: 8px; }
    .price { font-size: 2rem; font-weight: bold; margin: 16px 0; }
    .price span { font-size: 1rem; color: #999; }
    ul { list-style: none; margin: 20px 0; }
    ul li { padding: 6px 0; color: #ccc; }
    ul li::before { content: "✓ "; color: #6c5ce7; font-weight: bold; }
    .btn { display: block; width: 100%; padding: 14px; background: #6c5ce7; color: #fff; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 1rem; transition: background 0.2s; }
    .btn:hover { background: #5a4bd1; }
    .btn.secondary { background: transparent; border: 2px solid #6c5ce7; }
    .btn.secondary:hover { background: #6c5ce710; }
    .footer { text-align: center; margin-top: 40px; color: #666; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AI TikTok Content Agent ${mode}</h1>
    <p class="subtitle">AI-generated TikTok videos optimized for virality. Set it and grow.</p>
    <div class="cards">
      <div class="card">
        <h2>Growth</h2>
        <div class="price">$19<span>/month</span></div>
        <ul>
          <li>5 AI videos per day</li>
          <li>Viral score optimization</li>
          <li>Trending topic research</li>
          <li>Caption generation</li>
        </ul>
        <a href="/checkout/growth" class="btn secondary">Get Started</a>
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
        <a href="/checkout/premium" class="btn">Get Started</a>
      </div>
    </div>
    <p class="footer">Powered by Kognai · AI-first content automation</p>
  </div>
</body>
</html>`;
}

// ── HTTP Server ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'checkout-server', stripe: STRIPE_KEY ? 'configured' : 'missing' }));
    return;
  }

  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(landingPage());
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

server.listen(PORT, '0.0.0.0', () => {
  const mode = STRIPE_KEY.startsWith('sk_live_') ? 'LIVE' : STRIPE_KEY ? 'TEST' : 'NO KEY';
  console.log(`[checkout] Server on http://0.0.0.0:${PORT} (Stripe: ${mode})`);
  console.log(`[checkout] Landing: http://localhost:${PORT}/`);
  console.log(`[checkout] Growth:  http://localhost:${PORT}/checkout/growth`);
  console.log(`[checkout] Premium: http://localhost:${PORT}/checkout/premium`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
