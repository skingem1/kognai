'use client';

import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="bg-invoica-blue relative overflow-hidden">
      {/* Top border gradient */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-invoica-purple/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 pt-20 pb-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Image src="/logo-dark.png" alt="Invoica" width={432} height={115} className="h-[67px] w-auto mb-6" />
            <p className="text-sm text-invoica-gray-400 leading-relaxed max-w-sm">
              The Financial OS for AI Agents. Automated invoicing, tax compliance, and settlement detection built on the x402 protocol.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold text-invoica-gray-300 uppercase tracking-wider mb-5">Product</h4>
            <ul className="space-y-3">
              <li><a href="https://invoica.mintlify.app" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Documentation</a></li>
              <li><a href="https://invoica.mintlify.app/api-reference/overview" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">API Reference</a></li>
              <li><a href="https://invoica.mintlify.app/sdk/overview" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">SDK</a></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-semibold text-invoica-gray-300 uppercase tracking-wider mb-5">Resources</h4>
            <ul className="space-y-3">
              <li><a href="https://invoica.mintlify.app/quickstart" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Quickstart</a></li>
              <li><a href="https://invoica.mintlify.app/guides/create-invoice" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Guides</a></li>
              <li><a href="https://invoica.mintlify.app/concepts/x402-protocol" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">x402 Protocol</a></li>
              <li><a href="https://github.com/skingem1/Invoica" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">GitHub</a></li>
              <li><a href="/status" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">System Status</a></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-semibold text-invoica-gray-300 uppercase tracking-wider mb-5">Company</h4>
            <ul className="space-y-3">
              <li><a href="https://twitter.com/NexusCollectv" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Twitter / X</a></li>
              <li><a href="https://github.com/skingem1/Invoica" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Open Source</a></li>
              <li><a href="mailto:hello@invoica.ai" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Contact</a></li>
              <li><a href="mailto:support@invoica.ai" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Support</a></li>
              <li><a href="/terms" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Terms of Service</a></li>
              <li><a href="/privacy" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Privacy Policy</a></li>
              <li><a href="/acceptable-use" className="text-sm text-invoica-gray-400 hover:text-white transition-colors duration-200">Acceptable Use</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-invoica-gray-500">
            &copy; {new Date().getFullYear()} Invoica. Built by Nexus Collective.
          </p>
          <div className="flex gap-6">
            <a href="/terms" className="text-sm text-invoica-gray-500 hover:text-invoica-gray-300 transition-colors">Terms</a>
            <a href="/privacy" className="text-sm text-invoica-gray-500 hover:text-invoica-gray-300 transition-colors">Privacy</a>
            <a href="/acceptable-use" className="text-sm text-invoica-gray-500 hover:text-invoica-gray-300 transition-colors">AUP</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
