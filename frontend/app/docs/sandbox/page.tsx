export default function SandboxPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Sandbox Environment</h1>
      <p className="mb-8 text-muted-foreground">
        Test your integration without processing real payments.
      </p>

      <h2 className="text-xl font-medium mb-3">Sandbox URL</h2>
      <p className="mb-6 text-muted-foreground">
        The sandbox base URL is <code className="bg-muted px-1 py-0.5 rounded text-sm">https://sandbox.invoica.dev/v1</code>. 
        All API endpoints work the same as production but no real transactions are processed.
      </p>

      <h2 className="text-xl font-medium mb-3">Test API Keys</h2>
      <p className="mb-6 text-muted-foreground">
        Sandbox keys start with <code className="bg-muted px-1 py-0.5 rounded text-sm">inv_test_</code> instead of <code className="bg-muted px-1 py-0.5 rounded text-sm">inv_</code>. 
        Generate one from the dashboard or use: <code className="bg-muted px-1 py-0.5 rounded text-sm">inv_test_0000000000000000000000000000dead</code>
      </p>

      <h2 className="text-xl font-medium mb-3">Test Scenarios</h2>
      <ul className="list-disc pl-6 mb-6 text-muted-foreground space-y-1">
        <li><strong>Amount 100</strong> → always succeeds (settlement completes)</li>
        <li><strong>Amount 999</strong> → always fails (settlement fails)</li>
        <li><strong>Amount 500</strong> → delayed (settlement stays pending for 30 seconds)</li>
        <li><strong>Amount 0</strong> → validation error (400 Bad Request)</li>
      </ul>

      <h2 className="text-xl font-medium mb-3">Webhook Testing</h2>
      <p className="text-muted-foreground">
        Use a tool like ngrok to expose a local endpoint, then register it as a sandbox webhook. 
        Events fire immediately in sandbox mode.
      </p>
    </div>
  );
}
