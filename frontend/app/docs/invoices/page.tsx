import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoices API - Developer Documentation',
  description: 'API documentation for creating and managing invoices',
};

export default function InvoicesApiPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-3xl font-bold mb-4">Invoices API</h1>
      <p className="mb-8 text-gray-600">
        The Invoices API allows you to create and manage invoices for your customers.
        You can create new invoices, retrieve existing ones, and list all invoices with pagination.
      </p>

      <h2 className="text-2xl font-semibold mb-4 mt-8">Create Invoice</h2>
      <p className="mb-4 text-gray-600">Method: POST /v1/invoices</p>
      <p className="mb-2 text-gray-600">Request body:</p>
      <pre className="bg-gray-100 p-4 rounded-md mb-4 overflow-x-auto text-sm">
{`{
  "amount": 1000,
  "currency": "USD",
  "description": "API usage fee"
}`}
      </pre>
      <p className="mb-2 text-gray-600">Response:</p>
      <pre className="bg-gray-100 p-4 rounded-md mb-8 overflow-x-auto text-sm">
{`{
  "id": "inv_123",
  "amount": 1000,
  "currency": "USD",
  "status": "pending",
  "createdAt": "2026-02-15T10:00:00Z"
}`}
      </pre>

      <h2 className="text-2xl font-semibold mb-4">Get Invoice</h2>
      <p className="mb-4 text-gray-600">Method: GET /v1/invoices/:id</p>
      <p className="mb-2 text-gray-600">Response:</p>
      <pre className="bg-gray-100 p-4 rounded-md mb-8 overflow-x-auto text-sm">
{`{
  "id": "inv_123",
  "amount": 1000,
  "currency": "USD",
  "status": "pending",
  "createdAt": "2026-02-15T10:00:00Z"
}`}
      </pre>

      <h2 className="text-2xl font-semibold mb-4">List Invoices</h2>
      <p className="mb-4 text-gray-600">Method: GET /v1/invoices?limit=10&offset=0</p>
      <p className="mb-2 text-gray-600">Response:</p>
      <pre className="bg-gray-100 p-4 rounded-md mb-8 overflow-x-auto text-sm">
{`{
  "invoices": [...],
  "total": 42,
  "limit": 10,
  "offset": 0
}`}
      </pre>

      <h2 className="text-2xl font-semibold mb-4">Invoice Statuses</h2>
      <ul className="list-disc pl-6 space-y-2 text-gray-600">
        <li><strong>pending</strong> — The invoice has been created but not yet processed.</li>
        <li><strong>processing</strong> — The invoice is currently being processed.</li>
        <li><strong>completed</strong> — The invoice has been successfully paid.</li>
        <li><strong>failed</strong> — The invoice payment failed or was rejected.</li>
      </ul>
    </div>
  );
}
