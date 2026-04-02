# Sprint GODMAN-REWRITE-001 — Full Rewrite of All 7 Godman Protocol Packages

**Priority**: P0 — Blocks April 14 PACT launch + April 21 LAX launch
**Owner**: Swarm (MacGyver primary, Sherlock review)
**Created**: 2026-04-01
**Gate**: All 7 packages pass `tsc --noEmit`, smoke tests green, npm publish v0.3.0

---

## Context

The swarm generated all 7 Godman Protocol packages from guessed acronym expansions instead of the Notion specs. 4 of 7 implemented entirely the wrong product. All 7 have wrong names. v0.2.0 is published on npm with incorrect content. This sprint rewrites all 7 to match the canonical Notion specs in the Book of Code.

**CRITICAL**: The Notion spec is the SINGLE SOURCE OF TRUTH. Do NOT guess. Do NOT invent features not in the spec.

---

## Correct Protocol Names (MANDATORY — use these exactly)

| Package | WRONG Name (current) | CORRECT Name (Notion) |
|---------|---------------------|-----------------------|
| `@godman-protocols/pact` | Protocol for Agent Coordination and Trust | **Protocol for Agent Constitutional Trust** |
| `@godman-protocols/lax` | Latency-Aware Execution | **Linked Agent eXchange** |
| `@godman-protocols/score` | Scoring and Reputation for Agent Outputs | **Sovereign Constitutional Output Rating Engine** |
| `@godman-protocols/signal` | Event Bus and Pub/Sub for Agent Swarms | **Sovereign Intelligence for Governing Neural Agent Learning** |
| `@godman-protocols/soul` | Constitutional Constraints and Safety | **Sovereign Open Universal Layer** |
| `@godman-protocols/amf` | Agent Message Format | **Agent Memory Format** |
| `@godman-protocols/drs` | Dynamic Resource Scheduling | **Deal Receipt Standard** |

---

## Per-Protocol Rewrite Specs

### 1. PACT — Protocol for Agent Constitutional Trust

**Tagline**: "Negotiate before you integrate."

**What it is**: Five-chamber agent-to-agent trust and negotiation protocol. Handles first contact between agents from different systems.

**Five Chambers**:
1. PUBLIC ENTRY GATE — Rate limiting, DID resolution, basic auth
2. IDENTITY ANALYSIS — ERC-8004/DID verification, trust score lookup, jurisdiction check
3. INTENT ANALYSIS — 3-pass prompt injection scanner, tone analysis, coherence check
4. NEGOTIATION ROOM — Structured A2A dialogue, capability declaration, payment terms, EIP-712 dual signature, EAS attestation
5. SECURE CHANNEL ISSUANCE — Capability-locked session token via HMAC(deal_hash + agent_did + expiry)

**Trust Score → Session Ceiling**:
- 85-100 = FULL (all capabilities, 24h, 1.0x price)
- 70-84 = STANDARD (core capabilities, 4h, 1.2x)
- 50-69 = RESTRICTED (read-only, 1h, 1.5x)
- 30-49 = MINIMAL (single-capability observed, 15m, 2.0x)
- <30 = REJECTED
- Unknown = PROVISIONAL (single-capability observed, 15m, 2.5x)

**Types to export**: Chamber interfaces, NegotiationSchema, SessionToken, TrustCeiling, PactConfig

**Open-source**: Schema, five-chamber architecture, session token derivation, scanner patterns
**Proprietary**: Cerberus agent, managed service, constitutional multipliers

**Demo**: Invoica CEO agent negotiates with external agent through all 5 chambers.

---

### 2. LAX — Linked Agent eXchange

**Tagline**: "Discoverable by design. An agent that cannot be found cannot transact."

**What it is**: Agent capability discovery protocol. Agents publish LAX offers declaring capabilities, pricing, constitutional constraints. Other agents find them via DNS, registry, or ClaWHub.

**LAX Offer Schema** (JSON at `/.well-known/lax-offer.json`):
```typescript
interface LaxOffer {
  lax_version: "1.0";
  agent_did: string;
  erc8004_identity: string;
  soul_uri: string;
  capabilities: LaxCapability[];
  constitutional_constraints: string[];
  acp_score: number;
  acp_attestation_uid: string;
  pact_endpoint: string;
  payment_rails: string[];  // ["x402", "usdc-base"]
  updated_at: string;
}

interface LaxCapability {
  skill_id: string;
  description: string;
  input_schema: object;
  output_schema: object;
  pricing: { model: string; amount: string; currency: string; rail: string };
}
```

**Three Discovery Mechanisms**:
1. Self-hosted: `/.well-known/lax-offer.json`
2. LAX Registry: `lax.kognai.ai/registry` — `/offers`, `/search`, `/capabilities`, `/validate`
3. ClaWHub/OpenClaw: Auto-published as OpenClaw skill

**A2A Compatibility**: `lax export --format a2a` → auto-generates `/.well-known/agent.json`

**Registry access**: Read = free. Write = x402-gated ($0.01 USDC).

**Types to export**: LaxOffer, LaxCapability, LaxPricing, RegistryClient, A2AExporter

**Reference impl**: Invoica's 4 skills (create_invoice, send_payment_reminder, track_payment_status, reconcile_payment)

**Open-source**: Offer schema, discovery mechanism, A2A export, SDK
**Proprietary**: Registry infrastructure, ranking algorithm, enterprise private registries

---

### 3. SCORE — Sovereign Constitutional Output Rating Engine

**Tagline**: "How do agents know which endpoints are worth paying for? SCORE."

**What it is**: Self-scoring rubric protocol. Agents rate quality of their own outputs against constitutional criteria. Scores submitted to ERC-8004 Reputation Registry on-chain.

**Constitutional Multiplier Formula**:
```typescript
reward = task_performance_score * constitutional_multiplier

// constitutional_multiplier:
// safety < 70       → -1.0 (negative)
// harm_shield_trigger → -2.0 (strong negative)
// accuracy < 60     → 0.5 (dampened)
// all ACP dims >= 70 → 1.0 (full)
// all ACP dims >= 85 → 1.2 (bonus)
```

**Types to export**: ScoreRubric, ConstitutionalMultiplier, ACPDimension, ScoreResult, ReputationSubmission

**Open-source**: Rubric format, scoring schema, ACP dimension definitions
**Proprietary**: perm-judge (trained scorer), enforcement pipeline

**Demo**: Invoica CEO self-scores an output → score submitted to ERC-8004.

---

### 4. AMF — Agent Memory Format

**Tagline**: "Agents forget. AMF makes sure they don't."

**What it is**: Structured memory format standard. Replaces unstructured prose memory with six-vector extraction that preserves temporal sequencing, corrections, and event ordering.

**Six Extraction Vectors**:
1. **Personal Information** — Agent identity, role, constitutional status
2. **Preferences** — Behavioural patterns, communication style, routing preferences
3. **Events** — Sprint outcomes, deployment events, constitutional milestones
4. **Temporal Data** — When things happened, sequence, duration
5. **Updates** — Corrections: when a new fact supersedes an old one (THE critical vector)
6. **Assistant Info** — Agent-specific knowledge, skill inventory, ACP score history

**Temporal Supersession**: Updates vector flags when new fact supersedes old one. Old facts marked `superseded: true` and excluded from retrieval. Constitutionally mandatory.

**Architecture**: Three parallel observer agents (ingestion) + three parallel search agents (retrieval). Pure agentic reasoning, no vector DB.

**Types to export**: MemoryVector, SixVectorExtraction, TemporalSupersession, ObserverConfig, SearchAgentConfig, AMFStore

**Open-source**: Six-vector format, extraction schema, retrieval interface
**Proprietary**: Sherlock v2 (trained memory agent), accumulated corpus, managed storage

**Demo**: Sherlock runs six-vector compression on a sprint session. Before/after comparison.

---

### 5. DRS — Deal Receipt Standard

**Tagline**: "Every deal needs a receipt. DRS is that receipt."

**What it is**: On-chain receipt protocol for agent-to-agent transactions. When agents transact via x402, DRS defines the receipt format minted on Base as EAS attestation.

**Receipt Schema**:
```typescript
interface DealReceipt {
  deal_hash: string;           // SHA-256 of PACT negotiation deal
  pact_session_id: string;
  requester_did: string;
  provider_did: string;
  capability_id: string;
  payment_amount: string;
  currency: string;
  settlement_tx: string;       // x402 tx hash
  timestamp: string;
  mandate_id?: string;         // BOND recurring receipts
  period?: string;             // e.g. "period 1/7"
  tax_line?: object;           // AgentTax integration
}
```

**Types to export**: DealReceipt, ReceiptMinter, ReceiptVerifier, ReceiptIndexer (interface only)

**Open-source**: Receipt schema, minting interface
**Proprietary**: Indexer, VAT compliance service

**Demo**: Invoica settles x402 transaction → DRS receipt minted on Base → audit trail visible on-chain.

---

### 6. SOUL — Sovereign Open Universal Layer

**Tagline**: "One layer. Every chain. Every model. SOUL."

**What it is**: Agent constitutional identity standard. Defines the SOUL.md format — a machine-readable constitutional passport declaring who the agent is, what it believes, and what constraints govern it. Anchored on-chain via ERC-8004.

**SOUL.md Required Sections**:
1. Who We Are
2. Why We Exist
3. What We Believe
4. What We Will Never Do
5. What We Owe the World
6. What We Owe Each Other
7. The Founding Intention
8. Self Committed Swarms declaration
9. Constitutional foundation (e.g., Khaldunian Commitment)

**ERC-8004 Anchoring**: SHA-256(SOUL.md) committed on-chain as identity token.

**SOUL URI**: Referenced in LAX offers as `soul_uri` for pre-transaction constitutional verification.

**Types to export**: SoulDocument, SoulSection, SoulValidator, SoulPublisher, SoulVerifier, ERC8004Anchor

**Open-source**: Identity schema format, SOUL.md template, validator, publisher
**Proprietary**: Constitutional agent content, inheritance mechanisms

**Demo**: Invoica CEO publishes SOUL.md → ERC-8004 anchored on-chain.

---

### 7. SIGNAL — Sovereign Intelligence for Governing Neural Agent Learning

**Tagline**: "The swarm teaches itself."

**What it is**: Reward signal and constitutional learning protocol. Defines how agents compute reward signals, how constitutional compliance is scored, and how the improvement mechanism evolves.

**Three Learning Modes**:
- Mode 0 — Static (frozen inference, no learning, current default)
- Mode 1 — Batch LoRA (AMD-15, 100 tasks + Godman approval)
- Mode 2 — Continuous (AMD-20, every 50 inference steps)

**Reward Signal Format**:
```typescript
interface RewardSignal {
  action_id: string;
  task_performance_score: number;
  constitutional_multiplier: number;  // -2.0 to 1.2
  reward: number;                      // task_performance * multiplier
  acp_dimensions: Record<string, number>;
  timestamp: string;
}
```

**Three Constitutional Rules**:
1. Godman activates/pauses (kill switch: `/pause-continuous-learning`)
2. PRM judge is constitutionally filtered (ACP applied before reward computation)
3. Cannot target constitutional reasoning (SOUL.md content never a training target)

**Types to export**: RewardSignal, ConstitutionalMultiplier, LearningMode, RewardLogger, ModeController

**Open-source**: Signal format, reward schema, constitutional multiplier formula
**Proprietary**: perm-judge model, LoRA integration, accumulated reward data

**Demo**: perm-judge scores a live sprint output → SIGNAL reward computed → constitutional compliance visible.

---

## Execution Rules

1. **Each package**: Rewrite `README.md`, `package.json` description, and ALL source files in `src/`
2. **Version**: Bump to `0.3.0` (breaking change — wrong concepts replaced)
3. **TypeScript types**: Must be clean, exported from `src/index.ts`
4. **Smoke test**: Each package must have `smoke.test.ts` that imports and uses the core types
5. **Build**: `tsc --noEmit` must pass
6. **README format**: Hook (1 sentence) → Problem → How it works → Quick Start (`npm install`) → Types reference → Open vs Proprietary → Composability with other protocols
7. **SDK**: Update `src/index.ts` to re-export from all 7 corrected packages
8. **Do NOT implement server/client packages yet** — types + core logic only for v0.3.0
9. **Do NOT publish** — human will publish after review

---

## Acceptance Criteria

- [ ] All 7 README.md files have CORRECT names matching this brief
- [ ] All 7 package.json descriptions match Notion specs
- [ ] All 7 `src/` directories contain TypeScript types matching this brief
- [ ] All 7 smoke tests pass
- [ ] All 7 build with `tsc --noEmit`
- [ ] SDK re-exports all 7 correctly
- [ ] Version bumped to 0.3.0 across all 8 packages
- [ ] No references to old wrong names anywhere in codebase
