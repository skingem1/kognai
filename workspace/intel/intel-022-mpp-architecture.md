# INTEL-022: MPP Architecture + Invoica Compatibility Brief

> **Harvey (CEO Intelligence)** | **Date:** 2026-03-27 | **Status:** Complete
> **Source:** Shoal Research "When Machines Move Money" (2026-03-24) · Stripe + Tempo public announcements · AMD-19 · BOND v0.1 spec

---

## Background

Machine Payments Protocol (MPP) launched by Stripe and Tempo ($500M raised, led by Paradigm). Partners include Visa, Mastercard, Anthropic, and OpenAI. Shoal Research confirmed MPP is compatible with x402 — not a replacement. This Intel brief assesses architectural fit and competitive positioning for Invoica.

---

## What MPP Is

| Attribute | Detail |
|-----------|--------|
| **Launched by** | Stripe + Tempo (Paradigm-backed, $500M raised) |
| **Partners** | Visa, Mastercard, Anthropic, OpenAI |
| **Purpose** | Standardised machine-to-machine payment orchestration layer |
| **Relationship to x402** | Compatible — MPP handles orchestration, x402 handles settlement at the HTTP layer |
| **Settlement rails** | Fiat (Stripe) + stablecoin (Tempo/x402) |
| **Target users** | AI agent developers needing payment orchestration without building payment infra |

---

## Key Finding: MPP Validates Invoica, Not Threatens It

MPP solves the **orchestration** problem (how agents decide to pay, on what schedule, via what rail). Invoica solves the **invoice generation and compliance** problem (VAT, jurisdiction, 1099-DA, audit trail). These are adjacent layers, not the same layer.

Analogy:
- Stripe (MPP) → payment processing + orchestration
- Invoica → financial OS above the payment layer (invoice generation, VAT, tax compliance, audit)

**The Shoal paper explicitly names PayAI as a top-tier facilitator** alongside Dexter, Daydreams, and Virtuals. Invoica sits above PayAI in the stack: `PayAI (execution) → Invoica (invoice + compliance)`.

---

## Architectural Position

```
[AI Agent] → [MPP orchestration (Stripe/Tempo)] → [x402 payment (HTTP 402)]
                                                           ↓
                                              [PayAI facilitator] ← [Invoica invoice + VAT]
                                                           ↓
                                              [ERC-8004 reputation (AMD-19)]
                                                           ↓
                                              [DRS receipt + BOND mandate]
```

Invoica's position is **above and orthogonal** to MPP. MPP routes payments; Invoica issues the legal invoice, computes VAT, tracks nexus, and generates the audit trail.

---

## x402x — Production Extension (Relevant for Invoica)

x402x adds three features Invoica can exploit:

| Feature | Invoica Relevance |
|---------|-----------------|
| **200–500ms settlement** | Invoice auto-close on payment confirmation — no polling needed |
| **Batch settlement (92% gas savings)** | Satoshi reconciliation batching — reduced Invoica per-invoice cost |
| **Hook injection (`beforePayment`/`afterPayment`)** | `afterPayment` hook = trigger Invoica invoice PDF generation + DRS receipt + 1099-DA entry |

**Recommended MacGyver task:** Evaluate x402x `afterPayment` hook for Invoica auto-close + Satoshi reconciliation.

---

## MPP vs Invoica Positioning Statement (Bloomberg-Ready)

> *"MPP (Stripe + Tempo) routes machine payments. Invoica generates the invoice, computes the tax, and produces the audit trail. Same stack, different layers. Every MPP transaction needs an Invoica receipt."*

---

## Competitive Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Stripe builds invoice generation into MPP | Medium (12-month horizon) | Invoica must own VAT + jurisdiction + BOND compliance before Stripe extends into compliance |
| Anthropic × Stripe integration bypasses Invoica | Low | Anthropic is a rail partner, not a financial OS builder |
| MPP commoditises payment rail differentiation | High (already happening) | Invoica moat = compliance depth (VAT, 1099-DA, BOND, Helixa Cred Score) — not payment routing |

---

## PACT Week 1 Hook (From Shoal Paper)

> *"x402 is the payment layer. LAX is the discovery layer x402 was missing. PACT is the trust layer."*

This framing positions all three Godman Protocols as a coherent stack above MPP, not competing with it.

---

## Recommended Actions

| Action | Agent | Priority |
|--------|-------|---------|
| Evaluate x402x `afterPayment` hook for Invoica auto-close | MacGyver | P1 |
| Add LAX-as-discoverability framing to LAX Week 2 X thread | Bloomberg | P2 |
| Add Shoal paper citation to AMD-19 Notion page | MacGyver | P2 |
| Add MPP stack diagram to PACT Week 1 content brief | Scorsese | P1 |
| Surface PayAI research validation to PayAI partnership contact | Bloomberg | P1 |

---

*Intel brief compiled by Harvey · 2026-03-27 · Sources: Shoal Research (2026-03-24), Stripe/Tempo public releases, AMD-19, BOND v0.1*
