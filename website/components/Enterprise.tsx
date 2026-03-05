'use client';

const enterpriseFeatures = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    title: 'RBAC & Team Permissions',
    description: 'Fine-grained role-based access. Finance, compliance, and ops teams each see exactly what they need.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    title: 'US & EU Tax Compliance',
    description: 'Automatic VAT and sales tax across US and EU. Reverse charge, VIES validation, and audit-ready reports included.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: 'On-Chain Audit Trails',
    description: 'Every invoice, payment, and settlement is cryptographically linked to its on-chain transaction. Immutable compliance records.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
      </svg>
    ),
    title: 'Custom Integrations',
    description: 'ERP connectors, custom webhooks, white-label invoices, and bespoke compliance workflows for your stack.',
  },
];

export default function Enterprise() {
  return (
    <section className="py-28 bg-white relative overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #0A2540 1px, transparent 0)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left: headline + CTA */}
          <div className="lg:sticky lg:top-32">
            <div className="inline-flex items-center justify-center mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-invoica-purple" />
              <span className="mx-4 text-xs font-semibold text-invoica-purple uppercase tracking-widest">Enterprise</span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-invoica-purple" />
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-invoica-blue mb-6 tracking-tight">
              Enterprise-grade
              <br />
              <span className="bg-gradient-to-r from-invoica-purple to-invoica-purple-light bg-clip-text text-transparent">
                from day one
              </span>
            </h2>

            <p className="text-lg text-invoica-gray-500 mb-8 leading-relaxed">
              Finance, compliance, and legal teams at leading enterprises require more than an API.
              Invoica ships the controls, audit trails, and support that make enterprise AI deployments possible.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-6 mb-10">
              {[
                { value: 'US + EU', label: 'Tax compliance' },
                { value: 'Base', label: 'Mainnet — more chains soon' },
                { value: '100%', label: 'On-chain audit trail' },
                { value: 'VIES', label: 'VAT validation' },
              ].map((stat) => (
                <div key={stat.label} className="p-4 rounded-xl border border-invoica-gray-100 bg-invoica-gray-50">
                  <div className="text-3xl font-bold text-invoica-blue mb-1 tracking-tight">{stat.value}</div>
                  <div className="text-xs text-invoica-gray-500">{stat.label}</div>
                </div>
              ))}
            </div>

            <a
              href="https://invoica.mintlify.app"
              className="inline-flex items-center px-8 py-4 text-sm font-semibold text-white bg-gradient-to-r from-invoica-purple to-invoica-purple-light rounded-full hover:shadow-xl hover:shadow-invoica-purple/30 transition-all duration-300 hover:-translate-y-0.5"
            >
              Read the Docs
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </a>
          </div>

          {/* Right: feature grid */}
          <div className="grid sm:grid-cols-2 gap-5">
            {enterpriseFeatures.map((feature, i) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl border border-invoica-gray-100 hover:border-invoica-purple/20 hover:shadow-lg hover:shadow-invoica-purple/5 transition-all duration-300 group"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-invoica-purple/8 text-invoica-purple mb-4 group-hover:bg-invoica-purple group-hover:text-white transition-all duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-sm font-semibold text-invoica-blue mb-2">{feature.title}</h3>
                <p className="text-xs text-invoica-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
