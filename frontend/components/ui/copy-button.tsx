'use client';

import React, { useState } from 'react';

export interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = 'Copy', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ' +
        (copied
          ? 'border-green-300 text-green-700 bg-green-50'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50') +
        ' ' +
        className
      }
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}