# Landing Page Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace misleading marketing copy with accurate, live-data-backed content, surface x402 Inference as the headline feature, and swap the confusing pricing table for a simple Beta Program section.

**Architecture:** Pure copy/content changes to four existing React components in `website/components/`. No new files, no new routes, no backend changes. Each component is self-contained — tasks can be done in any order.

**Tech Stack:** Next.js 14, React, Tailwind CSS, existing `invoica-*` color tokens.

---

## Task 1: Hero — Badge, Sub-Headline, CTA

**Files:**
- Modify: `website/components/Hero.tsx`

### Step 1: Make the change

In `website/components/Hero.tsx`, make three targeted edits:

**Edit 1 — Badge text** (line 27):
```tsx
// BEFORE:
<span className="text-xs font-medium text-invoica-gray-500 tracking-wide uppercase">Built on the x402 Protocol</span>

// AFTER:
<span className="text-xs font-medium text-invoica-gray-500 tracking-wide uppercase">Now in Public Beta</span>
```

**Edit 2 — Sub-headline** (line 39):
```tsx
// BEFORE:
Automated invoicing, tax compliance, budget enforcement, and settlement detection.
Your AI agents handle payments — Invoica handles the infrastructure.

// AFTER:
Automated invoicing, settlement detection, and pay-per-use AI inference — all on Base.
Your AI agents handle payments — Invoica handles the infrastructure.
```

**Edit 3 — Primary CTA text** (line 48):
```tsx
// BEFORE:
Start Building

// AFTER:
Get API Keys — Free
```

**Edit 4 — Sub-label** (line 63): Remove the "Free tier — first invoice in <10 min" label and replace with a new one:
```tsx
// BEFORE:
Free tier — first invoice in &lt;10 min

// AFTER:
Free during beta — no credit card required
```

### Step 2: Verify visually

Run dev server and confirm:
```bash
cd /Users/tarekmnif/Invoica/website && npm run dev
# open http://localhost:3000 — check hero badge, sub-headline, and CTA button
```

Expected: badge says "Now in Public Beta", sub-headline has no "tax compliance" or "budget enforcement", CTA says "Get API Keys — Free".

### Step 3: Commit
```bash
cd /Users/tarekmnif/Invoica
git add website/components/Hero.tsx
git commit -m "fix(landing): hero badge → Public Beta, remove unshipped features from sub-headline"
```

---

## Task 2: Features — Replace 6 Cards

**Files:**
- Modify: `website/components/Features.tsx`

### Step 1: Replace the `features` array (lines 11–102)

The current array has 6 items. Replace the entire array with this new one. The component render code (lines 104–149) is unchanged.

```tsx
const features: FeatureItem[] = [
  {
    title: 'x402 Inference',
    description: 'Pay-per-use LLM calls at 0.003 USDC each. No API key rotation, no monthly bills — agents pay exactly what they use via on-chain EIP-712 proofs.',
    gradient: 'from-[#635BFF] to-[#818CF8]',
    glowColor: 'shadow-[#635BFF]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="10" fill="currentColor" opacity="0.06" />
        <path d="M10 14h3l2-4 2 8 2-4h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Automated Invoicing',
    description: 'Generate and retrieve invoices for every agent transaction via REST. Every payment is recorded with a unique invoice number and full line-item detail.',
    gradient: 'from-[#10B981] to-[#34D399]',
    glowColor: 'shadow-[#10B981]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="3" width="18" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 8h10M9 12h7M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="20" cy="19" r="4.5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18.5 19l1 1 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Settlement Detection',
    description: 'Real-time on-chain settlement tracking on Base. Every payment includes verified txHash, network, and payer identity — no manual reconciliation.',
    gradient: 'from-[#8B5CF6] to-[#A78BFA]',
    glowColor: 'shadow-[#8B5CF6]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="10" fill="currentColor" opacity="0.06" />
        <path d="M14 7v7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="14" cy="14" r="2" fill="currentColor" opacity="0.3" />
        <path d="M21 5l2 2M5 5L3 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Business Verification',
    description: 'Validate business identity across 6 jurisdictions before payment: EU VIES, UK Companies House, France SIRENE, Canada, Japan NTA, and Israel.',
    gradient: 'from-[#F59E0B] to-[#FBBF24]',
    glowColor: 'shadow-[#F59E0B]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <path d="M14 3L4 8v4c0 7.18 4.28 13.3 10 15 5.72-1.7 10-7.82 10-15V8L14 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M14 3L4 8v4c0 7.18 4.28 13.3 10 15 5.72-1.7 10-7.82 10-15V8L14 3z" fill="currentColor" opacity="0.08" />
        <path d="M10.5 13.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Ledger Export',
    description: 'Download your complete invoice and settlement history as CSV. Full audit trail ready for accounting software or compliance review.',
    gradient: 'from-[#3B82F6] to-[#60A5FA]',
    glowColor: 'shadow-[#3B82F6]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="3" width="18" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 8h10M9 12h10M9 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M18 19v5m0 0l-2-2m2 2l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Developer Dashboard',
    description: 'Manage API keys, browse invoices, monitor settlements, and view payment history from a clean web UI at app.invoica.ai.',
    gradient: 'from-[#EC4899] to-[#F472B6]',
    glowColor: 'shadow-[#EC4899]/25',
    icon: (
      <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="3" width="22" height="22" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="3" width="22" height="5" rx="2" fill="currentColor" opacity="0.12" />
        <circle cx="6.5" cy="5.5" r="1" fill="currentColor" opacity="0.4" />
        <circle cx="9.5" cy="5.5" r="1" fill="currentColor" opacity="0.4" />
        <circle cx="12.5" cy="5.5" r="1" fill="currentColor" opacity="0.4" />
        <rect x="6" y="11" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.7" />
        <rect x="6" y="18" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.7" />
        <rect x="16" y="11" width="7" height="11" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      </svg>
    ),
  },
];
```

### Step 2: Verify visually

```bash
# dev server already running from Task 1
# scroll to Features section — confirm:
# - Card 1 = "x402 Inference" with purple/indigo gradient
# - No "Tax Compliance" card
# - No "Budget Enforcement" card
# - No "TypeScript SDK" card
# - "Business Verification" and "Ledger Export" are present
```

### Step 3: Commit
```bash
cd /Users/tarekmnif/Invoica
git add website/components/Features.tsx
git commit -m "fix(landing): replace features — add x402 inference, biz verification, ledger export; remove unshipped cards"
```

---

## Task 3: Social Proof — Real Numbers

**Files:**
- Modify: `website/components/SocialProof.tsx`

### Step 1: Replace the `stats` array (lines 3–8)

```tsx
// BEFORE:
const stats = [
  { value: 'x402', label: 'Native Protocol', description: 'First-class support for x402 EIP-712 payment proofs' },
  { value: '100+', label: 'SDK Modules', description: 'Fully typed TypeScript with 26 React hooks' },
  { value: 'Base', label: 'Mainnet Live', description: 'Real settlements on Base. Multichain support in development.' },
  { value: '<10m', label: 'Time to First Invoice', description: 'From API key to production invoice in minutes' },
];

// AFTER:
const stats = [
  { value: '22', label: 'Invoices Created', description: 'Real invoices generated and stored on-chain since launch' },
  { value: '14', label: 'Settlements on Base', description: 'Confirmed on-chain payments with verified txHash' },
  { value: '6', label: 'Countries Verified', description: 'EU VIES, UK, France, Canada, Japan, Israel' },
  { value: '0.003', label: 'USDC per AI Call', description: 'Pay exactly what you use — no monthly subscription' },
];
```

### Step 2: Verify visually

```bash
# scroll to "By the Numbers" section — confirm:
# "22" / "Invoices Created"
# "14" / "Settlements on Base"
# "6"  / "Countries Verified"
# "0.003" / "USDC per AI Call"
# NO "100+" stat
```

### Step 3: Commit
```bash
cd /Users/tarekmnif/Invoica
git add website/components/SocialProof.tsx
git commit -m "fix(landing): replace hype stats with verified real numbers from CTO report"
```

---

## Task 4: Pricing → Beta Program (Full Rewrite)

**Files:**
- Modify: `website/components/Pricing.tsx`

### Step 1: Rewrite the entire file

Replace the full content of `website/components/Pricing.tsx` with:

```tsx
'use client';

const betaColumns = [
  {
    title: 'Invoicing & Settlements',
    price: 'Free',
    priceDetail: 'unlimited during beta',
    features: [
      'Create & retrieve invoices via REST',
      'Real-time settlement detection on Base',
      'Verified txHash on every payment',
      'CSV ledger export',
      'Developer dashboard at app.invoica.ai',
    ],
    gradient: 'from-[#635BFF] to-[#818CF8]',
  },
  {
    title: 'Business Verification',
    price: 'Free',
    priceDetail: '6 jurisdictions',
    features: [
      'EU VIES validation',
      'UK Companies House',
      'France SIRENE',
      'Canada CRA',
      'Japan NTA',
      'Israel',
    ],
    gradient: 'from-[#10B981] to-[#34D399]',
  },
  {
    title: 'AI Inference',
    price: '0.003',
    priceDetail: 'USDC per call',
    features: [
      'x402 EIP-712 payment proof',
      'No API key rotation',
      'No monthly subscription',
      'Pay exactly what you use',
      'On-chain payment record',
    ],
    gradient: 'from-[#F59E0B] to-[#FBBF24]',
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-28 bg-invoica-gray-50 relative">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-invoica-purple" />
            <span className="mx-4 text-xs font-semibold text-invoica-purple uppercase tracking-widest">Beta Program</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-invoica-purple" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-invoica-blue mb-6 tracking-tight">
            Free During Beta
          </h2>
          <p className="text-lg text-invoica-gray-500 max-w-2xl mx-auto">
            No credit card. No commitment. Everything is free while we&apos;re in beta —
            except AI inference, which is pay-per-use on-chain.
          </p>
        </div>

        {/* Three-column benefit grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {betaColumns.map((col) => (
            <div
              key={col.title}
              className="relative rounded-2xl p-8 bg-white shadow-sm border border-invoica-gray-200 hover:shadow-lg hover:border-invoica-gray-300 transition-all duration-300"
            >
              {/* Gradient accent bar */}
              <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${col.gradient} mb-6`} />

              <h3 className="text-lg font-semibold text-invoica-blue mb-4">{col.title}</h3>

              <div className="flex items-baseline gap-1.5 mb-6">
                <span className="text-4xl font-bold text-invoica-blue tracking-tight">{col.price}</span>
                <span className="text-invoica-gray-400 text-sm">{col.priceDetail}</span>
              </div>

              <ul className="space-y-3">
                {col.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-invoica-gray-600">
                    <svg className="w-4 h-4 text-invoica-purple flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Single CTA */}
        <div className="text-center mt-16">
          <a
            href="https://app.invoica.ai/api-keys"
            className="inline-flex items-center px-10 py-4 text-sm font-semibold text-white bg-gradient-to-r from-invoica-purple to-invoica-purple-light rounded-full hover:shadow-xl hover:shadow-invoica-purple/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            Get API Keys — Free Beta
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </a>
          <p className="text-sm text-invoica-gray-400 mt-4">
            Sign up with email or Google / GitHub OAuth.{' '}
            <a href="https://invoica.mintlify.app" className="text-invoica-purple hover:underline">Read the docs →</a>
          </p>
        </div>
      </div>
    </section>
  );
}
```

### Step 2: Verify visually

```bash
# scroll to Pricing/Beta section — confirm:
# - Section label says "Beta Program" (not "Pricing")
# - Headline says "Free During Beta"
# - 3 columns: "Invoicing & Settlements" / "Business Verification" / "AI Inference"
# - No Developer/Growth/Enterprise pricing tiers
# - Single CTA button: "Get API Keys — Free Beta"
# - Footer note mentions email/Google/GitHub OAuth (no "no email required" claim)
```

### Step 3: Commit
```bash
cd /Users/tarekmnif/Invoica
git add website/components/Pricing.tsx
git commit -m "fix(landing): replace pricing tiers with beta program — free + pay-per-use AI inference"
```

---

## Task 5: Push + Deploy

### Step 1: Push to remote
```bash
cd /Users/tarekmnif/Invoica
git push
```

If remote is ahead:
```bash
git pull --rebase && git push
```

### Step 2: Verify production deploy

The website is on Vercel (auto-deploys on push to main). Check deployment status:
```bash
# Option A — Vercel CLI if available:
vercel ls

# Option B — open https://invoica.ai and verify all 4 sections are updated
```

### Step 3: Smoke check

Manually verify these 4 sections on https://invoica.ai:
- [ ] Hero badge: "Now in Public Beta"
- [ ] Sub-headline: no "tax compliance" or "budget enforcement"
- [ ] CTA: "Get API Keys — Free"
- [ ] Features card 1: "x402 Inference"
- [ ] Stats: 22, 14, 6, 0.003 (no "100+")
- [ ] Beta section: no pricing tiers, single CTA "Get API Keys — Free Beta"

---

## Out of Scope

- `Problem.tsx` — unchanged
- `CodeExample.tsx` — unchanged
- No backend changes
- No new routes
- No dynamic stat fetching (hardcoded real numbers for now)
