'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  createNewApiKey,
  fetchCompanyProfile,
  saveCompanyProfile,
  verifyCompanyProfile,
  fetchSupportedCountries,
  createCheckoutSession,
  type CompanyProfile,
  type SupportedCountry,
} from '@/lib/api-client';

interface WelcomeOnboardingProps {
  onComplete: () => void;
}

type OnboardingStep = 'profile' | 'pricing' | 'apiKey' | 'showKey';

/* ──────────────────────────────────────────────────────────
   Step indicator (1-2-3 dots across the top)
   ────────────────────────────────────────────────────────── */
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Company Profile' },
    { n: 2, label: 'Choose Plan' },
    { n: 3, label: 'API Key' },
  ];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className={`flex items-center gap-2 ${current >= s.n ? 'text-[#635BFF]' : 'text-slate-300'}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                current > s.n
                  ? 'bg-[#635BFF] text-white'
                  : current === s.n
                  ? 'bg-[#635BFF]/10 text-[#635BFF] ring-2 ring-[#635BFF]'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {current > s.n ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                s.n
              )}
            </div>
            <span className={`text-xs font-medium hidden sm:inline ${current >= s.n ? 'text-slate-700' : 'text-slate-400'}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 sm:w-12 h-0.5 rounded-full transition-colors ${current > s.n ? 'bg-[#635BFF]' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Main onboarding component
   ────────────────────────────────────────────────────────── */
export function WelcomeOnboarding({ onComplete }: WelcomeOnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('profile');
  const [loading, setLoading] = useState(true);

  // Profile state
  const [profileType, setProfileType] = useState<'registered_company' | 'web3_project' | null>(null);
  const [countries, setCountries] = useState<SupportedCountry[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [companyCountry, setCompanyCountry] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [address, setAddress] = useState('');
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; message: string } | null>(null);

  // API key state
  const [apiSecret, setApiSecret] = useState('');
  const [copied, setCopied] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);

  const selectedCountry = countries.find(c => c.code === companyCountry);

  const loadInitial = useCallback(async () => {
    try {
      const [profile, ctrs] = await Promise.all([
        fetchCompanyProfile().catch(() => null),
        fetchSupportedCountries().catch(() => []),
      ]);
      setCountries(ctrs);
      // If user already has a profile, skip to pricing
      if (profile) {
        setProfileType(profile.profile_type);
        setCompanyName(profile.company_name || '');
        setCompanyCountry(profile.company_country || '');
        setRegNumber(profile.registration_number || '');
        setVatNumber(profile.vat_number || '');
        setAddress(profile.address || '');
        setProjectName(profile.project_name || '');
        setStep('pricing');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  /* ── Profile save handler ── */
  const handleSaveProfile = async () => {
    if (!profileType) return;
    setProfileError('');
    setVerifyResult(null);
    setSaving(true);
    try {
      const payload = profileType === 'registered_company'
        ? {
            profile_type: 'registered_company' as const,
            company_name: companyName,
            company_country: companyCountry,
            registration_number: regNumber,
            vat_number: vatNumber || undefined,
            address: address || undefined,
          }
        : { profile_type: 'web3_project' as const, project_name: projectName };
      await saveCompanyProfile(payload);

      // For registered companies, auto-verify before moving to pricing
      if (profileType === 'registered_company') {
        setSaving(false);
        setVerifying(true);
        try {
          const result = await verifyCompanyProfile();
          setVerifyResult({ verified: result.verified, message: result.message });
          // Move to pricing after a short delay so user can see the result
          setTimeout(() => setStep('pricing'), 1500);
        } catch {
          // Verification failed but profile is saved — still proceed
          setVerifyResult({ verified: false, message: 'Verification could not be completed, but your profile has been saved. You can retry from Settings.' });
          setTimeout(() => setStep('pricing'), 2500);
        } finally {
          setVerifying(false);
        }
      } else {
        // Web3 projects skip verification
        setStep('pricing');
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save profile');
      setSaving(false);
    }
  };

  /* ── API key creation handler ── */
  const handleCreateKey = async () => {
    setCreatingKey(true);
    setKeyError('');
    try {
      const result = await createNewApiKey('My First Key');
      setApiSecret(result.secret);
      setStep('showKey');
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to create API key');
      setCreatingKey(false);
    }
  };

  /* ── Copy to clipboard ── */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  /* ── Pro tier checkout ── */
  const handleProCheckout = async () => {
    try {
      const { url } = await createCheckoutSession();
      window.location.href = url;
    } catch {
      // If checkout fails, just move to API key step on free tier
      setStep('apiKey');
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto mt-16">
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#635BFF]" />
        </div>
      </div>
    );
  }

  const stepNumber = step === 'profile' ? 1 : step === 'pricing' ? 2 : 3;

  return (
    <div className="max-w-2xl mx-auto mt-8 px-4">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="w-14 h-14 bg-gradient-to-br from-[#635BFF] to-[#818CF8] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome to Invoica!</h1>
        <p className="text-slate-500 text-sm mt-1">Let&apos;s get you set up in just a few steps.</p>
      </div>

      {/* Beta Banner */}
      <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-[#635BFF]/10 to-[#818CF8]/10 border border-[#635BFF]/20">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-[#635BFF] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">Beta</span>
          <span className="text-sm font-semibold text-slate-800">Free access to all features during beta</span>
        </div>
        <p className="text-xs text-slate-600 ml-[52px]">
          Sign up now to lock in your <strong className="text-[#635BFF]">Founding Agent</strong> discount — 20% off all paid plans for 24 months when billing starts (April 23).
        </p>
      </div>

      <StepIndicator current={stepNumber} />

      {/* ═══════════════════════════════════════════════════
          STEP 1: Company Profile
          ═══════════════════════════════════════════════════ */}
      {step === 'profile' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Set up your company profile</h2>
            <p className="text-sm text-slate-500 mt-0.5">This is required before you can generate API keys.</p>
          </div>

          {/* Type selector */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setProfileType('registered_company')}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                profileType === 'registered_company'
                  ? 'border-[#635BFF] bg-[#635BFF]/[0.04] shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${profileType === 'registered_company' ? 'bg-[#635BFF]/10' : 'bg-slate-100'}`}>
                  <svg className={`w-5 h-5 ${profileType === 'registered_company' ? 'text-[#635BFF]' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="font-semibold text-sm text-slate-900">Registered Company</div>
              </div>
              <p className="text-xs text-slate-500">Traditional entity with tax, VAT, and compliance.</p>
              {profileType === 'registered_company' && (
                <div className="absolute top-3 right-3">
                  <svg className="w-5 h-5 text-[#635BFF]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => setProfileType('web3_project')}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                profileType === 'web3_project'
                  ? 'border-[#635BFF] bg-[#635BFF]/[0.04] shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${profileType === 'web3_project' ? 'bg-[#635BFF]/10' : 'bg-slate-100'}`}>
                  <svg className={`w-5 h-5 ${profileType === 'web3_project' ? 'text-[#635BFF]' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div className="font-semibold text-sm text-slate-900">Web3 Project</div>
              </div>
              <p className="text-xs text-slate-500">No country, no VAT, no tax — invoicing &amp; ledger only.</p>
              {profileType === 'web3_project' && (
                <div className="absolute top-3 right-3">
                  <svg className="w-5 h-5 text-[#635BFF]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                </div>
              )}
            </button>
          </div>

          {/* Registered Company Form */}
          {profileType === 'registered_company' && (
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                  placeholder="Acme Corporation Ltd."
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Country of Registration</label>
                <select value={companyCountry} onChange={e => setCompanyCountry(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent bg-white">
                  <option value="">Select a country...</option>
                  {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {selectedCountry?.regLabel || 'Registration Number'}
                </label>
                <input type="text" value={regNumber} onChange={e => setRegNumber(e.target.value)}
                  placeholder={selectedCountry?.regPlaceholder || 'Enter registration number'}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent" />
                {selectedCountry && <p className="mt-1 text-xs text-slate-400">Format: {selectedCountry.regFormat}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  VAT Number <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input type="text" value={vatNumber} onChange={e => setVatNumber(e.target.value)}
                  placeholder="e.g. DE123456789"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Registered Address <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="123 Business Street, City, Country" rows={2}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent resize-none" />
              </div>
            </div>
          )}

          {/* Web3 Project Form */}
          {profileType === 'web3_project' && (
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
                <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                  placeholder="My DeFi Protocol"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent" />
              </div>
              <div className="p-3 rounded-lg bg-slate-50 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">&#128161;</span>
                  <span>Web3 projects operate without country registration. No VAT, no tax — only invoicing and ledger entries.</span>
                </div>
              </div>
            </div>
          )}

          {profileError && (
            <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700 flex items-center gap-2">
              <span>&#10007;</span> {profileError}
            </div>
          )}

          {/* Verification progress / result */}
          {verifying && (
            <div className="p-4 rounded-xl bg-[#635BFF]/5 border border-[#635BFF]/20 text-sm text-[#635BFF] flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 flex-shrink-0" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <span className="font-medium">Verifying your company with the official registry...</span>
            </div>
          )}
          {verifyResult && !verifying && (
            <div className={`p-4 rounded-xl text-sm flex items-center gap-3 ${verifyResult.verified ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
              <span className="flex-shrink-0 text-lg">{verifyResult.verified ? '✓' : 'ℹ️'}</span>
              <span className="font-medium">{verifyResult.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={onComplete} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
              Skip for now
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={saving || verifying || !profileType || (profileType === 'registered_company' && (!companyName || !companyCountry || !regNumber)) || (profileType === 'web3_project' && !projectName)}
              className="px-6 py-2.5 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-[#635BFF]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : verifying ? 'Verifying...' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          STEP 2: Pricing Tiers
          ═══════════════════════════════════════════════════ */}
      {step === 'pricing' && (
        <div className="space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-slate-900">Choose your plan</h2>
            <p className="text-sm text-slate-500 mt-0.5">All plans are <strong className="text-[#635BFF]">free during beta</strong>. Pick the tier you want when billing starts.</p>
          </div>

          {/* Founding Agent Badge */}
          <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-amber-50 border border-amber-200/60">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Founding Agent — 20% off for 24 months</p>
              <p className="text-xs text-amber-700">Your discount locks at signup and applies automatically when billing starts on Day 61 (April 23).</p>
            </div>
          </div>

          {/* ── Web3 Project Pricing (2 tiers: Free + $24 Growth) ── */}
          {profileType === 'web3_project' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto">
              {/* Free Tier */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-900">Free</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-slate-900">$0</span>
                    <span className="text-sm text-slate-500">/month</span>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-600 flex-1 mb-5">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    100 invoices/month
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    1,000 API calls/month
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    x402 payment protocol
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    On-chain ledger
                  </li>
                </ul>
                <button
                  onClick={() => setStep('apiKey')}
                  className="w-full py-2.5 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  Get Started Free
                </button>
              </div>

              {/* Growth Tier — Web3 highlighted */}
              <div className="rounded-2xl border-2 border-[#635BFF] bg-white p-5 flex flex-col relative shadow-lg shadow-[#635BFF]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white text-xs font-bold rounded-full">
                    Recommended
                  </span>
                </div>
                <div className="mb-4 mt-1">
                  <h3 className="font-semibold text-slate-900">Growth</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-slate-900">$24</span>
                    <span className="text-sm text-slate-500">/month</span>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-600 flex-1 mb-5">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    5,000 invoices/month
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    25,000 API calls/month
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Multi-chain settlement tracking
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Webhook notifications
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Priority support
                  </li>
                </ul>
                <button
                  onClick={handleProCheckout}
                  className="w-full py-2.5 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-[#635BFF]/25 transition-all"
                >
                  Upgrade to Growth
                </button>
              </div>
            </div>
          ) : (
            /* ── Registered Company Pricing (3 tiers: Free + $49 Pro + Enterprise) ── */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Free Tier */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-900">Free</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-slate-900">$0</span>
                    <span className="text-sm text-slate-500">/month</span>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-600 flex-1 mb-5">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    100 invoices/month
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    1,000 API calls/month
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    x402 payment protocol
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Basic tax compliance
                  </li>
                </ul>
                <button
                  onClick={() => setStep('apiKey')}
                  className="w-full py-2.5 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  Get Started Free
                </button>
              </div>

              {/* Pro Tier — highlighted */}
              <div className="rounded-2xl border-2 border-[#635BFF] bg-white p-5 flex flex-col relative shadow-lg shadow-[#635BFF]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white text-xs font-bold rounded-full">
                    Most Popular
                  </span>
                </div>
                <div className="mb-4 mt-1">
                  <h3 className="font-semibold text-slate-900">Pro</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-slate-900">$49</span>
                    <span className="text-sm text-slate-500">/month</span>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-600 flex-1 mb-5">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Unlimited invoices
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    50,000 API calls/month
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Advanced tax engine (12 countries)
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Company registry verification
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#635BFF] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Priority support
                  </li>
                </ul>
                <button
                  onClick={handleProCheckout}
                  className="w-full py-2.5 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-[#635BFF]/25 transition-all"
                >
                  Upgrade to Pro
                </button>
              </div>

              {/* Enterprise Tier */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-900">Enterprise</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-slate-900">Custom</span>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-600 flex-1 mb-5">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Everything in Pro
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Unlimited API calls
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Dedicated account manager
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Custom SLA &amp; compliance
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    On-premise deployment option
                  </li>
                </ul>
                <a
                  href="mailto:sales@invoica.ai"
                  className="w-full py-2.5 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all text-center block"
                >
                  Contact Sales
                </a>
              </div>
            </div>
          )}

          {/* Free tier skip link */}
          <div className="text-center pt-1">
            <button
              onClick={() => setStep('apiKey')}
              className="text-sm text-[#635BFF] hover:text-[#635BFF]/80 font-medium underline underline-offset-2 transition-colors"
            >
              I want free tier
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          STEP 3: Create API Key
          ═══════════════════════════════════════════════════ */}
      {step === 'apiKey' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500/10 to-[#635BFF]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#635BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>

          <h2 className="text-lg font-semibold text-slate-900 mb-1">Create your API key</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            Your API key authenticates requests from your AI agents to the Invoica platform.
          </p>

          {keyError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {keyError}
            </div>
          )}

          <button
            onClick={handleCreateKey}
            disabled={creatingKey}
            className="px-8 py-3 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-[#635BFF]/25 transition-all disabled:opacity-50"
          >
            {creatingKey ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Creating...
              </span>
            ) : 'Create My API Key'}
          </button>

          <button onClick={onComplete} className="block mx-auto mt-4 text-sm text-slate-400 hover:text-slate-600 transition-colors">
            Skip for now
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          STEP 3b: Show API Key
          ═══════════════════════════════════════════════════ */}
      {step === 'showKey' && (
        <div className="bg-white border border-emerald-200 rounded-2xl p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Your API Key is Ready!</h2>
            <p className="text-sm text-gray-500">Copy it now — you won&apos;t be able to see it again.</p>
          </div>

          <div className="bg-gray-900 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between gap-3">
              <code className="text-green-400 text-sm font-mono break-all flex-1">{apiSecret}</code>
              <button onClick={handleCopy}
                className="flex-shrink-0 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs font-medium transition-colors">
                {copied ? '&#10003; Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
            <p className="text-xs text-amber-800">
              <strong>Important:</strong> Store this key securely. It provides full API access to your account. Never expose it in client-side code or public repositories.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-xs font-semibold text-gray-700 mb-2">Quick start — create your first invoice:</p>
            <pre className="text-xs text-gray-600 font-mono overflow-x-auto whitespace-pre">{`curl -X POST https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api/v1/invoices \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 100, "currency": "USD", "customerName": "Acme Corp"}'`}</pre>
          </div>

          <div className="flex gap-3 justify-center">
            <button onClick={onComplete}
              className="px-6 py-2.5 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-all">
              Go to Dashboard
            </button>
            <a href="https://invoica.mintlify.app" target="_blank" rel="noopener noreferrer"
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-all">
              Read Docs
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
