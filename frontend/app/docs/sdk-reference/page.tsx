export default function SdkReferencePage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-3xl font-bold mb-4">SDK Reference</h1>
      <p className="text-gray-600 mb-8">
        The Invoica TypeScript SDK provides typed methods for all API endpoints.
      </p>

      <h2 className="text-2xl font-semibold mb-4">Installation</h2>
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg mb-8 overflow-x-auto">
        <code>npm install @invoica/sdk</code>
      </pre>

      <h2 className="text-2xl font-semibold mb-4">Client Methods</h2>
      <table className="w-full border-collapse mb-8">
        <thead>
          <tr className="bg-gray-200">
            <th className="border p-3 text-left">Method</th>
            <th className="border p-3 text-left">Parameters</th>
            <th className="border p-3 text-left">Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-3">createInvoice(params)</td>
            <td className="border p-3">CreateInvoiceParams</td>
            <td className="border p-3">Promise&lt;Invoice&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">getInvoice(id)</td>
            <td className="border p-3">string</td>
            <td className="border p-3">Promise&lt;Invoice&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">listInvoices(params?)</td>
            <td className="border p-3">{"{limit?, offset?, status?}"}</td>
            <td className="border p-3">Promise&lt;InvoiceListResponse&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">getSettlement(id)</td>
            <td className="border p-3">string</td>
            <td className="border p-3">Promise&lt;Settlement&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">listSettlements(params?)</td>
            <td className="border p-3">{"{limit?, offset?}"}</td>
            <td className="border p-3">Promise&lt;SettlementListResponse&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">createApiKey(name)</td>
            <td className="border p-3">string</td>
            <td className="border p-3">Promise&lt;ApiKeyCreateResponse&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">revokeApiKey(id)</td>
            <td className="border p-3">string</td>
            <td className="border p-3">Promise&lt;void&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">listApiKeys()</td>
            <td className="border p-3">—</td>
            <td className="border p-3">Promise&lt;ApiKey[]&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">registerWebhook(config)</td>
            <td className="border p-3">WebhookRegistrationConfig</td>
            <td className="border p-3">Promise&lt;WebhookRegistration&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">listWebhooks()</td>
            <td className="border p-3">—</td>
            <td className="border p-3">Promise&lt;WebhookListResponse&gt;</td>
          </tr>
          <tr>
            <td className="border p-3">deleteWebhook(id)</td>
            <td className="border p-3">string</td>
            <td className="border p-3">Promise&lt;void&gt;</td>
          </tr>
        </tbody>
      </table>

      <h2 className="text-2xl font-semibold mb-4">Error Handling</h2>
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
        <code>{`try {
  const invoice = await client.createInvoice(params);
} catch (error) {
  if (error instanceof InvoicaError) {
    console.error(error.code, error.message);
  }
}`}</code>
      </pre>
    </div>
  );
}
