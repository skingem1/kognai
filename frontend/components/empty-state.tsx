'use client';

import React from 'react';

export function EmptyState({ title, description, message, actionLabel, onAction }: { title?: string; description?: string; message?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', backgroundColor: '#f9fafb', borderRadius: 12, border: '1px dashed #d1d5db' }}>
      <h3 style={{ fontSize: 18, fontWeight: 600, color: "#111827", marginBottom: 8 }}>{title || message || "No data"}</h3>
      {description && <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>{description}</p>}
      {actionLabel && onAction && (
        <button style={{ padding: '8px 20px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer', fontWeight: 500 }} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
