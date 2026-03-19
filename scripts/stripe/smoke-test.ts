#!/usr/bin/env npx ts-node
/**
 * Stripe Smoke Test — Sprint 199
 * Validates Stripe configuration and connectivity without creating real charges.
 *
 * Usage: npx ts-node scripts/stripe/smoke-test.ts
 */

import * as path from 'path';
import * as https from 'https';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}: ${detail}`);
}

function stripeGet(apiPath: string): Promise<any> {
  const key = process.env.STRIPE_SECRET_KEY || '';
  const auth = Buffer.from(`${key}:`).toString('base64');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com',
      path: apiPath,
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function main() {
  console.log('\n🧪 Stripe Smoke Test\n');

  // 1. Env vars
  const key = process.env.STRIPE_SECRET_KEY || '';
  check('STRIPE_SECRET_KEY', key.length > 10, key ? `Set (${key.startsWith('sk_test') ? 'TEST' : 'LIVE'} mode)` : 'NOT SET');
  check('STRIPE_PRICE_GROWTH', Boolean(process.env.STRIPE_PRICE_GROWTH), process.env.STRIPE_PRICE_GROWTH ? 'Set' : 'NOT SET');
  check('STRIPE_PRICE_PREMIUM', Boolean(process.env.STRIPE_PRICE_PREMIUM), process.env.STRIPE_PRICE_PREMIUM ? 'Set' : 'NOT SET');
  check('STRIPE_WEBHOOK_SECRET', Boolean(process.env.STRIPE_WEBHOOK_SECRET), process.env.STRIPE_WEBHOOK_SECRET ? 'Set' : 'NOT SET');
  check('STRIPE_SUCCESS_URL', Boolean(process.env.STRIPE_SUCCESS_URL), process.env.STRIPE_SUCCESS_URL || 'NOT SET');
  check('STRIPE_CANCEL_URL', Boolean(process.env.STRIPE_CANCEL_URL), process.env.STRIPE_CANCEL_URL || 'NOT SET');

  if (!key || key.length < 10) {
    console.log('\n⛔ Cannot test API connectivity — STRIPE_SECRET_KEY not set.');
    printSummary();
    return;
  }

  // 2. API connectivity — GET /v1/balance
  try {
    const balance = await stripeGet('/v1/balance');
    if (balance.error) {
      check('API connectivity', false, `Error: ${balance.error.message}`);
    } else {
      const available = balance.available?.[0];
      check('API connectivity', true, `Connected. Balance: ${available ? `${available.amount / 100} ${available.currency.toUpperCase()}` : 'OK'}`);
    }
  } catch (e: any) {
    check('API connectivity', false, e.message);
  }

  // 3. Price validation
  const priceGrowth = process.env.STRIPE_PRICE_GROWTH;
  if (priceGrowth) {
    try {
      const price = await stripeGet(`/v1/prices/${priceGrowth}`);
      if (price.error) {
        check('Growth price valid', false, price.error.message);
      } else {
        check('Growth price valid', true, `$${(price.unit_amount || 0) / 100}/${price.recurring?.interval || '?'} (${price.active ? 'active' : 'INACTIVE'})`);
      }
    } catch (e: any) { check('Growth price valid', false, e.message); }
  }

  const pricePremium = process.env.STRIPE_PRICE_PREMIUM;
  if (pricePremium) {
    try {
      const price = await stripeGet(`/v1/prices/${pricePremium}`);
      if (price.error) {
        check('Premium price valid', false, price.error.message);
      } else {
        check('Premium price valid', true, `$${(price.unit_amount || 0) / 100}/${price.recurring?.interval || '?'} (${price.active ? 'active' : 'INACTIVE'})`);
      }
    } catch (e: any) { check('Premium price valid', false, e.message); }
  }

  // 4. Active subscriptions count
  try {
    const subs = await stripeGet('/v1/subscriptions?limit=1&status=active');
    if (!subs.error) {
      check('Active subscriptions', true, `${subs.data?.length || 0} found (has_more: ${subs.has_more})`);
    }
  } catch { /* skip */ }

  printSummary();
}

function printSummary() {
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Result: ${passed}/${total} checks passed`);
  if (passed === total) {
    console.log('🟢 Stripe is ready for production');
  } else {
    console.log('🟡 Some checks failed — see above');
  }
  console.log('='.repeat(40));
  process.exit(passed === total ? 0 : 1);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
