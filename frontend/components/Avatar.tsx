import React from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

export function Avatar({ src, alt, name, size = 'md', className = '' }: AvatarProps): JSX.Element {
  const sizeClass = SIZE_CLASSES[size];

  if (src) {
    return <img src={src} alt={alt || name || ''} className={`rounded-full object-cover ${sizeClass} ${className}`} />;
  }

  const initials = name ? getInitials(name) : '?';
  const bgClass = name ? 'bg-indigo-500' : 'bg-gray-300';

  return (
    <div className={`rounded-full ${bgClass} text-white flex items-center justify-center ${sizeClass} ${className}`}>
      {initials}
    </div>
  );
}