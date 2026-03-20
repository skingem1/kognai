// Stripe webhook HTTP server — Phase 1 TikTok Content Agent
// Listens on STRIPE_WEBHOOK_PORT (default 3001).
// For local dev: use `stripe listen --forward-to localhost:3001/webhook`
//
// Usage: npx ts-node agents/stripe/server.ts

import * as http from 'http';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

import { handleWebhookEvent } from './webhooks';

const PORT = parseInt(process.env.STRIPE_WEBHOOK_PORT || '3001', 10);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'stripe-webhook' }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let rawBody = '';
  req.on('data', (chunk: Buffer) => (rawBody += chunk.toString()));
  req.on('end', async () => {
    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      res.writeHead(400);
      res.end('Missing Stripe-Signature header');
      return;
    }

    try {
      const result = await handleWebhookEvent(rawBody, sig);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: result.message }));
    } catch (err) {
      process.stderr.write(`[stripe-server] Unhandled error: ${(err as Error).message}\n`);
      res.writeHead(500);
      res.end('Internal error');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const mem = process.memoryUsage();
  const rss = (mem.rss / 1024 / 1024).toFixed(1);
  const heap = (mem.heapUsed / 1024 / 1024).toFixed(1);
  process.stdout.write(`[stripe-server] Webhook listener on http://127.0.0.1:${PORT}/webhook (RSS: ${rss}MB, heap: ${heap}MB)\n`);
  process.stdout.write(`[stripe-server] Dev: stripe listen --forward-to localhost:${PORT}/webhook\n`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(`[stripe-server] Port ${PORT} in use — another instance running? Exiting.\n`);
    process.exit(1);
  }
  throw err;
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT',  () => server.close());
