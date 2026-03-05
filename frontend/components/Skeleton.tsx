import React from 'react';

/** Props for Skeleton loading placeholder */
export interface SkeletonProps {
  /** CSS width value (default: '100%') */
  width?: string | number;
  /** CSS height value (default: '1rem') */
  height?: string | number;
  /** Shape variant */
  variant?: 'text' | 'circular' | 'rectangular';
  /** Animation type */
  animation?: 'pulse' | 'wave' | 'none';
  /** Additional CSS class */
  className?: string;
  /** Number of skeleton lines to render (default: 1) */
  count?: number;
  /** Gap between lines (default: '0.5rem') */
  gap?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  variant = 'text',
  animation = 'pulse',
  className = '',
  count = 1,
  gap = '0.5rem',
}) => {
  const getBorderRadius = () => {
    if (variant === 'circular') return '50%';
    if (variant === 'text') return '4px';
    return '0';
  };

  const size = variant === 'circular' ? { width, height: width } : { width, height };
  const skeletonClass = `skeleton skeleton-${variant} skeleton-${animation} ${className}`.trim();

  if (count > 1) {
    return (
      <div className="skeleton-group" style={{ gap }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={skeletonClass} style={{ ...size, borderRadius: getBorderRadius() }} aria-hidden="true" />
        ))}
      </div>
    );
  }

  return <div className={skeletonClass} style={{ ...size, borderRadius: getBorderRadius() }} aria-hidden="true" />;
};