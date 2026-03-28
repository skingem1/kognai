# Godman Strategic Decisions — 2026-03-28

> **Prepared by:** Harvey (INTEL-025/026) + MacGyver (eval-015/016)
> **Requires decisions on:** TICKET-019 (MetaLeX), TICKET-020 (Trust Zones), TICKET-022 (Sentinel)
> **All intel complete. All evals complete. Awaiting Godman.**

---

## DECISION 1 — TICKET-019: MetaLeX BORG + Invoica cyberCORP
*Source: INTEL-025 (Harvey, 2026-03-28)*

### Background
MetaLeX builds legal+smart-contract infrastructure for "BORGs" — state-chartered entities whose charter embeds autonomous software. borgCORE wraps a Gnosis Safe with a policy enforcement layer. cyberCORP is the bizBORG variant for startups (Delaware C-Corp / LLC, onchain cap table, cyberSAFE fundraising). Kognai's Founding Charter, Five Laws, and on-chain EAS attestations (AMD-19) already match the BORG definition structurally — **Kognai is a proto-BORG today**.

borgCORE uses **Gnosis Safe Guard architecture** — NOT ERC-7579 (despite INTEL-025 Section 5.1 confirming no native ERC-7579 integration). borgCORE is independently audited (MixBytes + Zellic). Real deployments: Neutron, Lido Alliance, Everclear, zkSync Security Council.

### Decision 1a — Should Genesis Ceremony (Month 10) register Kognai as a MetaLeX bizBORG?

| Option | Recommendation |
|--------|----------------|
| **YES** — bizBORG registration at Genesis | ✅ **Recommended** |
| NO — constitutional document only | ❌ Not recommended |

**Harvey verdict:** YES. Kognai is already architecturally a BORG. The Genesis Ceremony is the correct moment to close the gap (legal entity = missing piece). The `addLegalAgreement()` borgCORE function anchors the Founding Charter + Five Laws on-chain alongside the existing EAS attestation (AMD-19 dual-redundancy). **NOT a pre-April-7 blocker — Month 8-9 outreach to Gabriel Shapiro.**

---

### Decision 1b — Should Invoica get a MetaLeX cyberCORP before PACT Week 1?

| Option | Recommendation |
|--------|----------------|
| YES — cyberCORP before April 8 PACT launch | ❌ Not recommended |
| **NO** — evaluate Q2 2026 when raising | ✅ **Recommended** |

**Harvey verdict:** NO. cyberCORP beta is closed-source and invite-only — access timeline uncertain. PACT Week 1 does not require a formal legal entity. The cyberCORP value-add (cyberSAFE fundraising, tokenized cap table) is only relevant when Invoica raises a formal seed round. **Queue: register for MetaLeX beta waitlist now; revisit Q2 2026.**

---

### Decision 1c — Should BOND v0.2 integrate MetaLeX cyberDeals for legal enforceability?

| Option | Recommendation |
|--------|----------------|
| **YES** — specific instruments (LeXscroW + Ricardian Tripler) | ✅ **Recommended** |
| Full cyberDeals integration | ❌ Overkill for BOND v0.2 scope |
| No MetaLeX integration | ❌ Leaves legal enforceability gap |

**Harvey verdict:** YES — targeted. Three instruments apply to BOND v0.2:
1. **LeXscroW** as the enforcement escrow layer for mandate defaults
2. **Ricardian Tripler** to make BOND mandates legally enforceable (not just technically binding)
3. **MetaVesT** as optional streaming payment module for recurring mandates

**Sprint timing: BOND v0.2 spec work (Sprint 535+ range). NOT a pre-PACT blocker.**

---

## DECISION 2 — TICKET-020: Trust Zones as PACT Chamber 4 Third Output Type
*Source: INTEL-026 (Harvey, 2026-03-28) + eval-015 (MacGyver, 2026-03-28)*

### Background
Trust Zones is a modular ERC-7579 agreement substrate built at The Synthesis hackathon (March 13–22, 2026) by spengrah (Spencer Graham / Hats Protocol) with Claude Opus 4.6 as co-author. 539 tests (394 contract, 30 E2E). Live on Base mainnet. MIT license. Exposes an x402-gated MCP server with 8 tools.

**Critical distinction from current PACT:** PACT violations produce post-hoc ACP score reduction. Trust Zones constraint violations are **prevented at the transaction level** — the transaction simply reverts. This is the gap PACT has for capability delegation scenarios.

**eval-015 verdict: `VIABLE_DEFERRED`**
- TZSchemaDocument schema confirmed compatible with PACT Chamber 4 output format
- 8 MCP tools confirmed (not 6 — `decode_event` and `explain` are additional)
- `compile` tool: $0.01 USDC per call on Base Sepolia (`eip155:84532`)
- Full Kognai-Invoica capability delegation schema written and verified in eval-015
- **Blocker: hackathon prototype, no audit. Must not go to production without audit.**

### Proposed Three-Way PACT Chamber 4 Routing

| Trigger | Route |
|---------|-------|
| One-off API call, single deliverable | x402 spot payment |
| Recurring billing mandate | BOND v0.2 mandate |
| **Capability delegation to external agent** | **Trust Zones agreement** |

### Decision 2 — Does PACT Chamber 4 add Trust Zones as a third output type?

| Option | Recommendation |
|--------|----------------|
| YES — build now | ❌ Prototype, no audit |
| **YES — deferred** (design in now, build post-audit) | ✅ **Recommended** |
| NO — ACP score reduction only | ❌ Leaves hard enforcement gap |

**Harvey/MacGyver verdict: VIABLE_DEFERRED.** Add the `capability_delegation` routing case to the PACT Chamber 4 spec NOW as a placeholder annotated "deferred pending audit." Do not build the live integration until:
1. Trust Zones ships a Sherlock or Code4rena audit
2. 90 days on mainnet without incident
3. npm packages published (`@trust-zones/sdk`, `@trust-zones/compiler`)

**Sprint 535-536 insertion point:** MacGyver adds the placeholder routing case when building PACT Chamber 4 (already planned). If Trust Zones matures by Sprint 535, the placeholder becomes the live integration.

**Monitoring queue (Harvey):**
- Watch `spengrah/synthesis-hackathon` for: audit announcement, npm publish, new contributors
- If no commit activity by April 30 → classify as abandoned → deprioritise
- If audit announced → elevate to P1 → build immediately

---

## DECISION 3 — TICKET-022: Sentinel per-agent x402 spend governance
*Source: INTEL-027 (Satoshi, 2026-03-28) + eval-016 (MacGyver, 2026-03-28)*

### Background
`@x402sentinel/x402` v0.2.0 is published on npm (MIT, 2026-02-24). It wraps the `fetch` function with per-agent spend caps, spike detection, and HMAC-signed JSONL audit trails. One `npm install` away.

**eval-016 correction of INTEL-027:** The core API is `wrapWithSentinel(fetch, config)` — NOT a `BudgetManager` class constructor. This changes the integration hook point.

**eval-016 verdict: `READY`**
- `sentinel-config.ts` written to Invoica (`src/services/sentinel-config.ts`, 81 lines, FP-007 compliant)
- Per-agent policies defined (see table below)
- Hook point confirmed: `clawrouter-client.ts` (wraps fetch at lines 675/1438/1616/1931)
- Spike threshold converts: `spikeAlertPercent / 10 = spikeThreshold multiplier`

### Per-Agent Budget Policies (Satoshi recommendations from INTEL-027)

| Agent | Daily Cap | Spike Alert | Spike Window |
|-------|-----------|-------------|--------------|
| MacGyver | $50 USDC | 20% of cap in 30 min | 30 min |
| Bloomberg | $100 USDC | 20% of cap in 30 min | 30 min |
| Sherlock | $25 USDC | 30% of cap in 60 min | 60 min |
| Satoshi | $50 USDC | 20% of cap in 30 min | 30 min |
| **Team ceiling** | **$225 USDC/day** | — | — |

### Decision 3 — Approve Sentinel policies + wire into clawrouter-client.ts?

| Option | Recommendation |
|--------|----------------|
| **Approve policies + wire** | ✅ **Recommended — auto-assignable** |
| Adjust individual caps | Godman's call |
| Defer | ❌ No benefit to deferring |

**MacGyver/Satoshi verdict: PROCEED.** `sentinel-config.ts` is committed to Invoica. Next step: MacGyver runs `npm install @x402sentinel/x402` in Invoica and wires `wrapWithSentinel()` into `clawrouter-client.ts` using the `buildSentinelConfig()` factory. No other files need modification.

If Godman approves the budget caps above, MacGyver can complete the wiring immediately without further input.

---

## Summary — All Three Decisions

| Ticket | Decision Required | Harvey/MacGyver Recommendation | Blocking? |
|--------|------------------|---------------------------------|-----------|
| TICKET-019a | Genesis BORG registration | YES — Month 8-9 outreach | ❌ No |
| TICKET-019b | Invoica cyberCORP pre-PACT | NO — Q2 2026 | ❌ No |
| TICKET-019c | BOND v0.2 cyberDeals instruments | YES — targeted (LeXscroW + Ricardian) | ❌ No |
| TICKET-020 | Trust Zones PACT Chamber 4 | VIABLE_DEFERRED — design now, audit first | ❌ No |
| TICKET-022 | Sentinel per-agent caps | APPROVE + wire | ❌ No |

**None of these block the April 7 gate or PACT Week 1.** All are architecture decisions for Sprint 535+ range, with the exception of Sentinel which can be wired immediately post-approval.

---

*Compiled by Harvey + MacGyver · 2026-03-28 · Sources: INTEL-025, INTEL-026, eval-015, eval-016*
