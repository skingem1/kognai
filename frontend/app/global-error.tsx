'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#f8fafc',
        }}>
          <div style={{ maxWidth: '400px', textAlign: 'center', padding: '32px' }}>
            <div style={{
              width: '64px', height: '64px', backgroundColor: '#fef2f2',
              borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 24px',
            }}>
              <span style={{ fontSize: '32px' }}>⚠️</span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              Application Error
            </h2>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
              Something unexpected happened. Please try refreshing the page.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '10px 24px', backgroundColor: '#635BFF', color: 'white',
                border: 'none', borderRadius: '8px', fontSize: '14px',
                fontWeight: '600', cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
