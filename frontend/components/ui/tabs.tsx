'use client';

import React, { useState } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultTabId?: string;
  className?: string;
}

export function Tabs({ tabs, defaultTabId, className = '' }: TabsProps) {
  const [activeTab, setActiveTab] = useState<string>(
    defaultTabId || tabs[0]?.id || ''
  );

  const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <div className={className}>
      <nav className="flex border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2 text-sm font-medium
              ${
                tab.id === activeTab
                  ? 'border-b-2 border-sky-500 text-sky-600'
                  : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="py-4">{activeTabContent}</div>
    </div>
  );
}