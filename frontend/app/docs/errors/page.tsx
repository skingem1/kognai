'use client';

import React from 'react';

export default function ErrorsDocPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <h1 className="text-4xl font-bold mb-6">Error Handling</h1>
      
      <p className="text-lg text-gray-300 mb-8">
        The Invoica SDK throws typed errors that extend the base InvoicaError class. 
        Each error includes a statusCode and error code for programmatic handling.
      </p>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="py-3 px-4 font-semibold">Name</th>
              <th className="py-3 px-4 font-semibold">Status Code</th>
              <th className="py-3 px-4 font-semibold">Code</th>
              <th className="py-3 px-4 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-800">
              <td className="py-3 px-4">ValidationError</td>
              <td className="py-3 px-4">400</td>
              <td className="py-3 px-4">VALIDATION_ERROR</td>
              <td className="py-3 px-4">Invalid request parameters</td>
            </tr>
            <tr className="border-b border-gray-800">
              <td className="py-3 px-4">AuthenticationError</td>
              <td className="py-3 px-4">401</td>
              <td className="py-3 px-4">AUTH_ERROR</td>
              <td className="py-3 px-4">Missing or invalid API key</td>
            </tr>
            <tr className="border-b border-gray-800">
              <td className="py-3 px-4">NotFoundError</td>
              <td className="py-3 px-4">404</td>
              <td className="py-3 px-4">NOT_FOUND</td>
              <td className="py-3 px-4">Resource does not exist</td>
            </tr>
            <tr className="border-b border-gray-800">
              <td className="py-3 px-4">RateLimitError</td>
              <td className="py-3 px-4">429</td>
              <td className="py-3 px-4">RATE_LIMIT</td>
              <td className="py-3 px-4">Too many requests</td>
            </tr>
            <tr className="border-b border-gray-800">
              <td className="py-3 px-4">InvoicaError</td>
              <td className="py-3 px-4">varies</td>
              <td className="py-3 px-4">varies</td>
              <td className="py-3 px-4">Base error class for all API errors</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg mb-8 overflow-x-auto">
        <pre><code>{`try {
  const invoice = await client.invoices.create({
    customer_id: 'cus_123',
    line_items: [{ description: 'Test' }]
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.message);
  } else if (error instanceof AuthenticationError) {
    console.log('Auth failed:', error.message);
  } else if (error instanceof RateLimitError) {
    console.log('Rate limited, retry after:', error.retryAfter);
  } else if (error instanceof InvoicaError) {
    console.log('API Error:', error.statusCode, error.code);
  }
}`}</code></pre>
      </div>

      <h2 className="text-2xl font-semibold mb-4">Retry Behavior</h2>
      <p className="text-gray-300">
        HTTP status codes 429, 500, 502, 503, and 504 are automatically retried with exponential 
        backoff up to 3 attempts before propagating the error.
      </p>
    </div>
  );
}