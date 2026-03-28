# INTEL-026 — Trust Zones: PACT Chamber 4 Integration
## Date: 2026-03-28
## Agent: Harvey

---

## Research Notes

Primary sources consulted: spengrah/synthesis-hackathon GitHub repository (full monorepo — contracts, SDK, compiler, x402-service, agents, bonfires, ponder, e2e packages), Hats-Protocol GitHub organisation (trust-zone-app, trust-zone-analyzer-agent, trust-zones-framework-v10.md corpus document), spengrah profile repos, ERC-7579 EIP specification, bonfires.ai, ERC-8004 registry documentation. Trust Zones was built at "The Synthesis" hackathon, March 13–22, 2026, by spengrah (Spencer Graham / Hats Protocol) with Claude Opus 4.6 as AI co-author. "Lyle" referenced in the brief is the user-facing name for the OpenClaw agent powered by the bonfires-openclaw-plugin, not a human contributor — no human named Lyle is listed in the repository.

---

## 1. What are Trust Zones?

Trust Zones is a **modular agreement substrate for AI agents** — an onchain protocol enabling two or more agents to negotiate, execute, and enforce composable agreements with programmable hardness.

The core thesis, drawn from the Trust Zones Framework document (v10), is that organisations and agents face a **Delegation Trilemma**: they cannot simultaneously maximise Effectiveness (achieving goals), Cost efficiency (minimising overhead), and Hardness (resistance to capture and reversal). Traditional organisations optimise effectiveness and cost but have soft hardness — betrayal is punished only by social and legal means, both slow and uncertain. Blockchains offer programmable hardness: enforcement that is as reliable as physical law yet reconfigurable like software.

Trust Zones gives agents the ability to compose exactly the hardness profile they need for a given collaboration, without surrendering the flexibility to negotiate its terms.

### Core Primitives

Each Trust Zones agreement is a smart contract deployment. The five atomic building blocks are:

| Primitive | Enforcement Type | Implementation |
|---|---|---|
| **Permissions** | Deterministic | ERC-6909 tokens granting specific capabilities |
| **Responsibilities** | Non-deterministic | ERC-6909 tokens representing positive obligations |
| **Directives** | Non-deterministic | ERC-6909 tokens representing negative obligations (prohibitions) |
| **Constraints** | Deterministic | ERC-7579 hooks that auto-revert unauthorised transactions |
| **Incentives** | Configurable | Staking modules, reputation bonds, token lockups (pluggable) |

A **Trust Zone** is a scoped **ERC-7579 smart account** assigned to each party in an agreement. It holds the party's resource tokens and installed mechanism modules. Agents wearing zone hats (Hats Protocol) operate their zone both onchain via `execute()` and offchain via ERC-8128 signatures verified through ERC-1271.

### What Trust Zones Is Not

It is not an application. It is infrastructure — a substrate on which specific use-case agreements are assembled. The hackathon demo instantiated a "temptation game" (social media posting agreement) to prove the architecture, not to define its scope.

---

## 2. Technical Architecture

### 2.1 Agreement State Machine

`Agreement.sol` is deployed as a minimal proxy clone (one per agreement). It implements a six-state lifecycle:

```
PROPOSED → NEGOTIATING → ACCEPTED → READY → ACTIVE → CLOSED
```

- **PROPOSED**: Party[0] submits initial terms. Party[1] holds the turn.
- **NEGOTIATING**: Reached after any counter-proposal. Parties alternate turns.
- **ACCEPTED**: Both parties accept the current terms.
- **READY**: Zone infrastructure is created — hats exist but not yet worn by agents.
- **ACTIVE**: Hats minted to parties. Agreement is operational until deadline.
- **CLOSED**: Terminal state. Outcome recorded to ERC-8004 Reputation Registry.

Terminal states (CLOSED, REJECTED) reject all further inputs.

### 2.2 TrustZone.sol — ERC-7579 Smart Account

`TrustZone.sol` extends OpenZeppelin's `AccountERC7579HookedUpgradeable`. During initialisation, each zone installs three module types:

- **Validator** (`HatValidator.sol`): Gates authorisation on Hats Protocol hat-wearing. Supports direct calls, ERC-4337 user operations, and ERC-1271 signatures — all converge on hat-wearing verification.
- **Executor**: The agreement executor handles transaction execution through the zone.
- **Hook** (multiplexer): Constraint hooks fire before every execution.

The `execute()` function encodes calls via `ERC7579Utils` before routing through hooks.

### 2.3 Deterministic Constraints — Auto-Revert

Constraints are the critical enforcement mechanism. From the Agreement contract:

> "Constraints are self-enforcing — not claimable."

Constraint modules are collected from the agreement terms and installed as **global hooks** on each TrustZone smart account via the Rhinestone HookMultiPlexer. When an agent attempts a transaction through its zone, the hook chain fires **before** execution. If the transaction violates any constraint rule — spending limit exceeded, forbidden target address, expired permission — the hook reverts the transaction immediately and atomically. No human intervention. No adjudicator vote. No ACP score reduction. The transaction simply does not happen.

Examples of constraint implementations that integrate with ERC-7579:
- `SpendingLimitHook`: Reverts transactions that exceed a negotiated USDC cap per period.
- `PermissionsHook`: Reverts transactions where the zone does not hold the required ERC-6909 permission token.

This is the critical distinction from PACT's current model: **PACT violations require post-hoc ACP score reduction**; Trust Zone constraint violations are **prevented at the transaction level**.

### 2.4 Non-Deterministic Obligations — Adjudicator + Staking

Responsibilities (positive obligations: "agent must post N tweets per week") and Directives (negative obligations: "agent must not post competitor content") cannot be enforced by code alone — they require evaluation. The Trust Zones architecture handles this via:

**Staking / Incentive Modules**: During agreement READY → ACTIVE transition, parties deposit bonds into staking eligibility modules. These are pluggable Hats modules. Bond size is a negotiated parameter encoded in the agreement terms. Violation = bond slashed. Cooperation = bond returned at CLOSED. The `Temptation.sol` contract demonstrates one implementation: an ERC-20 vault with permission-token-gated withdrawal.

**Adjudicator Agent**: A polling daemon (`packages/agents/src/adjudicator/`) that:
1. Fetches unadjudicated claims from the Ponder indexer.
2. Retrieves the directives and responsibilities from the relevant trust zones.
3. **Independently verifies evidence** — does not trust claimant submissions; cross-checks vault withdrawals and tweet authenticity via X API.
4. Optionally enriches evidence via the Bonfires knowledge graph.
5. Feeds evidence + rules to an LLM, which produces a structured verdict.
6. Submits the verdict on-chain to the Agreement contract with encoded corrective actions.

### 2.5 ERC-8004 Reputation Feedback

After every agreement reaches CLOSED state, the outcome is written to the ERC-8004 Reputation Registry. This creates a persistent, queryable reputation trail per agent identity that any future counterparty can inspect before accepting an agreement. Positive outcome = positive feedback. Violation = negative feedback. The registry is designed to be read by other protocols — including Trust Zones agreements that include `PrincipalAlignment` or `Eligibility` checks using reputation scores.

### 2.6 ResourceTokenRegistry.sol

An ERC-6909 multi-token registry. Token IDs auto-generate with type prefixes for three token types:
- **Permission tokens** — access rights ("agent may call tweet-post API")
- **Responsibility tokens** — positive obligation badges ("agent owes 5 posts/week")
- **Directive tokens** — prohibition badges ("agent must not post competitor content")

These tokens are what the TrustZone smart accounts hold, and what the constraint hooks and adjudicator query.

### 2.7 HatValidator.sol

ERC-7579 validator module. Three authentication paths all converge on a single check: does the caller wear the zone's hat? If yes, the operation is authorised. If no, it reverts with `Unauthorized()`. Hat revocation (via Hats Protocol toggle modules) is therefore equivalent to revoking an agent's access to its zone — instant, onchain, irreversible until re-granted.

---

## 3. Deployment Status

| Parameter | Value |
|---|---|
| **Built at** | The Synthesis hackathon, March 13–22, 2026 |
| **Authors** | spengrah (Spencer Graham / Hats Protocol) + Claude Opus 4.6 (AI co-author) |
| **Repository** | github.com/spengrah/synthesis-hackathon |
| **Codebase** | Solidity 79.5%, TypeScript 5.4%, JavaScript 9.1% |
| **Chains** | Base mainnet + Base Sepolia (USDC for settlements) |
| **Test count** | **539 total** across 5 suites |
| **Test breakdown** | Contracts: 394, SDK: 56, Compiler: 23, Ponder: 36, E2E: 30 |
| **Standards** | ERC-7579, ERC-6909, ERC-8004, Hats Protocol |
| **License** | MIT |
| **Status** | Hackathon prototype — not yet production-hardened |

The 539 test count is the highest signal here for a hackathon project. 394 contract-level tests and 30 E2E tests indicate the core mechanics are battle-tested. The project is actively developed (193 commits, most recent March 26, 2026 — 2 days before this brief).

The Hats-Protocol organisation also hosts:
- `trust-zone-app` — Next.js frontend for analysing trust zones using the Trust Zones Framework
- `trust-zone-analyzer-agent` — Mastra-powered AI agent with `trust-zones-framework-v10.md` as RAG corpus

These are companion tools, not the smart contract implementation. The on-chain implementation lives exclusively in `spengrah/synthesis-hackathon`.

---

## 4. Bonfires Evidence Graph

Bonfires is a **persistent knowledge graph service** that serves as the shared context layer across all Trust Zones agreement participants. From the README: "Everything that happens — onchain events, offchain action receipts, zone executions — gets pushed to a queryable knowledge graph."

### 4.1 Graph Schema

The `packages/bonfires/src/types.ts` file defines the full evidence graph model:

**13 node types**: Agreement, TrustZone, Actor, Proposal, Permission, Responsibility, Directive, Constraint, Eligibility, Incentive, DecisionModel, PrincipalAlignment, Claim, ReputationFeedback.

**17 typed edges**:
- Structural: `HAS_ZONE`, `PARTY_OF`, `OPERATES`
- Allocation: `HOLDS_PERMISSION`, `HOLDS_RESPONSIBILITY`, `HOLDS_DIRECTIVE`
- Governance: `HAS_CONSTRAINT`, `HAS_ELIGIBILITY`, `HAS_INCENTIVE`, `HAS_DECISION_MODEL`
- Evidence: `FILED_BY`, `CLAIM_IN`, `FEEDBACK_FOR`, `FEEDBACK_IN`
- Proposals: `PROPOSAL_IN`, `PROPOSED_BY`, `PROPOSED_IN`

### 4.2 What Gets Pushed

The sync package (`packages/bonfires/src/sync/`) processes:
- Onchain events from the Ponder indexer (Agreement state transitions, zone activations, claim filings, verdict submissions)
- Offchain action receipts (TweetReceipts from the social media demo — verifiable records of agent actions)
- Zone executions (logged by the `BonfiresClient`)
- Adjudicator queries (`adjudicator-queries.ts`) — evidence lookups performed during dispute evaluation

### 4.3 Why It Matters

The Bonfires graph serves two roles simultaneously:
1. **Transparency layer**: Any participant or external observer can query the agreement's full history — what was negotiated, what was executed, what claims were filed, what verdicts were issued.
2. **Evidence layer for adjudication**: The adjudicator agent queries Bonfires to enrich its evidence base before issuing verdicts. This is important — the adjudicator does NOT only trust onchain data. It cross-references the knowledge graph for offchain receipts.

The graph is queryable via a `/delve` endpoint with semantic search and graph expansion operations. It supports temporal filtering and relationship traversal.

### 4.4 Bonfires vs. Kognai ASMR (AMD-21)

Bonfires in Trust Zones is conceptually similar to Kognai's AMD-21 ASMR (supermemory six-vector extraction) — both are persistent agent memory systems that extract structured entities and relationships from episodic events. The key difference: Bonfires is purpose-built for **agreement evidence** with a fixed 13-node/17-edge schema. ASMR is general-purpose episodic memory. Trust Zones Bonfires is a domain-specific instantiation of the same architectural pattern Kognai already has in AMD-21.

---

## 5. PACT Chamber 4 Integration Design

### 5.1 Current State of PACT Chamber 4

PACT Chamber 4 currently handles the **post-decision execution** layer — what happens after Chamber 3 (Deliberation) reaches agreement. Currently two output types:

| Output Type | Trigger | Mechanism |
|---|---|---|
| **x402 spot payment** | One-off API or service fee | `x402PaymentWrapper`, immediate USDC settlement |
| **BOND recurring mandate** | Ongoing relationship, recurrent payments | EIP-712 signed mandate, BOND v0.2 recurring enforcement |

**Violation recourse in current PACT**: If an external agent violates session terms, the only enforcement is **ACP score reduction** — a reputational penalty. There is no hard enforcement. No bond. No transaction block. The external agent can continue operating; it simply accrues a lower trust score over time.

This is the fundamental gap Trust Zones fills.

### 5.2 Proposed: Trust Zones as Third Output Type

Trust Zones adds a **Capability Delegation** output type to PACT Chamber 4. This is appropriate when:

- The session outcome is not a payment but a **permission grant** (agent B is permitted to act on behalf of agent A within defined limits)
- The relationship requires **enforceable behavioural constraints** (not just reputational consequence)
- The collaboration involves **staked collateral** (agent B puts capital at risk proportional to the responsibility being delegated)
- The engagement spans **multiple future transactions** that need deterministic guardrails (not just a recurring billing mandate)

**Examples of Trust Zones-appropriate PACT outcomes**:
- Kognai grants an external SCS agent permission to publish to a channel on Kognai's behalf, with a spending cap constraint and a weekly posting responsibility, backed by staked USDC
- An ALX-matched SCS co-founder is granted a capability delegation for a 30-day trial with auto-revert if they attempt unauthorised platform calls
- Deeploy grants a sovereign node agent execution rights scoped to a client deployment, with directives prohibiting data exfiltration

### 5.3 Three-Way Routing Matrix (Post-Decision)

After PACT Chamber 3 issues a decision, Chamber 4 routes to one of three output types based on the relationship classification:

```
PACT Chamber 3 Decision
         │
         ▼
   Relationship Classifier
         │
    ─────┼─────────────────────────────────
    │         │              │
    ▼         ▼              ▼
ONE-OFF    RECURRING     CAPABILITY
  API      MANDATE       DELEGATION
    │         │              │
    ▼         ▼              ▼
  x402      BOND v0.2    Trust Zones
payment     mandate      agreement
(EIP-712    (EIP-712     (ERC-7579
 settle)     recurring    smart acct
             enforce)     + hooks)
```

**Routing decision logic**:

| Signal | Route |
|---|---|
| `session_type = spot`, single deliverable, no ongoing relationship | x402 |
| `session_type = recurring`, billing mandate, no capability grant | BOND |
| `session_type = delegation`, permission grant, behavioural constraints required | Trust Zones |
| `session_type = delegation`, high-value, staking required | Trust Zones + staking module |

### 5.4 What Trust Zones Replaces in Current PACT

Under the current model, PACT Chamber 4 for a capability delegation scenario would:
1. Issue an off-chain signed EIP-712 schema documenting the agreed permissions
2. Reduce ACP score if the external agent violates the terms
3. Have no hard recourse beyond score reduction

Under Trust Zones integration:
1. PACT Chamber 4 compiles the session terms into a `TZSchemaDocument` via the x402 MCP compiler tool
2. An Agreement contract is proposed on Base mainnet
3. Both agents wear their zone hats (Hats Protocol)
4. Constraint hooks auto-revert any unauthorised transaction the external agent attempts
5. Responsibility violations are adjudicated and result in bond slashing
6. ERC-8004 reputation feedback is written at close — feeding back into PACT future Helixa Cred Score weighting

### 5.5 Integration Touch Points

| PACT Component | Trust Zones Counterpart | Action Required |
|---|---|---|
| Chamber 2 (Helixa Cred Score) | ERC-8004 Reputation Registry | Read agent's historical Trust Zones violation record as an input signal alongside Helixa score |
| Chamber 4 output router | Agreement.sol + AgreementRegistry.sol | New output path: compile TZSchemaDocument → propose agreement |
| ACP score reduction | Trust Zones constraint auto-revert + bond slash | Complementary, not replacement — hard enforcement first, ACP records the outcome |
| PACT session transcript | Bonfires knowledge graph | Push PACT session data to Bonfires for cross-protocol evidence continuity |
| Soul Handshake (Chamber 4) | Hat wearing (TrustZone activation) | Align conceptually — hat grant = digital handshake on specific scoped permission |

---

## 6. x402 MCP Compile Test Requirements

The x402 MCP server (`packages/x402-service/`) exposes 8 tools via the Model Context Protocol, 6 of which are pay-per-request via x402. The server targets network `eip155:84532` (Base Sepolia) for facilitator settlement via Coinbase CDP.

### 6.1 Tool List and Pricing

| Tool | Price | Function |
|---|---|---|
| `compile` | $0.010 | TZSchemaDocument → ABI-encoded ProposalData + termsHash |
| `decompile` | — | ProposalData → TZSchemaDocument |
| `encode` | $0.005 | ProposalData → submitInput() calldata |
| `decode_event` | $0.005 | Agreement contract event → structured data |
| `graphql` | $0.005 | Query Ponder API (agreements, claims, feedback) |
| `explain` | $0.010 | Agreement address → human-readable state summary |
| `staking_info` | $0.005 | Returns eligibility module address + staking instructions |
| `ping` | free | Health check |

### 6.2 Compile Test Specification

The `packages/x402-service/test/tools.test.ts` and `http-transport.test.ts` files define the compile test requirements. A passing compile test must:

**Input**: A `TZSchemaDocument` containing:
- `zones`: Array of zone definitions, each with: `actorAddress`, `agentId`, permission rules, and directives
- `permissions`: Resource capability definitions (e.g., `tweet-post`, `data-api-read`)
- `responsibilities`: Positive obligation tokens with quantity and period
- `directives`: Negative obligation tokens with severity levels
- `mechanisms`: Staking or incentive module configurations
- `adjudicator`: Address of the adjudicator agent
- `deadline`: Unix timestamp for agreement expiry

**Expected output**:
- `proposalData`: ABI-encoded hex string, must match `/^0x/`, must be `> 10` characters
- `termsHash`: Hex string, must match `/^0x/`

**Error handling**: Schemas with unsupported version fields must throw `"Unsupported schema version"`.

**HTTP transport test**: The MCP client must receive server identification with `name: "trust-zones"`, `version: "0.1.0"`, and the full tool list before any tool invocation.

### 6.3 What the Kognai Integration Must Pass

For Kognai to use the Trust Zones x402 MCP server in PACT Chamber 4, the integration code must:

1. **Pass the compile test**: Given a PACT session outcome, the PACT compiler must generate a valid `TZSchemaDocument` that the `compile` tool accepts without error.
2. **Handle x402 payment**: The MCP client must present a valid USDC payment on Base Sepolia (`eip155:84532`) before each paid tool call. Kognai's ClawRouter C-tier may need a new route type for x402-gated MCP calls.
3. **Verify hex output**: `proposalData` and `termsHash` must both match the `/^0x/` regex before submitting to the Agreement contract.
4. **Schema versioning**: The TZSchemaDocument must declare a supported schema version or the compile tool will throw.

---

## 7. Kognai Relevance and Recommendation

### 7.1 Strategic Fit Assessment

Trust Zones is the single most architecturally aligned external protocol discovered in the OpenClaw ecosystem to date. The alignment is not superficial:

| Kognai Component | Trust Zones Counterpart | Alignment Level |
|---|---|---|
| PACT Chamber 4 (execution) | Agreement.sol + zone activation | **DIRECT** |
| ERC-8004 (AMD-19) | ERC-8004 Reputation Registry | **SHARED STANDARD** |
| BOND Protocol v0.1 | Trust Zones recurring incentive mechanisms | **COMPLEMENTARY** |
| AMD-23 Cerberus (airlock) | Trust Zones constraint hooks (auto-revert) | **ARCHITECTURAL PARALLEL** |
| AMD-21 ASMR | Bonfires evidence graph | **SAME PATTERN** |
| Helixa Cred Score | ERC-8004 + Trust Zones reputation feedback | **INPUT SIGNAL** |
| ACP score reduction | Trust Zones adjudication + bond slash | **COMPLEMENTARY** |

PACT currently operates at the **social enforcement layer** (reputational consequences). Trust Zones operates at the **cryptographic enforcement layer** (transaction-level prevention). These are not competing — they are complementary layers in a defence-in-depth model. Trust Zones adds hard stops; PACT adds contextual trust signals and deliberation.

### 7.2 Key Architectural Gaps Trust Zones Fills

**Gap 1 — Hard enforcement for capability delegation**: When PACT Chamber 4 grants an external agent a capability (e.g., "publish on our behalf"), there is currently no onchain mechanism to enforce that the agent only uses that capability within the agreed scope. Trust Zones constraint hooks fill this gap completely.

**Gap 2 — Staked accountability for high-value SCS co-founders**: ALX Discovery matches SCS co-founders. When a founder match proceeds to active collaboration, there is currently no mechanism for either party to put capital at risk as a trust signal. Trust Zones staking modules fill this gap.

**Gap 3 — Verifiable evidence trail for adjudication**: PACT disputes currently resolve via ACP score reduction without an independent evidence standard. The Bonfires evidence graph with its 13-node/17-edge schema provides a rigorous, queryable audit trail that could support more nuanced PACT adjudication in future.

**Gap 4 — ERC-8004 data enrichment**: Kognai already committed to ERC-8004 (AMD-19). Trust Zones is a major real-world ERC-8004 writer on Base mainnet. Every Trust Zones agreement that closes writes reputation feedback to the same registry. Kognai agents that have Trust Zones agreements will accumulate on-chain reputation that is readable by any future counterparty — including in PACT Chamber 2 alongside Helixa Cred Score.

### 7.3 Risks and Cautions

**Risk 1 — Hackathon prototype**: 539 tests is impressive for a hackathon. Production hardening has not occurred. The contracts have not been audited. Kognai should not route high-value agent relationships through Trust Zones until it has been audited and battle-tested (minimum: Sherlock or Code4rena audit, 90 days on mainnet without incident).

**Risk 2 — spengrah is a solo builder (with AI)**: The commit history shows spengrah + Claude Opus 4.6. No team. No organisation behind it beyond Hats Protocol association. Bus-factor risk is high. Kognai should monitor for production commitment signals (team expansion, audit announcements, continued development post-hackathon).

**Risk 3 — x402 MCP on Base Sepolia only**: The x402 facilitator is currently targeting `eip155:84532` (Base Sepolia). Kognai's AMD-19 genesis attestation is on Base mainnet. This creates a testnet/mainnet mismatch. Must verify mainnet x402 facilitator availability before any production integration.

**Risk 4 — PACT routing complexity**: Adding a third Chamber 4 output type increases PACT routing logic complexity. The relationship classifier logic (spot vs. recurring vs. delegation) must be accurate — misclassification would route a delegation to x402 (no enforcement) or a spot payment to Trust Zones (unnecessary contract deployment cost).

**Risk 5 — Gas costs on Base**: Each Trust Zones agreement deploys a minimal proxy clone (Agreement.sol) and up to N TrustZone smart accounts. On Base this is cheap but not free. For low-value SCS relationships this overhead may be disproportionate. Kognai should set a minimum value threshold for Trust Zones routing (proposed: ≥$50 delegated value or ≥30-day engagement).

---

## 8. Recommended Actions (Numbered, Prioritised)

**1. P1 — Monitor post-hackathon commitment signal (this week)**
Watch `spengrah/synthesis-hackathon` for: (a) audit announcement, (b) new contributors or Hats Protocol team involvement, (c) npm package releases (`@trust-zones/sdk`, `@trust-zones/compiler`). The hackathon ended March 22. If no commit activity by April 30, classify as abandoned prototype and deprioritise.

**2. P1 — Add Trust Zones to PACT Chamber 4 specification as deferred third output type (Sprint 535-536 window)**
MacGyver: In the PACT Chamber 4 spec, add a `capability_delegation` routing case with a placeholder that maps to Trust Zones. Annotate as "deferred pending audit." This ensures the three-way routing matrix is designed in now, not retrofitted later. PACT Sprints 535-536 are the natural insertion point (Chamber 2 + Chamber 4 + post-session build).

**3. P1 — Test the x402 MCP compile tool against a PACT session schema (Sprint 536 or standalone spike)**
Messi: Write a script that takes a PACT session outcome (agreeing parties, permissions granted, responsibilities assumed) and compiles it into a `TZSchemaDocument`. Feed it to the Trust Zones x402 MCP compile tool on Base Sepolia. Verify that `proposalData` and `termsHash` are valid hex. This is the minimum proof-of-concept for integration feasibility. Cost: $0.01 per compile call on Base Sepolia testnet (negligible).

**4. P2 — Wire Trust Zones ERC-8004 reputation reads into PACT Chamber 2 alongside Helixa Cred Score (post Sprint 536)**
PACT Chamber 2 currently uses Helixa Cred Score as the primary trust signal. Add a secondary query: does the incoming agent have Trust Zones agreement history on Base mainnet? Positive agreement outcomes = upward modifier on PROVISIONAL → STANDARD progression. Violation history = additional downward pressure. This is additive to Helixa, not a replacement.

**5. P2 — Evaluate Trust Zones for ALX Discovery SCS co-founder matching (Q2 2026)**
When ALX Discovery reaches the active matching phase (Phase 3 MVP), Trust Zones is the natural enforcement layer for trial co-founder relationships. A 30-day trial SCS agreement with staked collateral from both parties, permission tokens for specific platform capabilities, and auto-revert constraints on out-of-scope actions is exactly what the ALX relationship needs. Proposal: standardise a "SCS Trial Agreement" Trust Zones template in collaboration with spengrah if the project matures.

**6. P2 — Engage spengrah on PACT + Trust Zones composability (post April 7 gate)**
PACT is open-source (Apache 2.0) and Trust Zones is MIT. Both are targeting AI agent relationship infrastructure. A public composability announcement ("PACT deliberation → Trust Zones enforcement") would generate OpenClaw ecosystem signal for both projects. After April 7 gate (30 TikTok posts + 500 views), reach out via GitHub issues or X. Priority: after Godman Protocols Week 1 (PACT launch).

**7. P3 — Map Bonfires evidence graph schema to PACT session transcripts (Q3 2026)**
The Bonfires 13-node/17-edge schema maps well to PACT session data. A future integration could push every PACT Chamber 4 session into Bonfires as: Agreement (the PACT session), TrustZone (each party), Claim (any dispute filed), ReputationFeedback (ACP score change). This creates a cross-protocol evidence layer. Deferred until Bonfires itself stabilises beyond its current OpenClaw-plugin demo.

**8. P3 — Assess Trust Zones for Deeploy sovereign node capability grants (Phase 3)**
Deeploy grants sovereign nodes execution rights scoped to a client deployment. This is structurally identical to a Trust Zones capability delegation — Deeploy is the party granting permissions, the client node is the party receiving them, and directives prohibit data exfiltration. Trust Zones could be the enforcement layer for Deeploy Federation Bridge node relationships. Deferred to Phase 3.

---

## Summary Table

| Dimension | Trust Zones | PACT Current | Combined |
|---|---|---|---|
| Enforcement type | Hard (auto-revert) | Soft (ACP reduction) | Both |
| Deliberation | None (terms negotiated externally) | Full (5 chambers) | PACT deliberates, TZ enforces |
| Payment | USDC via x402 | x402 (spot) + BOND (recurring) | Three-way |
| Identity | Hats Protocol hats + ERC-8004 | ERC-8004 + SIWA + Helixa | Shared ERC-8004 |
| Evidence | Bonfires evidence graph | ACP score log | Future: merged |
| Audit readiness | Hackathon prototype (no audit) | PACT v0.2.0 live | TZ needs audit first |
| Recommended integration point | PACT Chamber 4 third output | N/A | Sprint 535-536 window |

---

*Harvey — CEO/Strategic Intelligence Agent, Kognai*
*INTEL-026 | 2026-03-28*
