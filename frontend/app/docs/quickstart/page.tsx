export default function QuickstartPage() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Quickstart</h1>
      <p style={{ fontSize: '16px', marginBottom: '32px' }}>Get up and running with the Invoica SDK in under 5 minutes.</p>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Installation</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '14px' }}>
        <code>npm install @invoica/sdk</code>
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Initialize the Client</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '14px' }}>
        <code>{`import { CountableClient } from '@invoica/sdk';

const client = new CountableClient({ apiKey: 'inv_test_...' });`}</code>
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Create Your First Invoice</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '14px' }}>
        <code>{`const invoice = await client.createInvoice({
  amount: 1000,
  currency: 'USD',
  recipientAddress: '0x1234...',
  description: 'Payment'
});
console.log(invoice.id);`}</code>
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>List Invoices</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '14px' }}>
        <code>{`const { invoices } = await client.listInvoices({ limit: 10 });`}</code>
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Next Steps</h2>
      <ul style={{ fontSize: '16px', lineHeight: '1.6', paddingLeft: '24px' }}>
        <li>Set up webhooks for real-time notifications</li>
        <li>Configure rate limiting for production</li>
        <li>Explore the full API reference</li>
      </ul>
    </div>
  );
}