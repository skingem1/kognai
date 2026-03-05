import React from 'react';

export default function RateLimitingPage() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Rate Limiting</h1>

      <p style={{ marginBottom: '24px' }}>
        Our API enforces rate limits to ensure fair usage and maintain service stability. The SDK automatically handles rate limiting, so you can focus on building your application.
      </p>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>How It Works</h2>
      <p style={{ marginBottom: '24px' }}>
        The SDK reads the <code>x-ratelimit-limit</code>, <code>x-ratelimit-remaining</code>, and <code>x-ratelimit-reset</code> headers from every response to track your rate limit status.
      </p>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Automatic Retry</h2>
      <p style={{ marginBottom: '16px' }}>
        When you receive a 429 status (rate limited), the SDK automatically waits and retries the request.
      </p>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace', marginBottom: '24px' }}>
        <code>const invoices = await client.listInvoices(); // SDK waits if rate limited</code>
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Manual Rate Limit Checking</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace', marginBottom: '24px' }}>
        <code>{`import { RateLimitTracker } from '@invoica/sdk';
const tracker = new RateLimitTracker();
tracker.update(responseHeaders);
if (tracker.shouldWait()) { await tracker.waitIfNeeded(); }`}</code>
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Default Limits</h2>
      <ul style={{ marginBottom: '24px', paddingLeft: '20px' }}>
        <li>100 requests per minute per API key</li>
        <li>1000 requests per hour per API key</li>
        <li>Rate limit headers included in every response</li>
      </ul>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Monthly Limits by Plan</h2>
      <p style={{ marginBottom: '16px' }}>
        In addition to per-minute rate limits, each plan has monthly API call and invoice quotas.
      </p>

      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Registered Company Plans</h3>
      <ul style={{ marginBottom: '16px', paddingLeft: '20px' }}>
        <li><strong>Free:</strong> 100 invoices/month, 1,000 API calls/month</li>
        <li><strong>Pro ($49/mo):</strong> Unlimited invoices, 50,000 API calls/month</li>
        <li><strong>Enterprise:</strong> Unlimited invoices, unlimited API calls</li>
      </ul>

      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Web3 Project Plans</h3>
      <ul style={{ marginBottom: '24px', paddingLeft: '20px' }}>
        <li><strong>Free:</strong> 100 invoices/month, 1,000 API calls/month</li>
        <li><strong>Growth ($24/mo):</strong> 5,000 invoices/month, 25,000 API calls/month</li>
      </ul>

      <p style={{ marginBottom: '24px' }}>
        See <a href="/docs/pricing" style={{ color: '#635BFF' }}>Plans &amp; Pricing</a> for full details.
      </p>
    </div>
  );
}