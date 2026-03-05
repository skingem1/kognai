export default function ErrorHandlingPage() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '32px' }}>Error Handling</h1>
      <p>
        The SDK provides structured error responses to help you handle failures gracefully
        and take appropriate action based on the error type.
      </p>

      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Error Types</h2>
      <ul style={{ marginLeft: '24px', lineHeight: '1.8' }}>
        <li><strong>InvoicaError</strong> — Base error class</li>
        <li><strong>ValidationError</strong> — Invalid input (400)</li>
        <li><strong>AuthenticationError</strong> — Invalid credentials (401)</li>
        <li><strong>NotFoundError</strong> — Resource not found (404)</li>
        <li><strong>RateLimitError</strong> — Too many requests (429)</li>
      </ul>

      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Catching Errors</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '14px' }}>
{`try {
  const invoice = await client.createInvoice({...});
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.code, err.message);
  } else if (err instanceof RateLimitError) {
    console.log('Retry after', err.retryAfter, 'seconds');
  }
}`}
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Error Response Format</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '14px' }}>
{`{
  success: false,
  error: {
    message: 'Invoice not found',
    code: 'NOT_FOUND',
    details: null
  }
}`}
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Best Practices</h2>
      <ul style={{ marginLeft: '24px', lineHeight: '1.8' }}>
        <li>Always catch InvoicaError as the base class</li>
        <li>Check specific error types for targeted handling</li>
        <li>Use retryAfter from RateLimitError for backoff</li>
      </ul>
    </div>
  );
}