import React from 'react';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 250, minWidth: 250, backgroundColor: 'white', borderRight: '1px solid #e5e7eb', padding: 24 }}>
        <h2>Documentation</h2>
        <nav>
          <a href="/docs/getting-started" style={{ display: 'block', marginBottom: 8, color: '#2563eb', textDecoration: 'none' }}>Getting Started</a>
          <a href="/docs/authentication" style={{ display: 'block', marginBottom: 8, color: '#2563eb', textDecoration: 'none' }}>Authentication</a>
          <a href="/docs/invoices" style={{ display: 'block', marginBottom: 8, color: '#2563eb', textDecoration: 'none' }}>Invoices API</a>
          <a href="/docs/settlements" style={{ display: 'block', marginBottom: 8, color: '#2563eb', textDecoration: 'none' }}>Settlements API</a>
          <a href="/docs/webhooks" style={{ display: 'block', marginBottom: 8, color: '#2563eb', textDecoration: 'none' }}>Webhooks</a>
          <a href="/docs/sdk-reference" style={{ display: 'block', marginBottom: 8, color: '#2563eb', textDecoration: 'none' }}>SDK Reference</a>
          <a href="/docs/sandbox" style={{ display: 'block', marginBottom: 8, color: '#2563eb', textDecoration: 'none' }}>Sandbox</a>
        </nav>
      </aside>
      <main style={{ maxWidth: 800, padding: 32, flex: 1 }}>{children}</main>
    </div>
  );
}
