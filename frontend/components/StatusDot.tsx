import React from 'react';

/** Props for StatusDot component */
export interface StatusDotProps {
  /** Status variant determining the color */
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  /** Size of the dot */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show a pulse animation */
  pulse?: boolean;
  /** Optional label text */
  label?: string;
  /** Additional CSS class */
  className?: string;
}

/** StatusDot component - a simple status indicator dot */
export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'md',
  pulse = false,
  label,
  className,
}) => (
  <span className={`status-dot status-dot-${status} status-dot-${size} ${pulse ? 'status-dot-pulse' : ''} ${className || ''}`}>
    <span className="status-dot-indicator" aria-hidden="true" />
    {label && <span className="status-dot-label">{label}</span>}
  </span>
);