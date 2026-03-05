'use client';

const betaColumns = [
  {
    title: 'Invoicing & Settlements',
    price: 'Free',
    priceDetail: 'unlimited during beta',
    features: [
      'Create & retrieve invoices via REST',
      'Real-time settlement detection on Base',
      'Verified txHash on every payment',
      'CSV ledger export',
      'Developer dashboard at app.invoica.ai',
    ],
    gradient: 'from-[#635BFF] to-[#818CF8]',
  },
  {
    title: 'Business Verification',
    price: 'Free',
    priceDetail: '6 jurisdictions',
    features: [
      'EU VIES validation',
      'UK Companies House',
      'France SIRENE',
      'Canada CRA',
      'Japan NTA',
      'Israel',
    ],
    gradient: 'from-[#10B981] to-[#34D399]',
  },
  {
    title: 'AI Inference',
    price: '0.003',
    priceDetail: 'USDC per call',
    features: [
      'x402 EIP-712 payment proof',
      'No API key rotation',
      'No monthly subscription',
      'Pay exactly what you use',
      'On-chain payment record',
    ],
    gradient: 'from-[#F59E0B] to-[#FBBF24]',
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-28 bg-invoica-gray-50 relative">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-invoica-purple" />
            <span className="mx-4 text-xs font-semibold text-invoica-purple uppercase tracking-widest">Beta Program</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-invoica-purple" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-invoica-blue mb-6 tracking-tight">
            Free During Beta
          </h2>
          <p className="text-lg text-invoica-gray-500 max-w-2xl mx-auto">
            No credit card. No commitment. Everything is free while we&apos;re in beta —
            except AI inference, which is pay-per-use on-chain.
          </p>
        </div>

        {/* Three-column benefit grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {betaColumns.map((col) => (
            <div
              key={col.title}
              className="relative rounded-2xl p-8 bg-white shadow-sm border border-invoica-gray-200 hover:shadow-lg hover:border-invoica-gray-300 transition-all duration-300"
            >
              {/* Gradient accent bar */}
              <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${col.gradient} mb-6`} />

              <h3 className="text-lg font-semibold text-invoica-blue mb-4">{col.title}</h3>

              <div className="flex items-baseline gap-1.5 mb-6">
                <span className="text-4xl font-bold text-invoica-blue tracking-tight">{col.price}</span>
                <span className="text-invoica-gray-400 text-sm">{col.priceDetail}</span>
              </div>

              <ul className="space-y-3">
                {col.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-invoica-gray-600">
                    <svg className="w-4 h-4 text-invoica-purple flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Single CTA */}
        <div className="text-center mt-16">
          <a
            href="https://app.invoica.ai/api-keys"
            className="inline-flex items-center px-10 py-4 text-sm font-semibold text-white bg-gradient-to-r from-invoica-purple to-invoica-purple-light rounded-full hover:shadow-xl hover:shadow-invoica-purple/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            Get API Keys — Free Beta
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </a>
          <p className="text-sm text-invoica-gray-400 mt-4">
            Sign up with email or Google / GitHub OAuth.{' '}
            <a href="https://invoica.mintlify.app" className="text-invoica-purple hover:underline">Read the docs →</a>
          </p>
        </div>
      </div>
    </section>
  );
}
