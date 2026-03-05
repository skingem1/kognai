'use client';

import { createPortal } from 'react-dom';

/** Props for Portal component */
export interface PortalProps {
  /** Content to render in portal */
  children: React.ReactNode;
  /** Target container element or CSS selector. Defaults to document.body */
  container?: Element | string;
}

/** Renders children into a different DOM node */
export function Portal({ children, container }: PortalProps): React.ReactPortal {
  const resolved = typeof container === 'string'
    ? (document.querySelector(container) || document.body)
    : (container || document.body);
  return createPortal(children, resolved);
}