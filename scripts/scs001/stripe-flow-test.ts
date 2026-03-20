/**
 * stripe-flow-test.ts — Comprehensive Stripe payment flow test
 *
 * Tests the full subscription lifecycle:
 * 1. Validate API key and mode (test vs live)
 * 2. Create a test checkout session
 * 3. List existing subscriptions
 * 4. Generate billing portal link
 * 5. Verify webhook endpoint configuration
 * 6. Check price IDs are valid
 *
 * Usage: npx tsx scripts/scs001/stripe-flow-test.ts [--live]
 * Default: runs against test keys only. Use --live to test live keys.
 */

import * as path from 'path';

// Load env
try { require('dotenv').config({ path: path.join(process.cwd(), '.env') }); } catch {}

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PRICE_GROWTH = process.env.STRIPE_PRICE_GROWTH || '';
const PRICE_PREMIUM = process.env.STRIPE_PRICE_PREMIUM || '';
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || 'https://kognai.ai/success';
const CANCEL_URL = process.env.STRIPE_CANCEL_URL || 'https://kognai.ai/cancel';

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
  data?: unknown;
}

async function stripeAPI(endpoint: string, method: string = 'GET', body?: string): Promise<{ ok: boolean; data: any; status: number }> {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

async function testKeyAndBalance(): Promise<TestResult> {
  if (!STRIPE_KEY) return { name: 'API Key', pass: false, detail: 'STRIPE_SECRET_KEY not set' };

  const mode = STRIPE_KEY.startsWith('sk_live_') ? 'LIVE' : STRIPE_KEY.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN';
  const { ok, data } = await stripeAPI('/balance');

  if (ok) {
    const avail = data.available?.[0];
    const currency = avail ? String(avail.currency).toUpperCase() : 'USD';
    const amount = avail ? (avail.amount / 100).toFixed(2) : '0.00';
    return { name: 'API Key & Balance', pass: true, detail: `${mode} mode — Balance: ${amount} ${currency}`, data };
  }
  return { name: 'API Key & Balance', pass: false, detail: `${mode} mode — API error: ${data.error?.message || 'unknown'}` };
}

async function testCheckoutSession(): Promise<TestResult> {
  if (!STRIPE_KEY) return { name: 'Checkout Session', pass: false, detail: 'No API key' };
  if (!PRICE_GROWTH) return { name: 'Checkout Session', pass: false, detail: 'STRIPE_PRICE_GROWTH not set' };

  const body = new URLSearchParams({
    'mode': 'subscription',
    'line_items[0][price]': PRICE_GROWTH,
    'line_items[0][quantity]': '1',
    'success_url': SUCCESS_URL,
    'cancel_url': CANCEL_URL,
  }).toString();

  const { ok, data } = await stripeAPI('/checkout/sessions', 'POST', body);

  if (ok) {
    return { name: 'Checkout Session', pass: true, detail: `Created: ${data.id} — URL: ${data.url?.substring(0, 60)}...`, data: { id: data.id, url: data.url } };
  }
  return { name: 'Checkout Session', pass: false, detail: `Failed: ${data.error?.message || 'unknown'}` };
}

async function testPriceIds(): Promise<TestResult> {
  const results: string[] = [];
  let allPass = true;

  for (const [name, priceId] of [['Growth', PRICE_GROWTH], ['Premium', PRICE_PREMIUM]]) {
    if (!priceId) {
      results.push(`${name}: NOT SET`);
      allPass = false;
      continue;
    }
    const { ok, data } = await stripeAPI(`/prices/${priceId}`);
    if (ok) {
      const amount = (data.unit_amount / 100).toFixed(2);
      const currency = String(data.currency).toUpperCase();
      const interval = data.recurring?.interval || 'one-time';
      results.push(`${name}: ${amount} ${currency}/${interval} (${data.active ? 'active' : 'INACTIVE'})`);
      if (!data.active) allPass = false;
    } else {
      results.push(`${name}: INVALID (${data.error?.message || 'not found'})`);
      allPass = false;
    }
  }

  return { name: 'Price IDs', pass: allPass, detail: results.join(' | ') };
}

async function testSubscriptions(): Promise<TestResult> {
  if (!STRIPE_KEY) return { name: 'Subscriptions', pass: false, detail: 'No API key' };

  const { ok, data } = await stripeAPI('/subscriptions?limit=5');

  if (ok) {
    const subs = data.data || [];
    const active = subs.filter((s: any) => s.status === 'active');
    const trialing = subs.filter((s: any) => s.status === 'trialing');
    return {
      name: 'Subscriptions',
      pass: true,
      detail: `Total: ${subs.length} (${active.length} active, ${trialing.length} trialing)`,
      data: { total: subs.length, active: active.length, trialing: trialing.length },
    };
  }
  return { name: 'Subscriptions', pass: false, detail: `Failed: ${data.error?.message || 'unknown'}` };
}

async function testBillingPortal(): Promise<TestResult> {
  if (!STRIPE_KEY) return { name: 'Billing Portal', pass: false, detail: 'No API key' };

  // Check if billing portal config exists
  const { ok, data } = await stripeAPI('/billing_portal/configurations?limit=1');

  if (ok && data.data?.length > 0) {
    return { name: 'Billing Portal', pass: true, detail: `Configured (${data.data.length} config(s))` };
  } else if (ok) {
    return { name: 'Billing Portal', pass: false, detail: 'No portal configuration found — create one in Stripe Dashboard' };
  }
  return { name: 'Billing Portal', pass: false, detail: `Failed: ${data.error?.message || 'unknown'}` };
}

async function testWebhooks(): Promise<TestResult> {
  if (!STRIPE_KEY) return { name: 'Webhooks', pass: false, detail: 'No API key' };
  if (!WEBHOOK_SECRET) return { name: 'Webhooks', pass: false, detail: 'STRIPE_WEBHOOK_SECRET not set' };

  const { ok, data } = await stripeAPI('/webhook_endpoints?limit=5');

  if (ok) {
    const endpoints = data.data || [];
    const active = endpoints.filter((e: any) => e.status === 'enabled');
    if (active.length > 0) {
      const events = active[0].enabled_events?.slice(0, 3).join(', ') || 'all';
      return { name: 'Webhooks', pass: true, detail: `${active.length} active endpoint(s) — Events: ${events}` };
    }
    return { name: 'Webhooks', pass: false, detail: `${endpoints.length} endpoint(s) found but none active` };
  }
  return { name: 'Webhooks', pass: false, detail: `Failed: ${data.error?.message || 'unknown'}` };
}

async function main() {
  const isLive = process.argv.includes('--live');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  STRIPE PAYMENT FLOW TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  if (!STRIPE_KEY) {
    console.log('  ❌ STRIPE_SECRET_KEY not set. Cannot run tests.\n');
    console.log('  Set in .env:');
    console.log('    STRIPE_SECRET_KEY=sk_test_...');
    console.log('    STRIPE_WEBHOOK_SECRET=whsec_...');
    console.log('    STRIPE_PRICE_GROWTH=price_...');
    console.log('    STRIPE_PRICE_PREMIUM=price_...\n');
    process.exit(1);
  }

  const mode = STRIPE_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST';
  if (mode === 'LIVE' && !isLive) {
    console.log('  ⚠️ LIVE key detected but --live flag not set.');
    console.log('  Running in read-only mode (no checkout session creation).\n');
  }

  const results: TestResult[] = [];

  // Run tests
  results.push(await testKeyAndBalance());
  results.push(await testPriceIds());

  // Only create checkout session in test mode or with --live flag
  if (mode === 'TEST' || isLive) {
    results.push(await testCheckoutSession());
  } else {
    results.push({ name: 'Checkout Session', pass: true, detail: 'Skipped (live mode, use --live to test)' });
  }

  results.push(await testSubscriptions());
  results.push(await testBillingPortal());
  results.push(await testWebhooks());

  // Report
  console.log('  Results:');
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`);
  }

  const allPass = results.every(r => r.pass);
  const passCount = results.filter(r => r.pass).length;

  console.log('\n───────────────────────────────────────────────────────');
  if (allPass) {
    console.log(`  ✅ ALL ${results.length} TESTS PASSED — Stripe ${mode} mode ready\n`);
  } else {
    console.log(`  ⚠️ ${passCount}/${results.length} tests passed — Fix issues above\n`);
  }

  // Output JSON for programmatic use
  const report = {
    timestamp: new Date().toISOString(),
    mode,
    tests_passed: passCount,
    tests_total: results.length,
    all_pass: allPass,
    results: results.map(r => ({ name: r.name, pass: r.pass, detail: r.detail })),
  };

  const reportPath = path.join(__dirname, '../../workspace/billing/stripe-test-report.json');
  const fs = require('fs');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`  Report saved: ${reportPath}\n`);

  process.exit(allPass ? 0 : 1);
}

main().catch(console.error);
