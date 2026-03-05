import React from 'react';

export default function ActivityPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Activity Log</h1>
      <p className="text-gray-600 mb-8">
        Monitor API usage and system events across your infrastructure.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Timestamp</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr className="border-t">
              <td className="px-6 py-4">System initialized</td>
              <td className="px-6 py-4"><span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Success</span></td>
              <td className="px-6 py-4">—</td>
              <td className="px-6 py-4">Platform ready</td>
            </tr>
            <tr className="border-t">
              <td className="px-6 py-4">API key created</td>
              <td className="px-6 py-4"><span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">Info</span></td>
              <td className="px-6 py-4">—</td>
              <td className="px-6 py-4">Default key generated</td>
            </tr>
            <tr className="border-t">
              <td className="px-6 py-4">Webhook endpoint registered</td>
              <td className="px-6 py-4"><span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">Info</span></td>
              <td className="px-6 py-4">—</td>
              <td className="px-6 py-4">Default endpoint</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-400">Showing 3 of 3 events</p>
      </div>
    </div>
  );
}