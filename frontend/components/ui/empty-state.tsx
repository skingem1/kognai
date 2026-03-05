'use client';

import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 mt-4">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm text-center">{description}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-4 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  );
}