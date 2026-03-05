'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchCompanyProfile,
  verifyCompanyProfile,
  fetchSupportedCountries,
  type CompanyProfile,
  type SupportedCountry,
} from '@/lib/api-client';

function VerificationBadge({ status }: { status: CompanyProfile['verification_status'] }) {
  const config = {
    verified: { label: 'Verified', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/20', icon: '✓' },
    pending: { label: 'Pending Review', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-600/20', icon: '◷' },
    failed: { label: 'Verification Failed', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20', icon: '✗' },
    unverified: { label: 'Unverified', bg: 'bg-slate-50', text: 'text-slate-600', ring: 'ring-slate-500/20', icon: '○' },
    not_applicable: { label: 'N/A', bg: 'bg-slate-50', text: 'text-slate-500', ring: 'ring-slate-400/20', icon: '—' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${config.bg} ${config.text} ${config.ring}`}>
      <span>{config.icon}</span> {config.label}
    </span>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
        {value || '—'}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  // General settings
  const [email, setEmail] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [notifications, setNotifications] = useState({
    invoiceCreated: true,
    paymentReceived: true,
    paymentOverdue: true,
    weeklyReport: false,
  });
  const [generalSaved, setGeneralSaved] = useState(false);

  // Company profile
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [countries, setCountries] = useState<SupportedCountry[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([fetchCompanyProfile(), fetchSupportedCountries()]);
      setCountries(c);
      if (p) {
        setProfile(p);
      }
    } catch {
      // Profile not yet created — that's OK
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const countryName = countries.find(c => c.code === profile?.company_country)?.name || profile?.company_country || '—';
  const selectedCountry = countries.find(c => c.code === profile?.company_country);

  const handleVerify = async () => {
    setVerifyMessage('');
    setVerifyError('');
    setVerifying(true);
    try {
      const result = await verifyCompanyProfile();
      setVerifyMessage(result.message);
      setProfile(result.profile);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveGeneral = () => {
    setGeneralSaved(true);
    setEditingEmail(false);
    setTimeout(() => setGeneralSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-8 max-w-2xl">
        <div><h1 className="text-3xl font-bold tracking-tight">Settings</h1></div>
        <div className="rounded-2xl border bg-white p-8 flex items-center justify-center min-h-[200px]">
          <div className="flex items-center gap-3 text-slate-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            Loading settings...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-slate-500">Manage your account preferences and company profile.</p>
      </div>

      {/* ─── Company Profile (Read-Only) ─── */}
      <div className="rounded-2xl border bg-white p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Company Profile</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {profile ? 'Your business identity for invoicing.' : 'Set up your business identity for invoicing.'}
            </p>
          </div>
          {profile && <VerificationBadge status={profile.verification_status} />}
        </div>

        {/* No profile yet — direct to onboarding */}
        {!profile && (
          <div className="text-center py-8">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-sm text-slate-500 mb-4">No company profile found. Complete the onboarding to set up your profile.</p>
            <a
              href="/"
              className="inline-flex px-5 py-2.5 text-sm font-semibold text-white bg-[#635BFF] rounded-lg hover:bg-[#635BFF]/90 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        )}

        {/* Profile exists — read-only display */}
        {profile && profile.profile_type === 'registered_company' && (
          <div className="space-y-4">
            {/* Type badge */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#635BFF]/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-[#635BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-700">Registered Company</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ReadOnlyField label="Company Name" value={profile.verified_company_name || profile.company_name} />
              <ReadOnlyField label="Country" value={countryName} />
              <ReadOnlyField label={selectedCountry?.regLabel || 'Registration Number'} value={profile.registration_number} />
              <ReadOnlyField label="VAT Number" value={profile.vat_number} />
            </div>
            <ReadOnlyField label="Registered Address" value={profile.address} />

            {/* Verified company name banner */}
            {profile.verified_company_name && profile.verification_status === 'verified' && (
              <div className="p-4 rounded-lg bg-emerald-50/50 border border-emerald-200">
                <div className="text-xs font-medium text-emerald-600 mb-1">Verified Company Name</div>
                <div className="text-sm font-semibold text-emerald-900">{profile.verified_company_name}</div>
                {profile.verified_at && (
                  <div className="text-xs text-emerald-500 mt-1">Verified on {new Date(profile.verified_at).toLocaleDateString()}</div>
                )}
              </div>
            )}

            {/* Verify button for unverified companies */}
            {profile.verification_status !== 'verified' && (
              <div className="pt-1">
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="px-5 py-2.5 text-sm font-semibold text-[#635BFF] border border-[#635BFF] rounded-lg hover:bg-[#635BFF]/5 transition-colors disabled:opacity-50"
                >
                  {verifying ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Verifying...
                    </span>
                  ) : 'Verify Company'}
                </button>
              </div>
            )}
          </div>
        )}

        {profile && profile.profile_type === 'web3_project' && (
          <div className="space-y-4">
            {/* Type badge */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#635BFF]/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-[#635BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-700">Web3 Project</span>
            </div>

            <ReadOnlyField label="Project Name" value={profile.project_name} />

            <div className="p-3 rounded-lg bg-slate-50 text-sm text-slate-500">
              <div className="flex items-start gap-2">
                <span className="mt-0.5">&#128161;</span>
                <span>Web3 projects operate without country registration. No VAT, no tax obligations.</span>
              </div>
            </div>
          </div>
        )}

        {/* Verification messages */}
        {verifyError && (
          <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700 flex items-center gap-2">
            <span>&#10007;</span> {verifyError}
          </div>
        )}
        {verifyMessage && (
          <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${profile?.verification_status === 'verified' ? 'bg-emerald-50 text-emerald-700' : profile?.verification_status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
            <span>{profile?.verification_status === 'verified' ? '✓' : profile?.verification_status === 'failed' ? '✗' : '◷'}</span> {verifyMessage}
          </div>
        )}

        {/* Info note about profile changes */}
        {profile && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-start gap-2">
            <svg className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <span>Company details cannot be changed after registration. Contact <a href="mailto:support@invoica.ai" className="text-[#635BFF] hover:underline">support@invoica.ai</a> if you need to update your company information.</span>
          </div>
        )}
      </div>

      {/* ─── General Settings ─── */}
      <div className="rounded-2xl border bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">General</h2>
          {!editingEmail && profile && (
            <button
              onClick={() => setEditingEmail(true)}
              className="text-sm font-medium text-[#635BFF] hover:text-[#635BFF]/80 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Billing Email</label>
            {editingEmail ? (
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="billing@company.com"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent"
                autoFocus
              />
            ) : (
              <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                {email || <span className="text-slate-400">Not set</span>}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Default Currency</label>
            {editingEmail ? (
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent bg-white"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="USDC">USDC - USD Coin</option>
              </select>
            ) : (
              <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                {currency === 'USD' ? 'USD - US Dollar' : currency === 'EUR' ? 'EUR - Euro' : currency === 'GBP' ? 'GBP - British Pound' : 'USDC - USD Coin'}
              </div>
            )}
          </div>
          {editingEmail && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSaveGeneral}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#635BFF] rounded-lg hover:bg-[#635BFF]/90 transition-colors"
              >
                {generalSaved ? 'Saved!' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditingEmail(false)}
                className="px-5 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Notifications ─── */}
      <div className="rounded-2xl border bg-white p-6 space-y-4">
        <h2 className="text-xl font-semibold">Notifications</h2>
        <div className="space-y-3">
          {([
            ['invoiceCreated', 'Invoice Created', 'Get notified when a new invoice is created by an agent'],
            ['paymentReceived', 'Payment Received', 'Get notified when a payment is settled on-chain'],
            ['paymentOverdue', 'Payment Overdue', 'Get notified when an invoice becomes overdue'],
            ['weeklyReport', 'Weekly Report', 'Receive a weekly summary of all invoicing activity'],
          ] as const).map(([key, label, desc]) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifications[key]}
                onChange={e => setNotifications(prev => ({ ...prev, [key]: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-[#635BFF] focus:ring-[#635BFF]"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">{label}</div>
                <div className="text-xs text-slate-500">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ─── Billing ─── */}
      <div className="rounded-2xl border bg-white p-6 space-y-4">
        <h2 className="text-xl font-semibold">Billing</h2>
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
          <div>
            <div className="font-medium text-slate-900">Free Plan</div>
            <div className="text-sm text-slate-500">100 invoices/month</div>
          </div>
          <a
            href="/billing"
            className="px-4 py-2 text-sm font-medium text-[#635BFF] border border-[#635BFF] rounded-lg hover:bg-[#635BFF]/5 transition-colors"
          >
            Manage Billing
          </a>
        </div>
      </div>
    </div>
  );
}
