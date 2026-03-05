export default function LogsPage() {
  const logs = [
    { id: '1', method: 'POST', path: '/v1/invoices', status: 201, duration: '145ms', timestamp: '2 min ago' },
    { id: '2', method: 'GET', path: '/v1/invoices/inv_042', status: 200, duration: '32ms', timestamp: '5 min ago' },
    { id: '3', method: 'POST', path: '/v1/webhooks', status: 201, duration: '89ms', timestamp: '12 min ago' },
    { id: '4', method: 'GET', path: '/v1/settlements', status: 200, duration: '67ms', timestamp: '20 min ago' },
    { id: '5', method: 'DELETE', path: '/v1/api-keys/key_old', status: 200, duration: '23ms', timestamp: '1 hr ago' },
    { id: '6', method: 'POST', path: '/v1/invoices', status: 400, duration: '12ms', timestamp: '2 hr ago' },
  ];

  const getMethodColor = (method: string) => {
    if (method === 'GET') return 'bg-green-100 text-green-800';
    if (method === 'POST') return 'bg-blue-100 text-blue-800';
    return 'bg-red-100 text-red-800';
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">API Logs</h1>
      <p className="text-gray-500 mb-6">Recent API requests and responses</p>
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-sm text-gray-500">
            <th className="pb-3 font-medium">Method</th>
            <th className="pb-3 font-medium">Path</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Duration</th>
            <th className="pb-3 font-medium">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b">
              <td className="py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${getMethodColor(log.method)}`}>{log.method}</span></td>
              <td className="py-3 font-mono text-sm">{log.path}</td>
              <td className={`py-3 font-medium ${getStatusColor(log.status)}`}>{log.status}</td>
              <td className="py-3 text-gray-500">{log.duration}</td>
              <td className="py-3 text-gray-500">{log.timestamp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}