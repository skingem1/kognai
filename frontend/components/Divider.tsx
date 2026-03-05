import React from 'react';

/** Props for Divider component */
export interface DividerProps {
  /** Orientation (default: 'horizontal') */
  orientation?: 'horizontal' | 'vertical';
  /** Label text centered in the divider */
  label?: string;
  /** Additional CSS class */
  className?: string;
  /** Line color (default: '#e5e7eb') */
  color?: string;
  /** Line thickness in px (default: 1) */
  thickness?: number;
  /** Margin in px (default: 16) */
  spacing?: number;
}

/** A horizontal or vertical divider component with optional centered label */
export function Divider({
  orientation = 'horizontal',
  label,
  className = '',
  color = '#e5e7eb',
  thickness = 1,
  spacing = 16,
}: DividerProps) {
  const isHorizontal = orientation === 'horizontal';
  const style = isHorizontal
    ? { borderTop: `${thickness}px solid ${color}`, margin: `${spacing}px 0` }
    : { borderLeft: `${thickness}px solid ${color}`, margin: `0 ${spacing}px`, alignSelf: 'stretch' };
  if (!label) {
    return <div role="separator" aria-orientation={orientation} className={`divider divider-${orientation} ${className||''}`} style={style} />;
  }
  const wrapperStyle = isHorizontal
    ? { display: 'flex', alignItems: 'center', gap: '8px', margin: `${spacing}px 0` }
    : { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '8px', margin: `0 ${spacing}px`, alignSelf: 'stretch' };
  const lineStyle = isHorizontal
    ? { flex: 1, borderTop: `${thickness}px solid ${color}` }
    : { flex: 1, borderLeft: `${thickness}px solid ${color}` };
  return (
    <div role="separator" aria-orientation={orientation} className={`divider divider-${orientation} ${className||''}`} style={wrapperStyle}>
      <div style={lineStyle} />
      <span className="divider-label">{label}</span>
      <div style={lineStyle} />
    </div>
  );
}