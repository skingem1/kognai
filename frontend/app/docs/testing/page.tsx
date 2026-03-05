export default function TestingPage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Testing Guide</h1>
      <p className="text-gray-600 mb-8">Best practices for testing your Invoica integration.</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Sandbox Environment</h2>
        <p className="text-gray-600 mb-3">Use the sandbox base URL for testing without affecting production data.</p>
        <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto">{`const client = new CountableClient({
  apiKey: 'test_sk_...',
  baseUrl: 'https://sandbox.invoica.ai/v1'
});`}</pre>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Mocking the Client</h2>
        <p className="text-gray-600 mb-3">Use Jest to mock SDK methods in your unit tests.</p>
        <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto">{`jest.mock('@invoica/sdk');
const mockCreate = jest.fn().mockResolvedValue({ id: 'inv_123' });
(CountableClient as jest.Mock).mockImplementation(() => ({
  invoices: { create: mockCreate }
}));`}</pre>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Webhook Testing</h2>
        <p className="text-gray-600 mb-3">Verify webhook signatures in your test suite.</p>
        <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto">{`import { constructEvent } from '@invoica/sdk/webhook-verify';
const event = constructEvent(payload, signature, secret);
expect(event.type).toBe('invoice.paid');`}</pre>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Test Checklist</h2>
        <ul className="space-y-2 text-gray-600">
          {['API key authentication', 'Invoice creation and retrieval', 'Error handling for 4xx/5xx', 'Webhook signature verification', 'Rate limit retry behavior'].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded border border-gray-300 flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}