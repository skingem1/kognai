import React from 'react';

/** Props for Tag component */
export interface TagProps {
  /** Tag label text */
  label: string;
  /** Color variant */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Show remove button */
  removable?: boolean;
  /** Called when remove button clicked */
  onRemove?: () => void;
  /** Additional CSS class */
  className?: string;
}

/** A tag/chip component for labels */
export const Tag: React.FC<TagProps> = ({ label, variant = 'default', size = 'md', removable = false, onRemove, className }) => (
  <span className={`tag tag-${variant} tag-${size} ${className || ''}`} role="status">
    {label}
    {removable && (
      <button className="tag-remove" onClick={onRemove} aria-label={`Remove ${label}`} type="button">×</button>
    )}
  </span>
);