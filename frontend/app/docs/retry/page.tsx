export default function RetryPage() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '32px' }}>Retry Configuration</h1>
      <p>The Countable SDK automatically retries failed requests with exponential backoff for transient errors.</p>
      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Retryable Status Codes</h2>
      <ul>
        <li>408 Request Timeout</li>
        <li>429 Too Many Requests</li>
        <li>500 Internal Server Error</li>
        <li>502 Bad Gateway</li>
        <li>503 Service Unavailable</li>
        <li>504 Gateway Timeout</li>
      </ul>
      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Configuration</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
        <code>{`const client = new CountableClient({ apiKey: 'inv_live_...', maxRetries: 5, timeout: 30000 });`}</code>
      </pre>
      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Backoff Strategy</h2>
      <p>The SDK uses exponential backoff with jitter to prevent thundering herd. Formula: delay = min(baseDelay * 2^attempt + random_jitter, maxDelay)</p>
      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Disabling Retries</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
        <code>{`const client = new CountableClient({ apiKey: 'inv_live_...', maxRetries: 0 });`}</code>
      </pre>
    </div>
  );
}