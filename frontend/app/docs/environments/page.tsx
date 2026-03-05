export default function EnvironmentsPage() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Environments</h1>
      <p style={{ marginBottom: '24px' }}>
        The SDK automatically detects your runtime environment and configures defaults accordingly.
      </p>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Supported Environments</h2>
      <ul style={{ marginBottom: '24px', paddingLeft: '24px' }}>
        <li>Node.js (server-side)</li>
        <li>Browser (client-side)</li>
        <li>Edge Runtime (Vercel/Cloudflare Workers)</li>
        <li>Deno</li>
      </ul>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Auto-Detection</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
        <code>{`import { detectEnvironment, getDefaultBaseUrl } from '@invoica/sdk';
const env = detectEnvironment();
console.log(env); // 'node' | 'browser' | 'edge' | 'deno'`}</code>
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Custom Configuration</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
        <code>{`const client = new CountableClient({
  apiKey: 'inv_...',
  baseUrl: 'https://api.staging.invoica.ai/v1',
  timeout: 30000
});`}</code>
      </pre>

      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Environment Variables</h2>
      <ul style={{ marginBottom: '24px', paddingLeft: '24px' }}>
        <li><strong>INVOICA_API_KEY</strong> — API key (auto-detected in Node.js)</li>
        <li><strong>INVOICA_BASE_URL</strong> — Override base URL</li>
        <li><strong>INVOICA_DEBUG</strong> — Enable debug logging</li>
      </ul>
    </div>
  );
}