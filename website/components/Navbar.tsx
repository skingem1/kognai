'use client';

import Image from 'next/image';

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-gray-100/50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <a href="/" className="flex items-center">
            <Image src="/logo.png" alt="Invoica" width={432} height={115} className="h-[67px] w-auto" priority />
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a href="https://invoica.mintlify.app" className="text-sm font-medium text-invoica-gray-500 hover:text-invoica-blue transition-colors duration-200">
              Docs
            </a>
            <a href="#features" className="text-sm font-medium text-invoica-gray-500 hover:text-invoica-blue transition-colors duration-200">
              Features
            </a>
            <a href="https://github.com/skingem1/Invoica" className="text-sm font-medium text-invoica-gray-500 hover:text-invoica-blue transition-colors duration-200">
              GitHub
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://app.invoica.ai" className="hidden sm:inline text-sm font-medium text-invoica-gray-500 hover:text-invoica-blue transition-colors duration-200">
            Dashboard
          </a>
          <a
            href="https://app.invoica.ai/api-keys"
            className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-invoica-purple to-invoica-purple-light rounded-full hover:shadow-lg hover:shadow-invoica-purple/25 transition-all duration-300"
          >
            Get API Key
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </a>
        </div>
      </div>
    </nav>
  );
}