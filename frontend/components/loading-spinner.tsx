'use client';

import React from 'react';

export function LoadingSpinner({ size = 32, color = '#0ea5e9' }: { size?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
        <circle cx={12} cy={12} r={10} stroke={color} strokeWidth={3} fill="none" strokeDasharray="31.4 31.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <LoadingSpinner size={48} />
    </div>
  );
}
