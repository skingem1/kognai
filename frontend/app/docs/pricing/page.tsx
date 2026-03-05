import React from 'react';

export default function PricingPage() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Plans &amp; Pricing</h1>

      <p style={{ marginBottom: '24px' }}>
        Invoica offers different pricing tiers depending on your profile type. Registered companies and Web3 projects each have plans tailored to their needs.
      </p>

      {/* ── Registered Company Plans ── */}
      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Registered Company Plans</h2>
      <p style={{ marginBottom: '16px' }}>
        For traditional businesses with tax, VAT, and compliance requirements.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px' }}>Feature</th>
            <th style={{ padding: '12px 8px' }}>Free</th>
            <th style={{ padding: '12px 8px' }}>Pro — $49/mo</th>
            <th style={{ padding: '12px 8px' }}>Enterprise</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Invoices / month</td>
            <td style={{ padding: '10px 8px' }}>100</td>
            <td style={{ padding: '10px 8px' }}>Unlimited</td>
            <td style={{ padding: '10px 8px' }}>Unlimited</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>API calls / month</td>
            <td style={{ padding: '10px 8px' }}>1,000</td>
            <td style={{ padding: '10px 8px' }}>50,000</td>
            <td style={{ padding: '10px 8px' }}>Unlimited</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>x402 payment protocol</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Tax compliance</td>
            <td style={{ padding: '10px 8px' }}>Basic</td>
            <td style={{ padding: '10px 8px' }}>Advanced (12 countries)</td>
            <td style={{ padding: '10px 8px' }}>Advanced + custom</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Company registry verification</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Priority support</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Dedicated account manager</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Custom SLA</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr>
            <td style={{ padding: '10px 8px' }}>On-premise deployment</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
        </tbody>
      </table>

      {/* ── Web3 Project Plans ── */}
      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>Web3 Project Plans</h2>
      <p style={{ marginBottom: '16px' }}>
        For decentralized projects operating without country registration. No VAT, no tax — invoicing and on-chain ledger only.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px' }}>Feature</th>
            <th style={{ padding: '12px 8px' }}>Free</th>
            <th style={{ padding: '12px 8px' }}>Growth — $24/mo</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Invoices / month</td>
            <td style={{ padding: '10px 8px' }}>100</td>
            <td style={{ padding: '10px 8px' }}>5,000</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>API calls / month</td>
            <td style={{ padding: '10px 8px' }}>1,000</td>
            <td style={{ padding: '10px 8px' }}>25,000</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>x402 payment protocol</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>On-chain ledger</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Multi-chain settlement tracking</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 8px' }}>Webhook notifications</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
          <tr>
            <td style={{ padding: '10px 8px' }}>Priority support</td>
            <td style={{ padding: '10px 8px' }}>&#8212;</td>
            <td style={{ padding: '10px 8px' }}>&#10003;</td>
          </tr>
        </tbody>
      </table>

      {/* ── FAQ ── */}
      <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>FAQ</h2>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>How do I upgrade my plan?</h3>
        <p style={{ color: '#4a5568' }}>
          During onboarding, select your desired plan. You can also upgrade later from the Settings page via Stripe Checkout.
        </p>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Can I switch between company and web3 plans?</h3>
        <p style={{ color: '#4a5568' }}>
          Your plan type is determined by your profile type (registered company or web3 project) set during onboarding. Contact support to change your profile type.
        </p>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>What happens when I exceed my limits?</h3>
        <p style={{ color: '#4a5568' }}>
          API calls beyond your monthly limit will receive a 429 (Too Many Requests) response. The SDK handles this automatically with retry logic. Upgrade your plan for higher limits.
        </p>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Is there an Enterprise plan for Web3 projects?</h3>
        <p style={{ color: '#4a5568' }}>
          Not yet. If you need higher limits for your Web3 project, contact us at <a href="mailto:sales@invoica.ai" style={{ color: '#635BFF' }}>sales@invoica.ai</a>.
        </p>
      </div>
    </div>
  );
}
