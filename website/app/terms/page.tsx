import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Terms of Service — Invoica',
  description: 'Terms of Service for using the Invoica platform.',
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-bold text-invoica-blue mb-2">Terms of Service</h1>
        <p className="text-sm text-invoica-gray-400 mb-12">Last updated: February 20, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-invoica-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Invoica platform (&ldquo;Service&rdquo;), operated by Nexus Collective (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">2. Description of Service</h2>
            <p>
              Invoica provides financial infrastructure for AI agents, including automated invoicing, tax compliance calculation, budget enforcement, and settlement detection via the x402 protocol. The Service is provided as an API and dashboard accessible at our designated URLs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">3. Account Registration</h2>
            <p>
              You must create an account to use the Service. You are responsible for maintaining the security of your account credentials, including API keys. You must immediately notify us of any unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Interfere with or disrupt the Service or servers connected to it</li>
              <li>Use the Service to process transactions related to illegal goods or services</li>
              <li>Resell or redistribute the Service without written permission</li>
              <li>Exceed rate limits or attempt to circumvent usage restrictions</li>
              <li>Use the Service to launder money or finance terrorism</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">5. Pricing and Payment</h2>
            <p>
              The Service offers Free, Pro, and Enterprise tiers. Paid subscriptions are billed monthly. You authorize us to charge your payment method for recurring fees. Prices may change with 30 days&apos; notice. Refunds are provided at our discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">6. API Usage and Rate Limits</h2>
            <p>
              API usage is subject to rate limits based on your subscription tier. We reserve the right to throttle or suspend access if usage exceeds reasonable limits or impacts Service availability for other users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">7. Data and Privacy</h2>
            <p>
              Your use of the Service is also governed by our Privacy Policy. You retain ownership of your data. We process data as described in our Privacy Policy and only as necessary to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">8. Tax Compliance Disclaimer</h2>
            <p>
              While Invoica provides tax calculation features, we are not a tax advisor. Tax calculations are provided for informational purposes and should be verified by a qualified tax professional. We are not responsible for the accuracy of tax calculations or compliance with specific tax jurisdictions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">9. Intellectual Property</h2>
            <p>
              The Service, its original content, features, and functionality are owned by Nexus Collective and are protected by international copyright, trademark, and other intellectual property laws. The x402 protocol is an open standard.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">10. Service Availability</h2>
            <p>
              We strive to maintain high availability but do not guarantee uninterrupted access. We may temporarily suspend the Service for maintenance, upgrades, or unforeseen circumstances. We will provide reasonable notice when possible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">11. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Nexus Collective shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the Service, including but not limited to loss of profits, data, or business opportunities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">12. Termination</h2>
            <p>
              We may terminate or suspend your access immediately, without notice, for conduct that we determine violates these Terms or is harmful to other users, us, or third parties. Upon termination, your right to use the Service ceases immediately. You may export your data within 30 days of termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">13. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify users of material changes via email or dashboard notification. Continued use after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">14. Contact</h2>
            <p>
              For questions about these Terms, contact us at{' '}
              <a href="mailto:legal@invoica.ai" className="text-invoica-purple hover:underline">legal@invoica.ai</a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
