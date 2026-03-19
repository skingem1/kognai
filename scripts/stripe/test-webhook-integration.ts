#!/usr/bin/env npx ts-node
/**
 * Stripe Webhook Integration Test — Sprint 263
 *
 * Tests the webhook handler without hitting Stripe API:
 * 1. Signature verification (valid, invalid, expired timestamp)
 * 2. Event dispatch (subscription created, canceled, payment failed)
 * 3. Invalid JSON handling
 * 4. Missing signature header
 *
 * Usage: npx ts-node scripts/stripe/test-webhook-integration.ts
 */

import * as crypto from 'crypto';

// Set up test webhook secret before importing the module
const TEST_SECRET = 'whsec_test_secret_for_integration_test_1234567890';
process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET;

// We test the verifyStripeSignature and handleWebhookEvent functions directly.
// Import after env is set.
import { verifyStripeSignature, handleWebhookEvent } from '../../agents/stripe/webhooks';

let passed = 0;
let failed = 0;
let total = 0;

function check(name: string, condition: boolean, detail: string = '') {
  total++;
  if (condition) {
    console.log(`PASS [${name}]${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.error(`FAIL [${name}]${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSignature(body: string, timestamp: number, secret: string = TEST_SECRET): string {
  const signed = `${timestamp}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(signed, 'utf-8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

function makeEvent(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type,
    data: {
      object: {
        metadata: { chatId: '12345', plan: 'growth' },
        customer: 'cus_test123',
        ...data,
      },
    },
  });
}

// ── Signature verification tests ─────────────────────────────────────────────

async function testSignatureVerification() {
  console.log('\n--- Signature Verification ---\n');

  const body = makeEvent('customer.subscription.created');
  const now = Math.floor(Date.now() / 1000);

  // Valid signature
  const validSig = makeSignature(body, now);
  check('Valid signature accepted', verifyStripeSignature(body, validSig));

  // Invalid signature
  check('Invalid signature rejected', !verifyStripeSignature(body, `t=${now},v1=deadbeef0000000000000000000000000000000000000000000000000000abcd`));

  // Expired timestamp (>300s old)
  const oldTimestamp = now - 600;
  const expiredSig = makeSignature(body, oldTimestamp);
  check('Expired timestamp rejected', !verifyStripeSignature(body, expiredSig));

  // Missing v1 part
  check('Missing v1 rejected', !verifyStripeSignature(body, `t=${now}`));

  // Missing t part
  check('Missing timestamp rejected', !verifyStripeSignature(body, `v1=abcdef`));

  // Tampered body
  const tamperedBody = body.replace('growth', 'premium');
  check('Tampered body rejected', !verifyStripeSignature(tamperedBody, validSig));

  // Multiple v1 signatures (one valid)
  const wrongSig = 'deadbeef0000000000000000000000000000000000000000000000000000abcd';
  const correctHmac = crypto.createHmac('sha256', TEST_SECRET).update(`${now}.${body}`, 'utf-8').digest('hex');
  const multiSig = `t=${now},v1=${wrongSig},v1=${correctHmac}`;
  check('Multiple v1 with one valid accepted', verifyStripeSignature(body, multiSig));
}

// ── Event dispatch tests ─────────────────────────────────────────────────────

async function testEventDispatch() {
  console.log('\n--- Event Dispatch ---\n');

  const now = Math.floor(Date.now() / 1000);

  // Subscription created
  const createdBody = makeEvent('customer.subscription.created');
  const createdSig = makeSignature(createdBody, now);
  const createdResult = await handleWebhookEvent(createdBody, createdSig);
  check('subscription.created → 200', createdResult.status === 200, createdResult.message);

  // Checkout session completed
  const checkoutBody = makeEvent('checkout.session.completed');
  const checkoutSig = makeSignature(checkoutBody, now);
  const checkoutResult = await handleWebhookEvent(checkoutBody, checkoutSig);
  check('checkout.session.completed → 200', checkoutResult.status === 200, checkoutResult.message);

  // Subscription canceled
  const canceledBody = makeEvent('customer.subscription.deleted');
  const canceledSig = makeSignature(canceledBody, now);
  const canceledResult = await handleWebhookEvent(canceledBody, canceledSig);
  check('subscription.deleted → 200', canceledResult.status === 200, canceledResult.message);

  // Payment failed
  const failedBody = makeEvent('invoice.payment_failed');
  const failedSig = makeSignature(failedBody, now);
  const failedResult = await handleWebhookEvent(failedBody, failedSig);
  check('invoice.payment_failed → 200', failedResult.status === 200, failedResult.message);

  // Unhandled event type — should still 200 (ack)
  const unknownBody = makeEvent('some.unknown.event');
  const unknownSig = makeSignature(unknownBody, now);
  const unknownResult = await handleWebhookEvent(unknownBody, unknownSig);
  check('Unknown event → 200 (ack)', unknownResult.status === 200, unknownResult.message);

  // Invalid signature → 400
  const badResult = await handleWebhookEvent(createdBody, `t=${now},v1=0000000000000000000000000000000000000000000000000000000000000000`);
  check('Invalid signature → 400', badResult.status === 400, badResult.message);

  // Invalid JSON body (with valid-looking sig)
  const garbage = 'not json at all';
  const garbageSig = makeSignature(garbage, now);
  const garbageResult = await handleWebhookEvent(garbage, garbageSig);
  check('Invalid JSON → 400', garbageResult.status === 400, garbageResult.message);
}

// ── Run all ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Stripe Webhook Integration Test ===');

  await testSignatureVerification();
  await testEventDispatch();

  console.log(`\n--- Results: ${passed} passed, ${failed} failed out of ${total} ---`);
  if (failed > 0) {
    console.error('\nVALIDATION FAILED');
    process.exit(1);
  } else {
    console.log('\nVALIDATION PASSED');
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
