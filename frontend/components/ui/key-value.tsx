'use client';

import React from 'react';

export interface KeyValueItem {
  label: string;
  value: string | React.ReactNode;
}

export interface KeyValueListProps {
  items: KeyValueItem[];
  className?: string;
}

export function KeyValueList({ items, className = '' }: KeyValueListProps) {
  return (
    <dl className={`divide-y divide-slate-100 ${className}`}>
      {items.map((item, index) => (
        <div key={index} className="flex justify-between py-3">
          <dt className="text-sm font-medium text-slate-500">{item.label}</dt>
          <dd className="text-sm text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}