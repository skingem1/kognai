'use client';

import React from 'react';

/** Props for Spinner component */
export interface SpinnerProps {
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant */
  color?: 'primary' | 'secondary' | 'white';
  /** Accessible label */
  label?: string;
  /** Additional CSS class */
  className?: string;
}

/** A CSS-based loading spinner component */
export function Spinner({ size = 'md', color = 'primary', label, className }: SpinnerProps) {
  return (
    <span className={`spinner spinner-${size} spinner-${color} ${className || ''}`} role="status" aria-label={label || 'Loading'}>
      <span className="spinner-dot" />
      <span className="spinner-dot" />
      <span className="spinner-dot" />
    </span>
  );
}