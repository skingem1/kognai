import React from 'react';

/** Props for VisuallyHidden component */
export interface VisuallyHiddenProps {
  /** Content to hide visually */
  children: React.ReactNode;
  /** Render as a different element */
  as?: 'span' | 'div';
  /** Additional CSS class */
  className?: string;
}

const hiddenStyles: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
};

/** A component that hides content visually but keeps it available to screen readers */
export const VisuallyHidden: React.FC<VisuallyHiddenProps> = ({ children, as = 'span', className }) => {
  return React.createElement(as, { style: hiddenStyles, className }, children);
};