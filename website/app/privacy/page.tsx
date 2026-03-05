import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Privacy Policy — Invoica',
  description: 'Privacy Policy for the Invoica platform.',
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-bold text-invoica-blue mb-2">Privacy Policy</h1>
        <p className="text-sm text-invoica-gray-400 mb-12">Last updated: February 20, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-invoica-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">1. Introduction</h2>
            <p>
              Nexus Collective (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the Invoica platform. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">2. Information We Collect</h2>
            <h3 className="text-lg font-medium text-invoica-blue mt-4 mb-2">Account Information</h3>
            <p>When you create an account, we collect your email address and authentication credentials (via OAuth providers like GitHub and Google, or email/password).</p>

            <h3 className="text-lg font-medium text-invoica-blue mt-4 mb-2">Invoice Data</h3>
            <p>We process invoice data you submit through our API, including amounts, currencies, customer information, tax details, and payment metadata. This data is stored to provide the Service.</p>

            <h3 className="text-lg font-medium text-invoica-blue mt-4 mb-2">Usage Data</h3>
            <p>We collect information about how you use the Service, including API call logs, feature usage, and performance metrics.</p>

            <h3 className="text-lg font-medium text-invoica-blue mt-4 mb-2">Technical Data</h3>
            <p>We automatically collect IP addresses, browser type, operating system, and device information for security and analytics purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide and maintain the Service</li>
              <li>To process invoices and calculate taxes on your behalf</li>
              <li>To manage your account and subscription</li>
              <li>To communicate with you about the Service, updates, and security alerts</li>
              <li>To detect and prevent fraud, abuse, and security incidents</li>
              <li>To improve the Service and develop new features</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">4. Data Sharing</h2>
            <p>We do not sell your personal data. We may share data with:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Service Providers:</strong> Third parties that help us operate the Service (Supabase for database, Vercel for hosting, Stripe for payments)</li>
              <li><strong>Legal Requirements:</strong> When required by law, subpoena, or legal process</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">5. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide the Service. Invoice data is retained for the period required by applicable tax and financial regulations (typically 7 years). You may request deletion of your account and personal data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">6. Data Security</h2>
            <p>
              We implement industry-standard security measures including encryption in transit (TLS), encryption at rest, role-based access controls, and regular security audits. API keys are stored as SHA-256 hashes. However, no method of transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">7. Your Rights (GDPR / CCPA)</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Rectification:</strong> Request correction of inaccurate data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal data</li>
              <li><strong>Portability:</strong> Request your data in a portable format</li>
              <li><strong>Objection:</strong> Object to certain types of processing</li>
              <li><strong>Restriction:</strong> Request restriction of processing</li>
            </ul>
            <p className="mt-2">To exercise these rights, contact us at <a href="mailto:privacy@invoica.ai" className="text-invoica-purple hover:underline">privacy@invoica.ai</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">8. Cookies</h2>
            <p>
              We use essential cookies for authentication and session management. We do not use tracking cookies or third-party advertising cookies. Analytics cookies (if any) are anonymized and used only to improve the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">9. International Data Transfers</h2>
            <p>
              Your data may be processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place, including standard contractual clauses where required by GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">10. Children&apos;s Privacy</h2>
            <p>
              The Service is not intended for individuals under 18 years of age. We do not knowingly collect personal data from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes via email or a prominent notice on the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-invoica-blue mt-8 mb-3">12. Contact Us</h2>
            <p>
              For privacy-related inquiries, contact us at{' '}
              <a href="mailto:privacy@invoica.ai" className="text-invoica-purple hover:underline">privacy@invoica.ai</a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
