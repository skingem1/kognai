export default function ApiKeysPage() {
  const containerStyle: React.CSSProperties = {
    maxWidth: '768px',
    margin: '0 auto',
    padding: '32px',
    fontFamily: 'system-ui',
  };

  const h1Style: React.CSSProperties = { fontSize: '32px' };
  const h2Style: React.CSSProperties = { fontSize: '24px', marginTop: '32px' };
  const codeBlockStyle: React.CSSProperties = {
    backgroundColor: '#f5f5f5',
    padding: '16px',
    borderRadius: '8px',
    overflowX: 'auto',
    fontFamily: 'monospace',
  };

  return (
    <div style={containerStyle}>
      <h1 style={h1Style}>API Key Management</h1>
      <p>Manage your API keys programmatically using the client SDK.</p>

      <h2 style={h2Style}>Create an API Key</h2>
      <pre style={codeBlockStyle}>
        <code>const response = await client.apiKeys.createApiKey(&apos;my-key&apos;);</code>
      </pre>

      <h2 style={h2Style}>List API Keys</h2>
      <pre style={codeBlockStyle}>
        <code>const keys = await client.apiKeys.listApiKeys();</code>
      </pre>

      <h2 style={h2Style}>Revoke an API Key</h2>
      <pre style={codeBlockStyle}>
        <code>await client.apiKeys.revokeApiKey(keyId);</code>
      </pre>

      <h2 style={h2Style}>Key Prefixes</h2>
      <p>Production keys start with <code>inv_live_</code> while sandbox keys use <code>inv_test_</code>.</p>

      <h2 style={h2Style}>Security Best Practices</h2>
      <ul style={{ paddingLeft: '20px' }}>
        <li>Rotate keys regularly</li>
        <li>Use test keys for development</li>
        <li>Never expose keys in client-side code</li>
        <li>Store keys in environment variables</li>
      </ul>
    </div>
  );
}