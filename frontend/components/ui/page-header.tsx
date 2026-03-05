"use client";

import React from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-6">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && (
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-sky-600 text-white rounded-lg px-4 py-2 hover:bg-sky-700 flex items-center gap-2 transition-colors"
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}