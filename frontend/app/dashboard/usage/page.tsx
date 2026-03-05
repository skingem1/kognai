"use client";

import React from "react";

const endpoints = [
  { method: "POST", path: "/invoices", requests: "4,521 requests" },
  { method: "GET", path: "/invoices", requests: "3,892 requests" },
  { method: "GET", path: "/settlements", requests: "2,344 requests" },
  { method: "POST", path: "/webhooks", requests: "2,090 requests" },
];

export default function DashboardUsagePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">API Usage</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Total Requests (30d)</p>
          <p className="text-3xl font-bold mt-2">12,847</p>
          <p className="text-sm mt-1 text-green-600">+15.2%</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Success Rate</p>
          <p className="text-3xl font-bold mt-2">99.7%</p>
          <p className="text-sm mt-1 text-green-600">+0.1%</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Avg Response Time</p>
          <p className="text-3xl font-bold mt-2">142ms</p>
          <p className="text-sm mt-1 text-green-600">-8ms</p>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Requests by Endpoint</h2>
        <div>
          {endpoints.map((ep, idx) => (
            <div 
              key={idx} 
              className="flex justify-between items-center py-3 border-b last:border-b-0"
            >
              <span className="text-sm font-mono">
                {ep.method} {ep.path}
              </span>
              <span className="text-sm text-gray-600">{ep.requests}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}