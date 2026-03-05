'use client';

const painPoints = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'No invoice, no record',
    description: 'Every agent payment disappears on-chain. Accounting teams have nothing to reconcile.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    title: 'Zero audit trail',
    description: 'Compliance, tax, and legal teams can\'t verify what agents spent, when, or why.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    title: 'No budget controls',
    description: 'Agents can overspend without limits. One runaway loop can drain a treasury.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
    title: 'Enterprise can\'t trust it',
    description: 'Without compliance tooling, multi-jurisdiction tax, and RBAC — enterprises won\'t deploy.',
  },
];

export default function Problem() {
  return (
    <section className="py-24 bg-[#fafbff] relative overflow-hidden">
      {/* Subtle top divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-invoica-purple/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-invoica-purple" />
            <span className="mx-4 text-xs font-semibold text-invoica-purple uppercase tracking-widest">The Problem</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-invoica-purple" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-invoica-blue mb-6 tracking-tight">
            AI agents can transact.
            <br />
            <span className="bg-gradient-to-r from-invoica-purple to-invoica-purple-light bg-clip-text text-transparent">
              Nobody tracks them.
            </span>
          </h2>
          <p className="text-lg text-invoica-gray-500 max-w-2xl mx-auto leading-relaxed">
            The x402 protocol unlocked autonomous agent payments — but left a $1T compliance gap.
            Every transaction is on-chain. None of it is invoiced, reconciled, or controlled.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {painPoints.map((point, i) => (
            <div
              key={point.title}
              className="relative p-6 rounded-2xl bg-white border border-red-100 hover:border-red-200 shadow-sm hover:shadow-md transition-all duration-300 group"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-red-50 text-red-400 mb-5 group-hover:bg-red-100 transition-colors duration-300">
                {point.icon}
              </div>
              <h3 className="text-base font-semibold text-invoica-blue mb-2">{point.title}</h3>
              <p className="text-sm text-invoica-gray-500 leading-relaxed">{point.description}</p>
            </div>
          ))}
        </div>

        {/* Resolution bridge */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-invoica-purple/5 border border-invoica-purple/15">
            <div className="w-2 h-2 rounded-full bg-invoica-purple animate-pulse" />
            <span className="text-sm font-medium text-invoica-gray-600">
              Invoica closes the gap — automated invoicing, compliance, and control for every agent payment.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
