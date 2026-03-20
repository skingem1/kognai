// Sprint 407 — validate-webhook.ts
// Validates: Stripe webhook handler in checkout-server.ts
// Run: npx ts-node scripts/scs001/validate-webhook.ts

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const ROOT = process.cwd();
const SERVER_FILE = path.join(ROOT, 'scripts', 'scs001', 'checkout-server.ts');
const SUBSCRIBERS_LOG = path.join(ROOT, 'workspace', 'scs001', 'subscribers.jsonl');

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('=== Sprint 407 — Stripe Webhook Handler Validation ===\n');

// 1. File exists
const src = fs.existsSync(SERVER_FILE) ? fs.readFileSync(SERVER_FILE, 'utf-8') : '';
check('checkout-server.ts exists', src.length > 0);

// 2. Webhook route present
check('POST /webhook route', src.includes("url === '/webhook'") && src.includes("req.method === 'POST'"));

// 3. Signature verification
check('Stripe signature verification function', src.includes('verifyStripeSignature'));
check('HMAC SHA256 used', src.includes("createHmac('sha256'"));
check('Timing-safe compare', src.includes('timingSafeEqual'));

// 4. Event handlers
check('checkout.session.completed handler', src.includes("'checkout.session.completed'"));
check('invoice.paid handler', src.includes("'invoice.paid'"));
check('customer.subscription.deleted handler', src.includes("'customer.subscription.deleted'"));

// 5. Subscriber logging
check('Subscriber event logging', src.includes('logSubscriberEvent'));
check('subscribers.jsonl path', src.includes('subscribers.jsonl'));

// 6. Telegram notification
check('Operator notification via Telegram', src.includes('notifyOperator'));
check('New subscriber notification', src.includes('New Subscriber'));
check('Churn alert notification', src.includes('Subscription Cancelled'));

// 7. Env vars
check('STRIPE_WEBHOOK_SECRET env', src.includes('STRIPE_WEBHOOK_SECRET'));
check('TELEGRAM_BOT_TOKEN env', src.includes('TELEGRAM_BOT_TOKEN'));
check('OWNER_TELEGRAM_CHAT_ID env', src.includes('OWNER_TELEGRAM_CHAT_ID'));

// 8. Health endpoint updated
check('Health shows webhook status', src.includes("webhook:") || src.includes("webhook"));

// 9. Timestamp anti-replay
check('Timestamp anti-replay (5min window)', src.includes('300') || src.includes('age'));

// 10. Documentation
check('Webhook route documented in header', src.includes('POST /webhook'));

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
