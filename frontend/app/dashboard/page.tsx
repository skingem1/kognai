export default function DashboardPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="border rounded-lg p-6">
          <p className="text-sm text-gray-500">Total Invoices</p>
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="border rounded-lg p-6">
          <p className="text-sm text-gray-500">Pending Settlements</p>
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="border rounded-lg p-6">
          <p className="text-sm text-gray-500">Active API Keys</p>
          <p className="text-2xl font-bold">0</p>
        </div>
      </div>
      
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="border rounded-lg p-6">
          <p className="text-gray-500 text-center">No recent activity</p>
        </div>
      </section>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="flex gap-4">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            Create Invoice
          </button>
          <button className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-200">
            View Settlements
          </button>
          <button className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-200">
            Manage API Keys
          </button>
        </div>
      </section>
    </div>
  );
}