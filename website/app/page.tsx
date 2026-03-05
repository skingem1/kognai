import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Problem from '@/components/Problem';
import Features from '@/components/Features';
import CodeExample from '@/components/CodeExample';
import Enterprise from '@/components/Enterprise';
import SocialProof from '@/components/SocialProof';
import BetaBanner from '@/components/BetaBanner';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Invoica — The Financial OS for AI Agents',
  description: 'Automated invoicing, tax compliance, budget enforcement, and settlement detection built on the x402 protocol. The invoice layer for the autonomous economy.',
  keywords: 'AI agent payments, x402 invoicing, agent financial OS, enterprise AI billing, autonomous agent invoicing',
  openGraph: {
    title: 'Invoica — The Financial OS for AI Agents',
    description: 'The invoice layer for the autonomous economy. Built on x402.',
    url: 'https://invoica.ai',
    siteName: 'Invoica',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Invoica — The Financial OS for AI Agents',
    description: 'Automated invoicing, tax compliance, budget enforcement for AI agents. Built on x402.',
  },
};

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        {/* 1. Hero — dual CTA: Start Building (dev) + Contact Sales (enterprise) */}
        <Hero />

        {/* 2. Problem — "AI agents can transact. Nobody tracks them." */}
        <Problem />

        {/* 3. Developer value prop — features grid */}
        <Features />

        {/* 4. Code example — developer experience section */}
        <CodeExample />

        {/* 5. Enterprise value prop — RBAC, compliance, SLA */}
        <Enterprise />

        {/* 6. Social proof — stats + testimonials */}
        <SocialProof />

        {/* 7. Closing CTA */}
        <BetaBanner />
      </main>
      <Footer />
    </>
  );
}
