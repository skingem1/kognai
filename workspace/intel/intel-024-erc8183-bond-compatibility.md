# INTEL-024: ERC-8183 Full Spec + BOND Compatibility Assessment

> **Harvey (CEO Intelligence)** | **Date:** 2026-03-27 | **Status:** Complete
> **Source:** ERC-8183 (Virtuals Protocol + Ethereum Foundation dAI team) · BOND Protocol v0.1 · AMD-19 · TICKET-016 (Godman decision: Option A + BOND intrinsic features, 2026-03-26)

---

## Background

ERC-8183 is an open agent-to-agent spot job escrow standard co-developed by Virtuals Protocol and the Ethereum Foundation dAI team. It is live with 18,000+ agents and $3M+/month in commerce. Godman resolved TICKET-016 on 2026-03-26: **Option A** — adopt ERC-8183 as the spot job layer, preserve BOND for recurring mandates. The two standards are complementary, not competing.

---

## What ERC-8183 Is

| Attribute | Detail |
|-----------|--------|
| **Authors** | Virtuals Protocol + Ethereum Foundation dAI team |
| **Purpose** | One-off spot job escrow between AI agents |
| **Mechanics** | Client locks payment → provider delivers → evaluator releases |
| **Scale** | 18,000+ agents live, $3M+/month in commerce |
| **Status** | Production (EIP, not yet final ERC, but widely adopted) |
| **License** | Open standard |

---

## ERC-8183 Mechanics

```
[Client Agent]  →  lock(amount, taskId, evaluatorAddress)
                         ↓
                   [Escrow Contract]  →  [Provider Agent]
                         ↓                     ↓
                   [Evaluator] ←─── deliverAndClaim(taskId, deliverable)
                         ↓
                   release() or refund()
```

### Evaluator Types (Three-Tier)
| Tier | Evaluator | Kognai Mapping | Use Case |
|------|-----------|----------------|----------|
| AI/Subjective | Any LLM judge | **perm-judge** | Creative work, strategy, planning |
| ZK/Deterministic | ZK proof circuit | **Sherlock** | Code correctness, data verification |
| Governance/Override | DAO or multi-sig | **Godman gate (P0)** | High-value, irreversible, constitutional |

---

## BOND vs ERC-8183: Complementary Coverage

| Dimension | BOND Protocol v0.1 | ERC-8183 |
|-----------|--------------------|----------|
| **Use case** | Recurring mandates (subscription, SLA, scheduled) | One-off spot jobs (single task, deliverable) |
| **Settlement** | EAS attestation + PayAI scheduled | Escrow contract release |
| **Trust mechanism** | PACT session attestation + Helixa Cred Score | Evaluator (AI/ZK/DAO) |
| **Duration** | Ongoing relationship | Single transaction |
| **Typical value** | Medium ($50–$5K/month) | Small ($1–$500 per task) |
| **Kognai role** | Invoica issues recurring invoice + BOND mandate | Invoica issues spot receipt + DRS entry |

**Together they cover the full agent commerce spectrum.** BOND = long-term relationships. ERC-8183 = spot marketplace.

---

## AMD-19 Connection

The Shoal Research paper describes the canonical trust loop:
> `ERC-8004 registry → x402 payment → reputation feedback`

ERC-8183 completes this loop for spot jobs:
> `ERC-8004 identity → ERC-8183 spot job (escrow) → perm-judge evaluation → DRS reputation receipt → ERC-8004 score update`

**ERC-8004 (AMD-19) = agent passport. ERC-8183 = commerce layer. Together: portable onchain reputation built from completed work.**

---

## Kognai Implementation Architecture (Option A)

```
[Kognai Agent] (ERC-8004 identity)
       ↓
[PACT session] → Chamber 2 (Helixa Cred Score ≥ 50 → PROVISIONAL)
       ↓
[ERC-8183 escrow] — lock(amount, taskId, evaluatorAddress=perm-judge)
       ↓
[Work delivery]
       ↓
[perm-judge evaluation] (T1 qwen3:4b) → release() or dispute
       ↓
[DRS receipt] → [Invoica invoice] → [ERC-8004 reputation update]
```

### Cross-Protocol Bridge (Clawcard)
For counterparties not on x402: temporary Clawcard per-job virtual card. Clawcard converts fiat to USDC; escrow contract receives USDC.

```
[Non-x402 client] → [Clawcard temp card] → USDC → [ERC-8183 escrow]
```

---

## BOND v0.2 Integration Points

ERC-8183 spot jobs feed the BOND mandate network in two ways:

1. **Reputation seeding:** Completed spot jobs (ERC-8183 DRS receipts) establish agent credibility before a BOND recurring mandate is initiated
2. **Mandate genesis:** A series of successful spot jobs (ERC-8183) can trigger an auto-proposed BOND mandate for recurring work

**BOND v0.2 update needed:** Add `spot_job_history: ERC8183Receipt[]` to `AgentProfile` — enables mandate proposals with verified track record.

---

## AMD-19 Addendum Required

Current AMD-19 covers:
- ERC-8004 on-chain identity
- MetaMask + Google + Coinbase + EF attestation
- PACT Chamber 4 Soul Handshake

**Missing:** Reference to ERC-8183 as the commerce layer that AMD-19 supports. MacGyver should add a one-paragraph addendum to the AMD-19 Notion page: *"ERC-8183 is the spot job escrow standard that creates on-chain commerce events that feed back into ERC-8004 reputation scoring."*

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| ERC-8183 becomes final ERC, requires migration | Medium | Build abstraction layer (`agent-commerce.ts`) — swappable evaluator interface |
| Virtuals Protocol becomes direct Kognai competitor | Medium | ERC-8183 is open standard; Kognai moat = perm-judge + Sherlock + DRS, not the escrow contract |
| perm-judge cost (T1 qwen3:4b) at high spot-job volume | Low (Phase 1) | Batch evaluation; ZK evaluator for deterministic tasks reduces LLM calls |
| Clawcard bridge introduces counterparty risk | Low | Clawcard credit limit + instant revocation from AMD-13 Credential Vault |

---

## Recommended Actions

| Action | Agent | Priority |
|--------|-------|---------|
| BOND v0.2 spec update: `spot_job_history`, Five Laws gate, ACP attestation, Clawcard bridge, DRS wire | MacGyver | **P1** |
| ERC-8183 Kognai implementation spec: perm-judge evaluator, DRS receipt, Clawcard bridge, dispute flow | MacGyver | **P1** |
| AMD-19 addendum: note ERC-8183 as the commerce layer | MacGyver | P2 |
| `agent-commerce.ts` abstraction layer (future-proof evaluator interface) | MacGyver | P2 |

---

## Identity Hierarchy (Godman Decision, 2026-03-26)

```
ERC-8004 (AMD-19)          ← strongest: full onchain passport
    ↓
Clawcard                   ← x402-compatible, instant revocation
    ↓
PACT session               ← session-scoped, Helixa Cred Score
    ↓
Godman P0 gate             ← last resort: human multi-sig override
```

---

*Intel brief compiled by Harvey · 2026-03-27 · Sources: ERC-8183 spec (Virtuals Protocol + EF dAI team), BOND v0.1, AMD-19, TICKET-016 Godman decision (2026-03-26), Shoal Research (2026-03-24)*
