import React from "react";

export default function PaginationPage() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '32px' }}>Pagination</h1>

      <p>
        When working with large result sets, use pagination to efficiently retrieve data in manageable chunks.
      </p>

      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Basic Pagination</h2>
      <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
        <code>{"const page1 = await client.listInvoices({ limit: 10, offset: 0 });"}</code>
      </div>

      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Response Format</h2>
      <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
        <code>{`{
  invoices: Invoice[],
  total: number,
  limit: number,
  offset: number
}`}</code>
      </div>

      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Iterating All Pages</h2>
      <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}>
        <code>{`let offset = 0;
while (offset < total) {
  const page = await client.listInvoices({ limit: 10, offset });
  offset += page.invoices.length;
}`}</code>
      </div>

      <h2 style={{ fontSize: '24px', marginTop: '32px' }}>Default Limits</h2>
      <p>
        By default, the API returns 20 items per page. The maximum limit is 100 items per request.
      </p>
    </div>
  );
}
