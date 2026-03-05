'use client';
import apiData from '../../../public/data/api-reference.json';

interface Endpoint {
  method: string;
  path: string;
  description: string;
  auth: string;
  tags: string[];
}

const methodStyles: Record<string, string> = {
  "GET": "bg-green-100 text-green-800",
  "POST": "bg-blue-100 text-blue-800",
  "PUT": "bg-yellow-100 text-yellow-800",
  "DELETE": "bg-red-100 text-red-800",
  "PATCH": "bg-purple-100 text-purple-800"
};

export default function ApiReferencePage() {
  const endpoints: Endpoint[] = apiData;
  const groups = endpoints.reduce((acc: Record<string, Endpoint[]>, ep) => {
    const tag = ep.tags[0] || 'other';
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(ep);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">API Reference</h1>
      <p className="text-sm text-gray-500 mb-4">
        Auto-generated · {endpoints.length} endpoints · Base URL:
        <code className="bg-gray-100 px-2 py-0.5 rounded ml-1">https://invoica.wp1.host/v1</code>
      </p>
      <section className="mb-8 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Authentication</h2>
        <p className="text-sm text-gray-600">
          Ledger endpoints require <code className="bg-white px-1 rounded">X-API-Key</code> header.
          AI inference uses x402 payment (<code className="bg-white px-1 rounded">X-Payment</code> header, USDC on Base).
        </p>
      </section>

      {Object.entries(groups).map(([group, eps]) => (
        <section key={group} className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 capitalize">{group}</h2>
          {eps.map((ep, i) => (
            <div key={i} className="border rounded-lg p-4 mb-3">
              <div className="flex items-center gap-3 mb-1">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodStyles[ep.method] || 'bg-gray-100 text-gray-800'}`}>
                  {ep.method}
                </span>
                <span className="font-mono text-sm text-gray-800">{ep.path}</span>
                {ep.auth !== 'None' && (
                  <span className="ml-auto text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">🔐 Auth</span>
                )}
              </div>
              <p className="text-gray-500 text-sm">{ep.description}</p>
              {ep.auth !== 'None' && (
                <p className="text-xs text-gray-400 mt-1">Auth: {ep.auth}</p>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
