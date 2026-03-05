'use client';

export default function DashboardSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">General</h2>
        <div className="form-like">
          <div className="flex items-center justify-between py-3 border-b">
            <span className="text-gray-700">Company Name</span>
            <div className="flex items-center gap-3">
              <span className="text-gray-600">Acme Corp</span>
              <button className="text-blue-600 hover:underline">Edit</button>
            </div>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <span className="text-gray-700">Time Zone</span>
            <span className="text-gray-600">UTC</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <span className="text-gray-700">Default Currency</span>
            <span className="text-gray-600">USD</span>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Notifications</h2>
        <div className="form-like">
          <div className="flex items-center justify-between py-3 border-b">
            <span className="text-gray-700">Email Alerts</span>
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Enabled</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <span className="text-gray-700">Webhook Failures</span>
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Enabled</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <span className="text-gray-700">Monthly Reports</span>
            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">Disabled</span>
          </div>
        </div>
      </section>
    </div>
  );
}