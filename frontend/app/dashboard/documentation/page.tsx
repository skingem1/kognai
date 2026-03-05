export default function DocumentationPage() {
  const sections = [
    { id: '1', title: 'Getting Started', description: 'Quick start guide and setup instructions', icon: '🚀', href: '/docs/getting-started' },
    { id: '2', title: 'Authentication', description: 'API key management and security', icon: '🔐', href: '/docs/authentication' },
    { id: '3', title: 'Invoices API', description: 'Create, list, and manage invoices', icon: '📄', href: '/docs/api-reference/invoices' },
    { id: '4', title: 'Settlements', description: 'On-chain settlement tracking', icon: '⛓️', href: '/docs/api-reference/settlements' },
    { id: '5', title: 'Webhooks', description: 'Event notifications and delivery', icon: '🔔', href: '/docs/webhooks' },
    { id: '6', title: 'SDKs', description: 'TypeScript and Python client libraries', icon: '📦', href: '/docs/sdks' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Documentation</h1>
      <p className="text-muted-foreground mb-8">API reference and developer guides</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((section) => (
          <a key={section.id} href={section.href} className="block p-6 border rounded-lg hover:shadow-md transition-shadow">
            <div className="text-3xl mb-3">{section.icon}</div>
            <h2 className="text-lg font-semibold mb-2">{section.title}</h2>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}