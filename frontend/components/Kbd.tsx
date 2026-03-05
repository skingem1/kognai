import React from 'react';

/** Props for Kbd component */
export interface KbdProps {
  /** Key or keys to display */
  children: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS class */
  className?: string;
}

/** Keyboard shortcut display component */
export const Kbd: React.FC<KbdProps> = ({ children, size = 'md', className = '' }) => (
  <kbd className={`kbd kbd-${size} ${className}`} role="text" aria-label="Keyboard shortcut">
    {children}
  </kbd>
);