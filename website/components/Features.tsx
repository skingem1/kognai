'use client';

interface FeatureItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  glowColor: string;
}

const features: FeatureItem[] = [
  {
    title: 'x402 Inference',
    description: 'Pay-per-use LLM calls at 0.003 USDC each. No API key rotation, no monthly bills — agents pay exactly what they use via on-chain EIP-712 proofs.',
    gradient: 'from-[#635BFF] to-[#818CF8]',
    glowColor: 'shadow-[#635BFF]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="10" fill="currentColor" opacity="0.06" />
        <path d="M10 14h3l2-4 2 8 2-4h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Automated Invoicing',
    description: 'Generate and retrieve invoices for every agent transaction via REST. Every payment is recorded with a unique invoice number and full line-item detail.',
    gradient: 'from-[#10B981] to-[#34D399]',
    glowColor: 'shadow-[#10B981]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="3" width="18" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 8h10M9 12h7M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="20" cy="19" r="4.5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18.5 19l1 1 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Settlement Detection',
    description: 'Real-time on-chain settlement tracking on Base. Every payment includes verified txHash, network, and payer identity — no manual reconciliation.',
    gradient: 'from-[#8B5CF6] to-[#A78BFA]',
    glowColor: 'shadow-[#8B5CF6]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="10" fill="currentColor" opacity="0.06" />
        <path d="M14 7v7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="14" cy="14" r="2" fill="currentColor" opacity="0.3" />
        <path d="M21 5l2 2M5 5L3 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Business Verification',
    description: 'Validate business identity across 6 jurisdictions before payment: EU VIES, UK Companies House, France SIRENE, Canada, Japan NTA, and Israel.',
    gradient: 'from-[#F59E0B] to-[#FBBF24]',
    glowColor: 'shadow-[#F59E0B]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <path d="M14 3L4 8v4c0 7.18 4.28 13.3 10 15 5.72-1.7 10-7.82 10-15V8L14 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M14 3L4 8v4c0 7.18 4.28 13.3 10 15 5.72-1.7 10-7.82 10-15V8L14 3z" fill="currentColor" opacity="0.08" />
        <path d="M10.5 13.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Ledger Export',
    description: 'Download your complete invoice and settlement history as CSV. Full audit trail ready for accounting software or compliance review.',
    gradient: 'from-[#3B82F6] to-[#60A5FA]',
    glowColor: 'shadow-[#3B82F6]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="3" width="18" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 8h10M9 12h10M9 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M18 19v5m0 0l-2-2m2 2l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Developer Dashboard',
    description: 'Manage API keys, browse invoices, monitor settlements, and view payment history from a clean web UI at app.invoica.ai.',
    gradient: 'from-[#EC4899] to-[#F472B6]',
    glowColor: 'shadow-[#EC4899]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="3" width="22" height="22" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="3" width="22" height="5" rx="2" fill="currentColor" opacity="0.12" />
        <circle cx="6.5" cy="5.5" r="1" fill="currentColor" opacity="0.4" />
        <circle cx="9.5" cy="5.5" r="1" fill="currentColor" opacity="0.4" />
        <circle cx="12.5" cy="5.5" r="1" fill="currentColor" opacity="0.4" />
        <rect x="6" y="11" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.7" />
        <rect x="6" y="18" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.7" />
        <rect x="16" y="11" width="7" height="11" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      </svg>
    ),
  },
];

export default function Features() {
  return (
    <section id="features" className="py-28 bg-white relative">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #0A2540 1px, transparent 0)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-invoica-purple" />
            <span className="mx-4 text-xs font-semibold text-invoica-purple uppercase tracking-widest">Features</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-invoica-purple" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-invoica-blue mb-6 tracking-tight">
            Everything your agents need
          </h2>
          <p className="text-lg text-invoica-gray-500 max-w-2xl mx-auto leading-relaxed">
            Financial infrastructure that works as autonomously as your AI agents.
            No manual intervention required.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative p-8 rounded-2xl border border-invoica-gray-100 hover:border-invoica-purple/20 bg-white hover:bg-gradient-to-b hover:from-white hover:to-invoica-purple/[0.02] transition-all duration-500 hover:shadow-xl hover:shadow-invoica-purple/5 hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Icon with per-feature color gradient */}
              <div className={`w-14 h-14 flex items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} text-white mb-6 group-hover:shadow-lg group-hover:${feature.glowColor} group-hover:scale-110 transition-all duration-500`}>
                {feature.icon}
              </div>

              <h3 className="text-lg font-semibold text-invoica-blue mb-3">{feature.title}</h3>
              <p className="text-sm text-invoica-gray-500 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
