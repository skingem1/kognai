/**
 * lemon-server.ts — Minimal Express server for LemonSqueezy webhooks
 * Sprint 1241 / LEMON-WIRE
 *
 * Run: npx tsx scripts/payments/lemon-server.ts
 * PM2: lemon-webhooks process
 */

import * as express from 'express';
import { lemonWebhookHandler } from './lemon-webhook';

const PORT = parseInt(process.env['LEMON_WEBHOOK_PORT'] ?? '3090', 10);

const app = express();

// LemonSqueezy sends JSON — use express.raw to get the raw body for HMAC verification
app.post('/webhooks/lemon', express.raw({ type: 'application/json' }), lemonWebhookHandler);

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'lemon-webhooks' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[lemon-server] Listening on 127.0.0.1:${PORT}`);
});
