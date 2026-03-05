export default function WebhookEventsPage() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '32px' }}>Webhook Events</h1>
      <p>
        Receive real-time notifications when events occur in your account via webhooks.
        Webhooks allow your application to stay synchronized with events as they happen.
      </p>
      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Available Events</h2>
      <ul>
        <li>invoice.created</li>
        <li>invoice.paid</li>
        <li>invoice.expired</li>
        <li>settlement.completed</li>
        <li>settlement.failed</li>
        <li>api_key.created</li>
        <li>api_key.revoked</li>
      </ul>
      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Event Payload</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
{`{
  "id": "evt_abc123",
  "type": "invoice.paid",
  "createdAt": "2026-01-15T10:30:00Z",
  "data": {
    "invoiceId": "inv_xyz",
    "amount": 1000,
    "currency": "USD"
  }
}`}
      </pre>
      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Verifying Signatures</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
{`import { verifyWebhookSignature } from '@invoica/sdk';
const isValid = verifyWebhookSignature(payload, signature, secret);`}
      </pre>
      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Retry Policy</h2>
      <p>
        Failed deliveries are retried 3 times with exponential backoff (1min, 5min, 30min).
        After 3 failures the webhook is disabled.
      </p>
    </div>
  );
}