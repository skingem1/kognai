'use client';

import React from 'react';

export default function WebhookVerificationPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-6">Webhook Verification</h1>

      <p className="text-gray-300 mb-8">
        Invoica signs webhook payloads using HMAC-SHA256. Verify signatures to ensure webhook authenticity.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">How It Works</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-300">
          <li>Invoica sends the payload with an x-invoica-signature header</li>
          <li>Your server computes HMAC-SHA256 of the raw body using your webhook secret</li>
          <li>Compare computed signature with the header using timing-safe comparison</li>
        </ol>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Code Example</h2>
        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
          <code>{`import express, { Request, Response } from 'express';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

function verifySignature(payload: string, secret: string, signature: string): boolean {
  const sig = signature.replace(/^sha256=/, '');
  const computed = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(computed, 'hex'));
}

const app = express();

app.post('/webhooks', express.raw({ type: 'application/json' }), (req: Request, res: Response) => {
  const signature = req.headers['x-invoica-signature'] as string;
  
  if (!signature || !verifySignature(req.body.toString(), WEBHOOK_SECRET, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook payload
  return res.status(200).json({ received: true });
});`}</code>
        </pre>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Security Best Practices</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-300">
          <li>Always use timing-safe comparison (built into verifySignature)</li>
          <li>Store webhook secrets in environment variables</li>
          <li>Use HTTPS endpoints only</li>
          <li>Log failed verification attempts for monitoring</li>
        </ul>
      </section>
    </div>
  );
}