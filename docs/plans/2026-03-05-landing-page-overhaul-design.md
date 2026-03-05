# Landing Page Overhaul — Design Doc
**Date:** 2026-03-05
**Approach:** Option B — Full narrative overhaul
**Inputs:** CMO audit (`reports/cmo/landing-page-audit-2026-03-05.md`), CTO shipped report (`reports/cto/whats-shipped-2026-03-05.md`)

---

## Problem

The current landing page makes four categories of mistakes:

1. **Misleading features** — Budget Enforcement and Tax Compliance are listed as shipped features but are not implemented in any route.
2. **Hidden best feature** — x402 inference (`POST /v1/ai/inference`, 0.003 USDC/call) is not mentioned anywhere on the page.
3. **Hype stats** — "100+ SDK Modules" is unverified. Real numbers exist (22 invoices, 14 settlements, 6 countries).
4. **Confusing pricing** — Paid tiers are shown during a free beta, which signals cost before value.

---

## Section 1 — Hero

**Badge:** `Now in Public Beta`
**Headline:** `The Financial OS for AI Agents`
**Sub-headline:** `Automated invoicing, settlement detection, and pay-per-use AI inference — all on Base.`
**Primary CTA:** `Get API Keys — Free`
**Secondary CTA:** `View Docs`

**Changes from current:**
- Remove "tax compliance" and "budget enforcement" from the sub-headline.
- Replace dynamic "Beta Day X" (would go stale) with static "Now in Public Beta".

---

## Section 2 — Features

Six cards. x402 Inference moves to card 1 (currently not on page at all).

| # | Card Title | Description | Status |
|---|---|---|---|
| 1 | **x402 Inference** | Pay-per-use LLM calls at 0.003 USDC each. No API key rotation, no monthly bills — agents pay exactly what they use. | ✅ Live |
| 2 | **Automated Invoicing** | Agents create and retrieve invoices via REST. Every transaction is recorded with a unique invoice number. | ✅ Live |
| 3 | **Settlement Detection** | Real-time on-chain settlement tracking on Base. Verified txHash and payer identity on every payment. | ✅ Live |
| 4 | **Business Verification** | Validate business identity across 6 jurisdictions: EU VIES, UK, France, Canada, Japan, Israel. | ✅ Live |
| 5 | **Ledger Export** | Download your full invoice and settlement history as CSV for accounting and audit. | ✅ Live |
| 6 | **Developer Dashboard** | Browse invoices, settlements, and API keys in a clean web UI at app.invoica.ai. | ✅ Live |

**Changes from current:**
- Remove Tax Compliance card (not implemented).
- Remove Budget Enforcement card (not implemented).
- Add x402 Inference as card 1.
- Add Business Verification as card 4.
- Add Ledger Export as card 5.

---

## Section 3 — Social Proof

Replace hype stats with real numbers from the CTO report.

| Stat | Value | Label |
|---|---|---|
| Invoices | 22 | Invoices Created |
| Settlements | 14 | Settlements on Base |
| Countries | 6 | Countries Verified |
| Price | 0.003 USDC | Per AI Inference Call |

**Changes from current:**
- Remove "100+" (unverified).
- All four numbers are pulled from the live DB/routes as of 2026-03-05.

---

## Section 4 — Beta Program (replaces Pricing)

Remove the three-tier paid pricing table entirely. Replace with a three-column benefit summary + single CTA.

**Headline:** `Free During Beta`
**Sub-headline:** `No credit card. No commitment. Everything is free while we're in beta — except AI inference, which is pay-per-use on-chain.`

| Column | Title | Detail |
|---|---|---|
| 1 | Invoicing & Settlements | Free — unlimited during beta |
| 2 | Business Verification | Free — 6 jurisdictions |
| 3 | AI Inference | 0.003 USDC/call — pay only what you use |

**CTA:** `Get API Keys — Free Beta →`

**Changes from current:**
- Remove Developer / Growth / Enterprise pricing tiers.
- "No Email Required" claim removed — login requires email or Google/GitHub OAuth.

---

## Files to Modify

| File | Change |
|---|---|
| `website/components/Hero.tsx` | Badge, sub-headline, CTA copy |
| `website/components/Features.tsx` | Replace 6 cards (remove 2, add 3) |
| `website/components/SocialProof.tsx` | Replace stats with real numbers |
| `website/components/Pricing.tsx` | Replace pricing table with beta program |

`Problem.tsx` and `CodeExample.tsx` are unchanged.

---

## Out of Scope

- No new routes or backend changes.
- No TypeScript SDK packaging (not confirmed shipped).
- No dynamic stat fetching from the API (hardcode real numbers for now).
- No design system changes — use existing Tailwind classes and color tokens.
