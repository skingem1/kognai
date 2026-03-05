import React from 'react';

type NotificationType = 'info' | 'warning' | 'error' | 'success';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  time: string;
  read: boolean;
}

const notifications: Notification[] = [
  { id: '1', title: 'Invoice Paid', message: 'Invoice INV-0042 payment confirmed', type: 'success', time: '5 minutes ago', read: false },
  { id: '2', title: 'Webhook Delivery Failed', message: 'Failed to deliver to https://api.example.com/hook', type: 'error', time: '1 hour ago', read: false },
  { id: '3', title: 'API Key Expiring', message: 'Production API key expires in 7 days', type: 'warning', time: '3 hours ago', read: true },
  { id: '4', title: 'Settlement Confirmed', message: 'Batch #SB-2024-0156 settled on Base', type: 'success', time: 'Yesterday', read: true },
  { id: '5', title: 'System Update', message: 'Platform updated to v2.1.0', type: 'info', time: '2 days ago', read: true },
];

const typeStyles: Record<NotificationType, string> = {
  success: 'border-l-green-500',
  error: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  info: 'border-l-blue-500',
};

export default function NotificationsPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Notifications</h1>
      <p className="text-gray-600 mb-6">System alerts and notifications</p>
      <div className="space-y-3">
        {notifications.map((n) => (
          <div key={n.id} className={`p-4 border-l-4 bg-white shadow-sm ${typeStyles[n.type]} ${!n.read ? 'bg-blue-50' : ''}`}>
            <div className="flex justify-between items-start">
              <h3 className="font-bold">{n.title}</h3>
              <span className="text-sm text-gray-500">{n.time}</span>
            </div>
            <p className="text-gray-600 mt-1">{n.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}