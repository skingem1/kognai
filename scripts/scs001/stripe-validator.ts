#!/usr/bin/env npx ts-node
/**
 * stripe-validator.ts — Sprint 311
 * Stripe go-live validator — verifies Stripe keys and reports status.
 *
 * Checks:
 * - STRIPE_SECRET_KEY is set and valid (test API call)
 * - STRIPE_WEBHOOK_SECRET is set
 * - Price IDs are configured
 * - Reports live vs test mode
 *
 * Usage: npx ts-node scripts/scs001/stripe-validator.ts
 * Exit 0 = Stripe ready, Exit 1 = issues found
 */

import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PRICE_GROWTH = process.env.STRIPE_PRICE_GROWTH || '';
const PRICE_PREMIUM = process.env.STRIPE_PRICE_PREMIUM || '';
const BOT_TOKEN = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const OWNER_CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

async function sendTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN || !OWNER_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: OWNER_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch {}
}

async function validateStripeKey(): Promise<{ valid: boolean; mode: string; detail: string }> {
  if (!STRIPE_KEY) return { valid: false, mode: 'none', detail: 'STRIPE_SECRET_KEY not set' };

  const mode = STRIPE_KEY.startsWith('sk_live_') ? 'LIVE' : STRIPE_KEY.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN';

  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}` },
    });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      const avail = data.available as Array<Record<string, unknown>> | undefined;
      const available = avail?.[0];
      const currency = available ? String(available.currency || 'usd').toUpperCase() : 'USD';
      const amount = available ? (Number(available.amount) / 100).toFixed(2) : '0.00';
      return { valid: true, mode, detail: `Balance: ${amount} ${currency}` };
    } else {
      const err = await res.json().catch(() => ({}));
      return { valid: false, mode, detail: `API error: ${(err as Record<string, unknown>).error || res.status}` };
    }
  } catch (e) {
    return { valid: false, mode, detail: `Network error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function main(): Promise<void> {
  const checks: Check[] = [];

  // Validate Stripe key
  const keyResult = await validateStripeKey();
  checks.push({
    name: 'Stripe Secret Key',
    pass: keyResult.valid,
    detail: `${keyResult.mode} — ${keyResult.detail}`,
  });

  // Webhook secret
  checks.push({
    name: 'Webhook Secret',
    pass: !!WEBHOOK_SECRET,
    detail: WEBHOOK_SECRET ? 'SET' : 'MISSING',
  });

  // Price IDs
  checks.push({
    name: 'Growth Price ID',
    pass: !!PRICE_GROWTH,
    detail: PRICE_GROWTH ? `${PRICE_GROWTH.slice(0, 15)}...` : 'MISSING',
  });
  checks.push({
    name: 'Premium Price ID',
    pass: !!PRICE_PREMIUM,
    detail: PRICE_PREMIUM ? `${PRICE_PREMIUM.slice(0, 15)}...` : 'MISSING',
  });

  // Report
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  STRIPE GO-LIVE VALIDATION');
  console.log('══════════════════════════════════════════════════════\n');

  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }

  const allPass = checks.every(c => c.pass);
  const isLive = keyResult.mode === 'LIVE';

  console.log('\n──────────────────────────────────────────────────────');
  if (allPass && isLive) {
    console.log('  ✅ STRIPE LIVE — Ready to accept payments\n');
  } else if (allPass && !isLive) {
    console.log('  ⚠️ STRIPE TEST MODE — Switch to live key for production\n');
  } else {
    console.log('  ❌ STRIPE NOT READY — Fix issues above\n');
  }

  // Send Telegram summary
  const modeIcon = isLive ? '🟢' : '🟡';
  const statusLine = allPass
    ? `${modeIcon} Stripe ${keyResult.mode} mode — ${keyResult.detail}`
    : `❌ Stripe issues: ${checks.filter(c => !c.pass).map(c => c.name).join(', ')}`;

  await sendTelegram(`*Stripe Status*\n${statusLine}`);

  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
