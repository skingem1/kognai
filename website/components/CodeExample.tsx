'use client';

export default function CodeExample() {
  return (
    <section className="py-28 bg-invoica-blue relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-invoica-purple/30 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-invoica-purple/30 to-transparent" />
      <div className="absolute top-1/2 left-0 w-72 h-72 bg-invoica-purple/5 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left content */}
          <div>
            <div className="inline-flex items-center justify-center mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-invoica-purple" />
              <span className="mx-4 text-xs font-semibold text-invoica-purple-light uppercase tracking-widest">Developer Experience</span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-invoica-purple" />
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
              Built for developers
            </h2>
            <p className="text-lg text-invoica-gray-300 mb-10 leading-relaxed">
              A clean, typed API that feels natural. Create invoices, calculate taxes,
              and monitor settlements with just a few lines of code.
            </p>

            <ul className="space-y-5 mb-10">
              {[
                'Full TypeScript types for every API response',
                'Automatic retries with exponential backoff',
                'Webhook signature verification helpers',
                'Tree-shakeable — import only what you need',
              ].map((item) => (
                <li key={item} className="flex items-center gap-4 text-invoica-gray-300">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-invoica-purple/20 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-invoica-purple-light" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>

            <a href="https://invoica.mintlify.app/quickstart" className="group inline-flex items-center text-sm font-semibold text-invoica-purple-light hover:text-white transition-colors duration-200">
              Read the quickstart guide
              <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </a>
          </div>

          {/* Right code block */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-invoica-purple/10 to-invoica-purple-light/10 rounded-2xl blur-2xl" />
            <div className="relative bg-[#0d1b2a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                <span className="ml-3 text-invoica-gray-400 text-xs font-mono">webhook-handler.ts</span>
              </div>
              {/* Code */}
              <div className="p-6 font-mono text-sm leading-7 overflow-x-auto">
                <code>
                  <span className="text-invoica-purple-light">import</span>{' '}
                  <span className="text-white">{'{ verifyWebhook }'}</span>{' '}
                  <span className="text-invoica-purple-light">from</span>{' '}
                  <span className="text-green-400">{`'@invoica/sdk'`}</span>
                  {'\n\n'}
                  <span className="text-white">app.</span>
                  <span className="text-yellow-300">post</span>
                  <span className="text-white">(</span>
                  <span className="text-green-400">{`'/webhooks'`}</span>
                  <span className="text-white">{`, (req, res) => {`}</span>
                  {'\n'}
                  {'  '}<span className="text-invoica-purple-light">const</span>{' '}
                  <span className="text-white">event</span>{' '}
                  <span className="text-invoica-gray-400">=</span>{' '}
                  <span className="text-yellow-300">verifyWebhook</span>
                  <span className="text-white">(</span>
                  {'\n'}
                  {'    '}<span className="text-white">req.body,</span>
                  {'\n'}
                  {'    '}<span className="text-white">req.headers[</span>
                  <span className="text-green-400">{`'x-invoica-signature'`}</span>
                  <span className="text-white">],</span>
                  {'\n'}
                  {'    '}<span className="text-white">process.env.</span>
                  <span className="text-orange-300">WEBHOOK_SECRET</span>
                  {'\n'}
                  {'  '}<span className="text-white">)</span>
                  {'\n\n'}
                  {'  '}<span className="text-invoica-purple-light">switch</span>{' '}
                  <span className="text-white">(event.type) {'{'}</span>
                  {'\n'}
                  {'    '}<span className="text-invoica-purple-light">case</span>{' '}
                  <span className="text-green-400">{`'invoice.settled'`}</span>
                  <span className="text-white">:</span>
                  {'\n'}
                  {'      '}<span className="text-invoica-gray-400">{'// Payment confirmed on-chain'}</span>
                  {'\n'}
                  {'      '}<span className="text-yellow-300">grantAccess</span>
                  <span className="text-white">(event.data.buyer)</span>
                  {'\n'}
                  {'      '}<span className="text-invoica-purple-light">break</span>
                  {'\n'}
                  {'  '}<span className="text-white">{'}'}</span>
                  {'\n'}
                  <span className="text-white">{'})'}</span>
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
