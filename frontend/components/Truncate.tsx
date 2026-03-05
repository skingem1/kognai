import React from 'react';

/** Props for Truncate component */
export interface TruncateProps {
  /** Text content to truncate */
  text: string;
  /** Maximum number of characters to show */
  maxLength?: number;
  /** Ellipsis string */
  ellipsis?: string;
  /** Additional CSS class */
  className?: string;
}

/**
 * A text truncation component with tooltip support.
 * Displays truncated text with ellipsis and shows full text on hover.
 */
export const Truncate: React.FC<TruncateProps> = ({
  text,
  maxLength = 100,
  ellipsis = '...',
  className,
}) => {
  const isTruncated = text.length > maxLength;
  const displayText = isTruncated ? text.slice(0, maxLength) + ellipsis : text;

  return (
    <span
      className={`truncate-text ${className || ''}`}
      title={isTruncated ? text : undefined}
      aria-label={text}
    >
      {displayText}
    </span>
  );
};