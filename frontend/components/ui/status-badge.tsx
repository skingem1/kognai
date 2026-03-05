import React from "react";

type Status = "completed" | "pending" | "failed" | "processing" | "settled" | "paid" | "overdue" | "cancelled";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  completed: { bg: "bg-green-100", text: "text-green-800" },
  settled: { bg: "bg-green-100", text: "text-green-800" },
  paid: { bg: "bg-green-100", text: "text-green-800" },
  pending: { bg: "bg-yellow-100", text: "text-yellow-800" },
  processing: { bg: "bg-blue-100", text: "text-blue-800" },
  failed: { bg: "bg-red-100", text: "text-red-800" },
  overdue: { bg: "bg-red-100", text: "text-red-800" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-800" },
};

const defaultStyle = { bg: "bg-gray-100", text: "text-gray-800" };

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const styles = statusStyles[status.toLowerCase()] || defaultStyle;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${styles.bg} ${styles.text} ${className}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default StatusBadge;
