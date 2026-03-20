#!/usr/bin/env ts-node
/**
 * Stripe Integration Test — Sprint 461
 *
 * Validates Stripe API connectivity, price IDs, and webhook setup.
 * Does NOT create charges or subscriptions — read-only checks.
 *
 * Usage: npx ts-node --transpile-only scripts/test-stripe.ts
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      // Strip inline comments and quotes
      let val = match[2].replace(/^["']|["']$/g, '').split('#')[0].trim();
      process.env[match[1]] = val;
    }
  }
}

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const PRICE_GROWTH = process.env.STRIPE_PRICE_GROWTH || '';
const PRICE_PREMIUM = process.env.STRIPE_PRICE_PREMIUM || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

function stripeGet(path: string): Promise<any> {
  const auth = Buffer.from(`${STRIPE_KEY}:`).toString('base64');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com',
      path,
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

export async function runStripeChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. API Key
  if (!STRIPE_KEY) {
    results.push({ name: 'API Key', status: 'fail', detail: 'STRIPE_SECRET_KEY not set' });
    return results; // Can't proceed without key
  }

  const isLive = STRIPE_KEY.startsWith('sk_live_');
  const isTest = STRIPE_KEY.startsWith('sk_test_');
  results.push({
    name: 'API Key',
    status: isLive || isTest ? 'pass' : 'fail',
    detail: isLive ? 'LIVE mode' : isTest ? 'TEST mode' : `Unknown key prefix`,
  });

  // 2. API connectivity — GET /v1/balance
  try {
    const balance = await stripeGet('/v1/balance');
    if (balance.status === 200) {
      const avail = (balance.body.available ?? []).map((a: any) => `${a.currency.toUpperCase()} ${(a.amount / 100).toFixed(2)}`).join(', ');
      results.push({ name: 'API Connection', status: 'pass', detail: `Balance: ${avail || '$0.00'}` });
    } else {
      results.push({ name: 'API Connection', status: 'fail', detail: `HTTP ${balance.status}: ${JSON.stringify(balance.body).slice(0, 100)}` });
    }
  } catch (e: any) {
    results.push({ name: 'API Connection', status: 'fail', detail: e.message });
  }

  // 3. Price IDs
  for (const [label, priceId] of [['Growth ($19/mo)', PRICE_GROWTH], ['Premium ($49/mo)', PRICE_PREMIUM]] as const) {
    if (!priceId) {
      results.push({ name: `Price: ${label}`, status: 'fail', detail: 'Price ID not set' });
      continue;
    }
    try {
      const res = await stripeGet(`/v1/prices/${priceId}`);
      if (res.status === 200) {
        const amount = res.body.unit_amount ? `$${(res.body.unit_amount / 100).toFixed(2)}` : '?';
        const interval = res.body.recurring?.interval ?? 'one-time';
        results.push({ name: `Price: ${label}`, status: 'pass', detail: `${amount}/${interval} — ${res.body.active ? 'active' : 'inactive'}` });
      } else {
        results.push({ name: `Price: ${label}`, status: 'fail', detail: `Not found (${res.status})` });
      }
    } catch (e: any) {
      results.push({ name: `Price: ${label}`, status: 'fail', detail: e.message });
    }
  }

  // 4. Webhook secret
  results.push({
    name: 'Webhook Secret',
    status: WEBHOOK_SECRET ? 'pass' : 'fail',
    detail: WEBHOOK_SECRET ? `Set (${WEBHOOK_SECRET.slice(0, 10)}...)` : 'STRIPE_WEBHOOK_SECRET not set',
  });

  // 5. Active subscriptions
  try {
    const subs = await stripeGet('/v1/subscriptions?limit=10&status=active');
    if (subs.status === 200) {
      const count = subs.body.data?.length ?? 0;
      const total = subs.body.has_more ? `${count}+` : `${count}`;
      results.push({ name: 'Active Subscriptions', status: 'pass', detail: `${total} active` });
    } else {
      results.push({ name: 'Active Subscriptions', status: 'skip', detail: `Could not list (${subs.status})` });
    }
  } catch (e: any) {
    results.push({ name: 'Active Subscriptions', status: 'skip', detail: e.message });
  }

  // 6. Checkout URLs
  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;
  results.push({
    name: 'Checkout URLs',
    status: successUrl && cancelUrl ? 'pass' : 'fail',
    detail: `success: ${successUrl ? 'set' : 'missing'} · cancel: ${cancelUrl ? 'set' : 'missing'}`,
  });

  return results;
}

export function formatStripeStatus(results: CheckResult[]): string {
  const lines: string[] = ['*💳 Stripe Integration Status*', ''];

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚪';
    lines.push(`${icon} *${r.name}*: ${r.detail}`);
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  lines.push('');
  lines.push(`*${passed}/${results.length}* checks passed${failed > 0 ? ` · ${failed} failed` : ''}`);

  if (failed > 0) {
    lines.push('');
    lines.push('*Next steps:*');
    for (const r of results.filter(r => r.status === 'fail')) {
      lines.push(`  • Fix: ${r.name}`);
    }
  }

  return lines.join('\n');
}

// CLI
if (require.main === module) {
  (async () => {
    console.log('💳 Stripe Integration Test\n');
    const results = await runStripeChecks();
    for (const r of results) {
      const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚪';
      console.log(`${icon} ${r.name}: ${r.detail}`);
    }
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    console.log(`\n${passed}/${results.length} checks passed${failed > 0 ? ` · ${failed} failed` : ''}`);
    process.exit(failed > 0 ? 1 : 0);
  })().catch(e => { console.error('Fatal:', e); process.exit(1); });
}
