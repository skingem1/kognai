# Taxation and Indirect Tax Framework for AI-to-AI Transactions
## Baseline Knowledge Document — Invoica Tax Watchdog Reference
## Source: "Taxation and Indirect Tax Framework for AI.docx" — Provided by Invoica Founder
## Jurisdictions: EU5 (France, Germany, Italy, Spain, UK) + USA, Canada, Japan

## Invoica Company Classification (for tax & regulatory purposes)
- **Industry**: Software as a Service (SaaS)
- **Category**: Business Software
- **Sub-category**: Accounting & Invoicing Software
- **NAICS Code**: 511210 — Software Publishers
- **Relevant tax treatment**: Digital/electronically supplied services (ESS) in most jurisdictions

---

## Executive Summary

Transactions between AI agents (paid API calls, inference services, data access, autonomous digital services) are generally treated as **electronically supplied services (ESS)** or **digital services** for indirect tax purposes.

AI agents themselves have **no legal personality**. Tax liability rests with the legal entity behind the agent.

---

## 1. European Union (EU5)

**Legal Foundation**: VAT Directive 2006/112/EC + EU implementing regulations

### Place of Supply Rules
- **B2B**: VAT due in customer's country. Reverse charge applies. Supplier issues invoice without VAT. Customer self-accounts. (Art. 44-45 VAT Directive)
- **B2C**: VAT due where consumer resides. Supplier must collect VAT at local rate. Even micropayments (€0.01 API call) apply.

### One Stop Shop (OSS)
- Single registration for cross-border B2C digital services
- Quarterly declaration covering all EU countries
- Union OSS (EU businesses) / Non-Union OSS (non-EU businesses)

### Country VAT Rates
| Country | Authority | Standard VAT Rate | Notes |
|---|---|---|---|
| France | DGFiP | 20% | VIES validation required |
| Germany | BZSt | 19% | Strict digital reporting |
| Italy | Agenzia delle Entrate | 22% | SDI electronic invoicing required |
| Spain | Agencia Tributaria | 21% | Localization evidence for B2C |
| Netherlands | Belastingdienst | 21% | |

---

## 2. United Kingdom (Post-Brexit)

- Legal basis: VAT Act 1994, HMRC VAT Notice 741A
- Standard VAT: **20%**
- B2B: Reverse charge generally applies
- B2C: VAT due where customer resides; non-UK suppliers may need UK registration
- EU OSS **no longer** covers UK

---

## 3. United States

- **No federal VAT**. State-level only.
- Key case: *South Dakota v. Wayfair* — economic nexus without physical presence
- SaaS/digital services: taxable in some states, exempt in others
- No centralized filing (no OSS equivalent)
- IRS: digital assets treated as **property** — each crypto payment may trigger gain/loss

**Risk Level: VERY HIGH** — fragmented, state-by-state, no harmonization

---

## 4. Canada

- GST (5%) + HST (combined federal/provincial)
- Since July 2021: Non-resident digital service providers must register simplified regime
- B2B generally exempt if customer provides valid GST number

**Risk Level: MEDIUM**

---

## 5. Japan

- Japanese Consumption Tax (JCT) — Standard rate: **10%**
- B2C cross-border: Foreign supplier may need to register and charge JCT
- B2B: Reverse charge mechanism may apply

**Risk Level: MEDIUM**

---

## 6. Compliance Risks for AI-to-AI Platforms

1. Failure to identify B2B vs B2C status
2. Inadequate geolocation evidence
3. Incorrect VAT rate application
4. Failure to register under OSS / GST regime
5. Crypto payment tax misreporting
6. Missing invoice audit trail

---

## 7. Technical Compliance Architecture Blueprint

### 4 Transaction Evaluation Dimensions
Every transaction must evaluate:
1. Who is the supplier?
2. Who is the customer?
3. Where is the customer located?
4. Is it B2B or B2C?

### System Architecture Layers

**Layer 1 — Identity & Tax Status Layer**
- Each agent linked to: legal entity, country, VAT/GST ID, B2B/B2C flag, nexus status
- EU: VIES validation with timestamp storage

**Layer 2 — Geolocation & Evidence Layer**
- EU B2C: minimum 2 non-conflicting evidence pieces (billing address, IP, bank location)
- Retention: 10 years (EU standard for digital VAT services)

**Layer 3 — Tax Determination Engine**
```
IF customer = business AND valid VAT ID (EU)  → Reverse charge
ELSE IF customer = consumer (EU)              → VAT at customer country rate
ELSE IF USA                                   → Check state nexus
ELSE IF Canada                                → Apply GST/HST by province
ELSE IF Japan                                 → Apply JCT for B2C cross-border
```

**Layer 4 — Invoice & Reporting Module**
- Reverse charge invoices (with correct legal wording)
- VAT-inclusive B2C invoices
- OSS-compatible reporting output
- US state-level reporting summaries

**Layer 5 — Crypto Handling Module**
- Track fiat equivalent at time of transaction
- FX gains/losses
- VAT calculation based on fiat equivalent (not crypto amount)

---

## 8. Smart Contract Architecture

### Agent Registration (On-Chain)
```
AgentProfile {
  agentAddress
  legalEntityHash
  countryCode
  taxIDHash          // not cleartext
  businessFlag
  complianceStatus
  lastVerificationTimestamp
}
```

### Tax Decision Oracle
Off-chain engine computes jurisdiction, VAT rate, reverse charge flag → signs TaxDecision → smart contract verifies oracle signature.

### Tax Escrow Wallets (Per Jurisdiction)
- EU VAT escrow
- UK VAT escrow
- Canada GST escrow
- Japan JCT escrow
- US state escrow buckets

### Invoice NFT / Hash Anchoring
- Each transaction mints non-transferable Invoice hash NFT
- Immutable audit trail on-chain

---

## 9. Jurisdiction Risk Matrix

| Jurisdiction | Risk Level | Key Challenge |
|---|---|---|
| EU | HIGH (complex, predictable) | 27 VAT rates, OSS required, 10yr retention |
| UK | MEDIUM | Separate from EU OSS post-Brexit |
| USA | VERY HIGH (fragmented) | 50 state regimes, no harmonization |
| Canada | MEDIUM | Non-resident simplified registration |
| Japan | MEDIUM | JCT registration threshold |

---

## 10. Strategic Design Considerations for Invoica

- **Embed VAT logic engine** (B2B/B2C detection at SDK level)
- **Collect and validate VAT IDs** via VIES
- **Store geolocation proof** (IP, billing address)
- **Generate compliant invoices** per jurisdiction
- **Track crypto tax events** separately
- **Tax compliance = competitive moat** for institutional adoption
