'use client';

export default function BetaBanner() {
  return (
    <section id="beta" className="py-28 bg-invoica-gray-50 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-invoica-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        {/* Beta badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-invoica-purple/10 border border-invoica-purple/20 mb-8">
          <span className="w-2 h-2 rounded-full bg-invoica-purple animate-pulse" />
          <span className="text-xs font-semibold text-invoica-purple uppercase tracking-widest">Now in Beta</span>
        </div>

        <h2 className="text-4xl md:text-5xl font-bold text-invoica-blue mb-6 tracking-tight">
          Be among the first to build
          <br />
          <span className="bg-gradient-to-r from-invoica-purple to-invoica-purple-light bg-clip-text text-transparent">
            with Invoica
          </span>
        </h2>

        <p className="text-lg text-invoica-gray-500 max-w-2xl mx-auto mb-12 leading-relaxed">
          We&apos;re in private beta. Early access is free — get your API key, integrate in minutes,
          and help shape the future of autonomous agent payments.
        </p>

        {/* Perks grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-14">
          {[
            {
              icon: (
                <svg className="w-6 h-6 text-invoica-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ),
              title: 'Free during beta',
              desc: 'Full access to the API at no cost while we&apos;re in beta.',
            },
            {
              icon: (
                <svg className="w-6 h-6 text-invoica-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ),
              title: 'Founding member status',
              desc: 'Early adopters get locked-in rates and priority features at launch.',
            },
            {
              icon: (
                <svg className="w-6 h-6 text-invoica-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              ),
              title: 'Direct team access',
              desc: 'Chat directly with the team on Telegram. Your feedback shapes the roadmap.',
            },
          ].map((perk) => (
            <div key={perk.title} className="bg-white rounded-2xl p-7 border border-invoica-gray-200 shadow-sm hover:shadow-md hover:border-invoica-purple/30 transition-all duration-300">
              <div className="inline-flex p-3 bg-invoica-purple/5 rounded-xl mb-4">
                {perk.icon}
              </div>
              <h3 className="font-semibold text-invoica-blue mb-2">{perk.title}</h3>
              <p className="text-sm text-invoica-gray-500 leading-relaxed" dangerouslySetInnerHTML={{ __html: perk.desc }} />
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="https://app.invoica.ai/api-keys"
            className="group inline-flex items-center px-8 py-4 text-sm font-semibold text-white bg-gradient-to-r from-invoica-purple to-invoica-purple-light rounded-full hover:shadow-xl hover:shadow-invoica-purple/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            Get Early Access
            <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
          <a
            href="https://invoica.mintlify.app"
            className="inline-flex items-center px-8 py-4 text-sm font-semibold text-invoica-blue border-2 border-invoica-gray-200 rounded-full hover:bg-invoica-purple/5 hover:border-invoica-purple hover:text-invoica-purple transition-all duration-300"
          >
            Read the Docs
          </a>
        </div>

        <p className="mt-8 text-sm text-invoica-gray-400">
          No credit card required &middot; Pricing announced after beta
        </p>
      </div>
    </section>
  );
}
