"use client";

import { useState } from "react";

const endpoints = [
  {
    method: "POST",
    path: "/v1/invoices",
    body: { customer_id: "cus_123", amount: 5000, currency: "usd" },
    response: { id: "inv_abc", status: "created", created_at: "2024-01-15T10:30:00Z" },
  },
  {
    method: "GET",
    path: "/v1/invoices/:id",
    body: null,
    response: { id: "inv_abc", customer_id: "cus_123", amount: 5000, status: "paid" },
  },
  {
    method: "POST",
    path: "/v1/settlements",
    body: { invoice_id: "inv_abc", amount: 5000 },
    response: { id: "set_xyz", status: "settled", settled_at: "2024-01-15T12:00:00Z" },
  },
  { method: "GET", path: "/v1/health", body: null, response: { status: "healthy" } },
];

export default function ApiExplorer() {
  const [selected, setSelected] = useState(0);
  const ep = endpoints[selected];

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">API Explorer</h1>
      <select
        className="w-full p-2 border rounded"
        value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
      >
        {endpoints.map((e, i) => (
          <option key={i} value={i}>{e.method} {e.path}</option>
        ))}
      </select>
      <div className="space-y-2">
        <div>
          <p className="font-semibold text-sm">Request Body</p>
          <pre className="bg-slate-100 p-2 rounded text-xs overflow-auto">{ep.body ? JSON.stringify(ep.body, null, 2) : "—"}</pre>
        </div>
        <div>
          <p className="font-semibold text-sm">Sample Response</p>
          <pre className="bg-slate-100 p-2 rounded text-xs overflow-auto">{JSON.stringify(ep.response, null, 2)}</pre>
        </div>
      </div>
      <button className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800" onClick={() => alert("Connect your API key in Settings to try live requests")}>Try It</button>
    </div>
  );
}
