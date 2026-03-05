'use client';

import React, { useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  const colors = { success: '#16a34a', error: '#dc2626', info: '#2563eb' };
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, padding: '12px 20px', borderRadius: 8, color: 'white', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', backgroundColor: colors[type] }}>
      <span>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer', marginLeft: 8 }}>×</button>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = (message: string, type: ToastType) => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); };
  const hideToast = () => setToast(null);
  return { toast, showToast, hideToast };
}
