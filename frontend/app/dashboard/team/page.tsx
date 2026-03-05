export default function TeamPage() {
  const members = [
    { id: '1', name: 'Alex Chen', email: 'alex@invoica.dev', role: 'Owner' as const, status: 'active' as const, joinedAt: 'Jan 2026' },
    { id: '2', name: 'Sarah Kim', email: 'sarah@invoica.dev', role: 'Admin' as const, status: 'active' as const, joinedAt: 'Jan 2026' },
    { id: '3', name: 'Marcus Lee', email: 'marcus@invoica.dev', role: 'Developer' as const, status: 'active' as const, joinedAt: 'Feb 2026' },
    { id: '4', name: 'Jordan Taylor', email: 'jordan@example.com', role: 'Viewer' as const, status: 'invited' as const, joinedAt: 'Pending' },
  ];

  const roleColors = { Owner: 'bg-purple-100 text-purple-700', Admin: 'bg-blue-100 text-blue-700', Developer: 'bg-green-100 text-green-700', Viewer: 'bg-gray-100 text-gray-700' };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Team Members</h1>
      <p className="text-gray-500 mb-6">Manage your organization members and roles</p>
      <div className="space-y-3">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm">
            <div>
              <p className="font-semibold">{m.name}</p>
              <p className="text-sm text-gray-500">{m.email}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className={`px-2 py-1 rounded text-xs font-medium ${roleColors[m.role]}`}>{m.role}</span>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className={`w-2 h-2 rounded-full ${m.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                {m.joinedAt}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}