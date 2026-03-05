import React from 'react';

interface SettlementBadgeProps {
  status: string;
  txHash?: string | null;
  chain?: string;
  confirmedAt?: string | null;
}

export function SettlementBadge({ status, txHash, chain, confirmedAt }: SettlementBadgeProps) {
  const statusLower = status.toLowerCase();
  const isConfirmed = statusLower === 'confirmed';
  const isPending = statusLower === 'pending';
  const bgColor = isConfirmed ? 'bg-emerald-100' : isPending ? 'bg-amber-100' : 'bg-gray-100';
  const textColor = isConfirmed ? 'text-emerald-700' : isPending ? 'text-amber-700' : 'text-gray-700';

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
        {status}
      </span>
      {txHash && (
        <span className="text-xs text-gray-500">
          {txHash.slice(0, 6)}...{txHash.slice(-4)}
        </span>
      )}
      {confirmedAt && (
        <span className="text-xs text-gray-400">
          {new Date(confirmedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
