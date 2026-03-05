'use client';

import React from 'react';

interface ConfigProperty {
  property: string;
  type: string;
  default: string;
  description: string;
}

const configProperties: ConfigProperty[] = [
  {
    property: 'apiKey',
    type: 'string',
    default: '(required)',
    description: 'Your Invoica API key',
  },
  {
    property: 'baseUrl',
    type: 'string',
    default: 'https://api.invoica.ai/v1',
    description: 'API base URL',
  },
  {
    property: 'timeout',
    type: 'number',
    default: '30000',
    description: 'Request timeout in milliseconds',
  },
  {
    property: 'maxRetries',
    type: 'number',
    default: '3',
    description: 'Maximum retry attempts for failed requests',
  },
];

export default function ConfigurationPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <h1 className="text-4xl font-bold mb-6">Configuration</h1>
      
      <p className="text-lg text-gray-300 mb-8">
        The Invoica SDK accepts an InvoicaClientConfig object with sensible defaults for all optional properties.
      </p>

      <div className="overflow-x-auto mb-10">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 font-semibold text-gray-100">Property</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-100">Type</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-100">Default</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-100">Description</th>
            </tr>
          </thead>
          <tbody>
            {configProperties.map((prop) => (
              <tr key={prop.property} className="border-b border-gray-800">
                <td className="py-3 px-4 font-mono text-blue-400">{prop.property}</td>
                <td className="py-3 px-4 font-mono text-green-400">{prop.type}</td>
                <td className="py-3 px-4 font-mono text-yellow-400">{prop.default}</td>
                <td className="py-3 px-4 text-gray-300">{prop.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Basic Configuration</h2>
        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
          <code>{`const client = new CountableClient({ apiKey: 'inv_live_xxx' });`}</code>
        </pre>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Custom Configuration</h2>
        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
          <code>{`const client = new CountableClient({
  apiKey: 'inv_live_xxx',
  baseUrl: 'https://api.invoica.ai/v1',
  timeout: 30000,
  maxRetries: 3,
});`}</code>
        </pre>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Environment Detection</h2>
        <p className="text-gray-300 mb-4">
          The SDK automatically detects whether you are using test keys (inv_test_ prefix) 
          or live keys (inv_live_ prefix) to determine the environment.
        </p>
        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
          <code>{`if (apiKey.startsWith('inv_test_')) {
  console.log('Using sandbox environment');
}`}</code>
        </pre>
      </section>
    </div>
  );
}