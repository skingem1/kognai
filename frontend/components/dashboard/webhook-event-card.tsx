"use client";

import React from "react";

interface WebhookEventCardProps {
  eventType: string;
  eventId: string;
  timestamp: string;
  status: "delivered" | "failed" | "pending";
}

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

const statusColors = {
  delivered: "bg-green-500",
  failed: "bg-red-500",
  pending: "bg-yellow-500",
};

export default function WebhookEventCard({
  eventType,
  eventId,
  timestamp,
  status,
}: WebhookEventCardProps) {
  return (
    <div className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-gray-900">{eventType}</h3>
          <p className="font-mono text-sm text-gray-500 mt-1">{eventId}</p>
          <p className="text-sm text-gray-400 mt-2">{formatRelativeTime(timestamp)}</p>
        </div>
        <div
          role="presentation"
          aria-label={`Status: ${status}`}
          className={`w-3 h-3 rounded-full mt-2 ${statusColors[status]}`}
        />
      </div>
    </div>
  );
}
