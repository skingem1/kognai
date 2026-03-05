import React from 'react';

export interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'red' | 'yellow';
  showLabel?: boolean;
  className?: string;
  animated?: boolean;
}

/** A progress bar component that displays a percentage value.
  @param value - Current progress value (0-100)
  @param max - Maximum value (default 100)
  @param size - Height of the bar: sm=4px, md=8px, lg=12px
  @param color - Bar color: blue | green | red | yellow
  @param showLabel - Whether to display the percentage label
  @param className - Additional CSS classes
  @param animated - Whether to animate width changes */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value, max = 100, size = 'md', color = 'blue',
  showLabel = false, className = '', animated = true,
}) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`progress-bar-container ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-bar-fill progress-bar-${color} progress-bar-${size} ${animated ? 'progress-bar-animated' : ''}`} style={{ width: `${pct}%` }} />
      {showLabel && <span className="progress-bar-label">{pct}%</span>}
    </div>
  );
};