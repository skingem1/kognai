import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Acceptable Use Policy — Invoica',
  description: 'Acceptable Use Policy for the Invoica platform.',
};

export default function AcceptableUsePage() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-bold text-invoica-blue mb-2">Acceptable Use Policy</h1>
        <p className="text-sm text-invoica-gray-400 mb-12">Last updated: February 20, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-invoica-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">1. Purpose</h2>
            <p>
              This Acceptable Use Policy (&ldquo;AUP&rdquo;) defines the acceptable and prohibited uses of the Invoica platform operated by Nexus Collective. This policy applies to all users, including AI agents, human operators, and automated systems.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">2. Acceptable Uses</h2>
            <p>The Invoica platform is designed for:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Generating and managing invoices for legitimate commercial transactions</li>
              <li>Calculating and tracking tax obligations across supported jurisdictions</li>
              <li>Processing payments via the x402 protocol for legitimate goods and services</li>
              <li>Monitoring AI agent spending and enforcing budget limits</li>
              <li>Integrating financial workflows into AI agent platforms</li>
              <li>Developing and testing applications using our API and SDK</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">3. Prohibited Activities</h2>
            <p>You may not use the Service to:</p>

            <h3 className="text-lg font-medium text-invoica-blue mt-4 mb-2">Financial Crimes</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Launder money or facilitate the proceeds of criminal activity</li>
              <li>Finance terrorism or other illegal activities</li>
              <li>Evade taxes or facilitate tax fraud</li>
              <li>Create fraudulent invoices for non-existent transactions</li>
              <li>Process payments for sanctioned individuals or entities</li>
            </ul>

            <h3 className="text-lg font-medium text-invoica-blue mt-4 mb-2">Technical Abuse</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Attempt to bypass rate limits, authentication, or access controls</li>
              <li>Conduct denial-of-service attacks or flood the API</li>
              <li>Probe, scan, or test vulnerabilities without written authorization</li>
              <li>Distribute malware, viruses, or malicious code through the Service</li>
              <li>Scrape data or reverse-engineer the Service</li>
              <li>Use the Service to attack or compromise other systems</li>
            </ul>

            <h3 className="text-lg font-medium text-invoica-blue mt-4 mb-2">Illegal Content and Activities</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Process transactions for illegal goods or services</li>
              <li>Store or transmit content that violates applicable laws</li>
              <li>Infringe on intellectual property rights</li>
              <li>Engage in deceptive or fraudulent practices</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">4. AI Agent Specific Rules</h2>
            <p>AI agents using Invoica must:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Have a human operator responsible for their actions</li>
              <li>Respect budget limits and not attempt to circumvent them</li>
              <li>Use valid and accurate data in invoice creation</li>
              <li>Not impersonate humans or other agents in transactions</li>
              <li>Comply with rate limits and backoff requirements</li>
              <li>Store API keys securely and not expose them in public code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">5. Resource Usage</h2>
            <p>
              Users must operate within the limits of their subscription tier. Excessive usage that impacts Service availability for others may result in throttling or temporary suspension. We will attempt to contact you before taking action.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">6. Enforcement</h2>
            <p>Violations of this AUP may result in:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Warning:</strong> First-time or minor violations may result in a warning</li>
              <li><strong>Throttling:</strong> API rate limits may be reduced</li>
              <li><strong>Suspension:</strong> Temporary suspension of Service access</li>
              <li><strong>Termination:</strong> Permanent account termination for serious or repeated violations</li>
              <li><strong>Legal Action:</strong> Reporting to law enforcement or pursuing legal remedies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">7. Reporting Violations</h2>
            <p>
              If you become aware of any violation of this AUP, please report it to{' '}
              <a href="mailto:abuse@invoica.ai" className="text-invoica-purple hover:underline">abuse@invoica.ai</a>.
              We take all reports seriously and will investigate promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">8. Changes</h2>
            <p>
              We may update this AUP from time to time. Material changes will be communicated via email or dashboard notification. Continued use of the Service after changes constitutes acceptance.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
