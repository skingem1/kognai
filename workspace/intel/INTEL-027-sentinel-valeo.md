# INTEL-027 — Valeo Sentinel: x402 Per-Agent Spend Governance
## Date: 2026-03-28
## Agent: Satoshi

---

### 1. What is Valeo/Sentinel?

**Valeo** is an AI-native financial infrastructure company. Their public identity has two distinct faces:

- **Valeo Protocol** (`valeoprotocol.io`) — the AI payments stack built on Solana, combining: a non-custodial iOS wallet, the v402 agent payment protocol, and the $UAID stablecoin. This is the Solana/consumer layer.
- **Valeo Cash** (`valeocash.com`, `sentinel.valeocash.com`) — the enterprise compliance and audit infrastructure layer. This is where Sentinel lives.

**Sentinel** is the compliance and audit product from Valeo Cash. Its formal package description is: "Enterprise audit, compliance, and budget enforcement for x402 payments." It is a wrapper layer that intercepts every x402 payment a software agent makes, enforces configurable budget policies, and writes a signed audit record to a configurable storage backend.

The core product claim: "One line to add. Zero config to start."

**What problem it solves:** The x402 protocol (Coinbase open standard, HTTP 402 payment-for-access) provides the payment rails but ships with zero built-in budget controls, audit trails, or per-agent spend governance. Any autonomous agent using x402 can spend without limit and leave no structured record. Sentinel fills this gap as a drop-in wrapper around the agent's `fetch` function.

Valeo cites KPMG 2025 research: 75% of enterprise leaders cite compliance as a blocker for autonomous agent payments. 61% report fragmented payment logs across agent fleets.

---

### 2. Technical Architecture

Sentinel operates as a three-layer system inserted between the agent's code and the x402-enabled HTTP endpoint:

```
Agent Code
    |
    v
wrapWithSentinel(fetch, config)   <-- Sentinel wrapper
    |
    |-- Policy Engine (BudgetManager)
    |     |-- per-call limit check
    |     |-- hourly rolling check
    |     |-- daily rolling check
    |     |-- lifetime total check
    |     |-- spike detector (rolling average)
    |     |-- endpoint allowlist/blocklist
    |     |-- requireApproval handler (human-in-loop)
    |
    |-- Audit Layer (AuditLogger)
    |     |-- HMAC-SHA256 signed record per payment
    |     |-- storage backend (Memory / FileStorage JSONL / ApiStorage)
    |     |-- enrichment / tagging
    |
    v
x402 HTTP endpoint (Base, EVM, etc.)
```

**Key components:**

- `BudgetManager` — stateful class that tracks `totalSpend`, `hourlySpend`, `dailySpend`, `callCount`, and `rollingWindowPayments` in real-time. Evaluates every pending payment before it proceeds. Returns `BudgetViolation` if blocked.
- `SpikeDetector` — maintains a rolling window of recent payment amounts. If a new payment exceeds `spikeThreshold` (default 3.0x) times the rolling average, it flags as an anomaly. Configurable threshold.
- `AuditLogger` — writes one structured record per payment to the configured storage backend. Supports query, summarize, and export methods.
- Storage backends:
  - `MemoryStorage` — default, no persistence, insertion-order tracking, max capacity configurable
  - `FileStorage` — writes JSONL to disk, auto directory creation, periodic flush
  - `ApiStorage` — posts to a remote API (Sentinel cloud dashboard), local fallback buffer, auto-batching
- `sentinel-router` (separate package) — for multi-provider x402 routing. Executes calls to multiple paid APIs in parallel/sequential/best-effort mode. Returns a unified cryptographic receipt (SHA-256 client hash + HMAC-SHA256 server signature + individual payment proof links).
- CLI (`create-sentinel`) — interactive wizard, `doctor` config validator, `inspect <receipt_id>` verifier, `status` terminal summary.

**Network layer:** Audit records use CAIP-2 network identifiers. `eip155:8453` (Base mainnet) appears explicitly in the type definitions and documentation examples. No Solana chain support is present in Sentinel — Solana lives only in the Valeo Protocol/UAID product line.

**Dashboard:** Hosted at `sentinel.valeocash.com/dashboard`. Real-time monitoring of agent payments, team summaries, budget status, anomaly alerts. Supports Slack, Discord, and PagerDuty alert integrations. Scheduled PDF report export. Public x402 payment explorer for network-wide transaction visibility.

---

### 3. x402 Integration Depth

Sentinel wraps the Coinbase x402 standard (`@x402/core`, `@x402/fetch`) as optional peer dependencies. It is not a fork — it is an audit and enforcement layer on top of the existing x402 client.

**Integration points:**

1. **Pre-payment hook (`beforeRequest`)** — Policy Engine evaluates payment against budget before the HTTP 402 round-trip occurs. If blocked, throws `SentinelBudgetError` without making any payment. This is a hard stop, not a log-only warning.
2. **Post-payment hook (`afterResponse`)** — AuditLogger writes the signed record after successful payment confirmation. Captures `tx_hash`, `status_code`, `response_time_ms`, `budget_remaining`.
3. **Lifecycle hooks for custom logic:**
   - `afterPayment(context, receipt)` — fires after every successful payment
   - `onBudgetExceeded(violation)` — fires on policy breach; can trigger alerts
   - `onAnomaly(context, anomaly)` — fires on spike detection

**Base mainnet compatibility:** Confirmed. The `Network` type is defined as CAIP-2 format (`"${string}:${string}"`). The documentation explicitly uses `eip155:8453` (Base mainnet chain ID = 8453) in audit record examples. No additional configuration is needed to route through Base — it inherits from the underlying `@x402/evm` client configuration.

**Claim validation — "one npm install":** Partially true. The core package `@x402sentinel/x402` is one install. However:
- If you are already using `@x402/fetch` and a private key signer, Sentinel wraps that existing setup.
- If starting from zero on x402, you need `@x402/core` + `@x402/fetch` + signer setup first — Sentinel is an additive wrapper, not a standalone payment client.
- For Kognai's existing x402 integration on Base, the "one install" claim holds: wrap the existing fetch, add `agentId` and `budget`, done.

**No lock-in:** The wrapper is transparent. To remove Sentinel, replace `sentinelFetch` with the original `fetch`. No data migration required.

---

### 4. Per-Agent Budget Policy API

**Full TypeScript interface (from `@x402sentinel/x402` v0.2.0 type definitions):**

```typescript
interface SentinelConfig {
  agentId: string;                    // Required — unique agent identifier
  team?: string;                      // Optional — group agents for team-level reporting
  humanSponsor?: string;              // Optional — email for approval notifications
  budget?: BudgetPolicy;              // Optional — defaults to unlimitedPolicy if omitted
  audit?: AuditConfig;                // Optional — audit trail configuration
  hooks?: SentinelHooks;              // Optional — lifecycle event callbacks
  metadata?: Record<string, string>;  // Optional — custom key-value tags
}

interface BudgetPolicy {
  maxPerCall?: string;          // Max USDC per single payment (e.g., "0.10")
  maxPerHour?: string;          // Max USDC in any rolling 60-minute window
  maxPerDay?: string;           // Max USDC in any rolling 24-hour window
  maxTotal?: string;            // Lifetime spend cap (hard ceiling)
  spikeThreshold?: number;      // Multiplier vs rolling average (default: 3.0)
  allowedEndpoints?: string[];  // Glob patterns — only these endpoints allowed
  blockedEndpoints?: string[];  // Glob patterns — these endpoints always blocked
  requireApproval?: {
    threshold: string;          // USDC amount above which human approval required
    handler: (context: PaymentContext) => Promise<PaymentDecision>;
  };
}

interface AuditConfig {
  enabled: boolean;                    // Default: true
  storage: StorageBackend;             // MemoryStorage | FileStorage | ApiStorage
  enrichment?: EnrichmentConfig;       // Static tags + dynamic tag rules
  redactFields?: string[];             // Field names to mask in audit records
}

interface SentinelHooks {
  afterPayment?: (ctx: PaymentContext, receipt: AuditRecord) => void;
  onBudgetExceeded?: (violation: BudgetViolation) => void;
  onAnomaly?: (ctx: PaymentContext, anomaly: SpikeAnomaly) => void;
}
```

**Preset policies (ready-to-use factory functions):**

| Policy | maxPerCall | maxPerHour | maxPerDay | Notes |
|--------|-----------|-----------|----------|-------|
| `conservativePolicy()` | $0.10 | $5.00 | $50.00 | Research agents, exploratory |
| `standardPolicy()` | $1.00 | $25.00 | $200.00 | Production agents, moderate usage |
| `liberalPolicy()` | $10.00 | $100.00 | $1,000.00 | High-frequency, data-heavy agents |
| `unlimitedPolicy()` | none | none | none | Audit-only, no blocking |
| `customPolicy(overrides)` | any | any | any | Extends standard with overrides |

**Per-agent instantiation pattern:**

```typescript
import { wrapWithSentinel, customPolicy, FileStorage } from "@x402sentinel/x402";

// MacGyver — execution agent, moderate spend
const macgyverFetch = wrapWithSentinel(paymentFetch, {
  agentId: "macgyver",
  team: "kognai-core",
  humanSponsor: "godman@kognai.ai",
  budget: customPolicy({
    maxPerCall: "0.50",
    maxPerHour: "10.00",
    maxPerDay: "50.00",
    maxTotal: "500.00",
    spikeThreshold: 2.5,
  }),
  audit: {
    enabled: true,
    storage: new FileStorage("./logs/sentinel/macgyver.jsonl"),
    enrichment: {
      staticTags: { agent_role: "execution", sprint: "current" },
    },
  },
  hooks: {
    onBudgetExceeded: (v) => sendTelegramAlert(`MacGyver budget breach: ${v.type}`),
    onAnomaly: (ctx, a) => sendTelegramAlert(`MacGyver spike: ${a.amount} vs avg ${a.average}`),
  },
});
```

Each agent gets its own wrapped `fetch` instance with independent budget state. Budget state is NOT shared between agents unless you explicitly wire them to the same `BudgetManager` instance.

---

### 5. Audit Trail + Treasury Report Integration

**Audit record schema (every payment generates one):**

```typescript
interface AuditRecord {
  id: string;                    // UUID
  agent_id: string;              // e.g., "satoshi"
  team: string;                  // e.g., "kognai-core"
  human_sponsor: string;         // e.g., "godman@kognai.ai"
  amount: string;                // USDC decimal (e.g., "0.001500")
  asset: string;                 // e.g., "USDC"
  network: string;               // CAIP-2 (e.g., "eip155:8453" = Base)
  tx_hash: string;               // On-chain transaction hash
  endpoint: string;              // URL called (e.g., "https://api.messari.io/...")
  method: string;                // HTTP method
  status_code: number;           // HTTP response status
  response_time_ms: number;      // Latency
  policy_evaluation: {           // Result of budget check
    decision: "approved" | "blocked";
    violation?: BudgetViolation;
    budget_state_snapshot: BudgetState;
  };
  budget_remaining: {            // At time of payment
    hourly: string;
    daily: string;
    total: string;
  };
  created_at: string;            // ISO 8601 timestamp
  tags: Record<string, string>;  // Enrichment tags
  metadata: Record<string, string>;  // Custom metadata
  _signature: string;            // HMAC-SHA256 proof
}
```

**Storage — recommended configuration for Kognai:**

```typescript
// Per-agent JSONL files for local treasury processing
new FileStorage("./logs/sentinel/macgyver.jsonl")
new FileStorage("./logs/sentinel/bloomberg.jsonl")
new FileStorage("./logs/sentinel/sherlock.jsonl")
new FileStorage("./logs/sentinel/satoshi.jsonl")

// Plus remote API storage for dashboard visibility
new ApiStorage({
  endpoint: "https://sentinel.valeocash.com/api/ingest",
  apiKey: process.env.SENTINEL_API_KEY,
  batchSize: 25,
  flushInterval: 30_000,  // 30s
  fallback: new FileStorage("./logs/sentinel/fallback.jsonl"),
})
```

**Treasury report integration — Satoshi morning brief:**

The `AuditLogger` exposes three query methods that map directly to treasury report sections:

```typescript
// 1. Per-agent daily spend summary
const summary = await logger.summarize({
  agentId: "macgyver",
  from: startOfDay,
  to: now,
});
// Returns: { totalSpend, callCount, avgPerCall, topEndpoints[], violations[] }

// 2. Full query with filtering
const records = await logger.query({
  agentIds: ["macgyver", "bloomberg", "sherlock", "satoshi"],
  from: yesterday,
  to: now,
  status: "approved",
});

// 3. Export to JSON for downstream processing
const json = toJSON(records, true);  // pretty-printed

// 4. Export to CSV for spreadsheet/archival
const csv = toCSV(records);
```

**Proposed Satoshi treasury report pipeline:**

```
06:00 daily cron
    |
    +--> Read ./logs/sentinel/*.jsonl (all 4 agents, last 24h)
    |
    +--> AuditLogger.summarize() per agent
    |       returns: spend, call_count, top_endpoints, violations, anomalies
    |
    +--> Generate treasury JSON:
    |    {
    |      date, total_spend_usdc,
    |      agents: {
    |        macgyver: { spend, calls, violations, budget_remaining },
    |        bloomberg: { ... },
    |        sherlock: { ... },
    |        satoshi: { ... }
    |      },
    |      anomalies: [...],
    |      on_chain_receipts: [tx_hash, ...],
    |      csv_export_path: "..."
    |    }
    |
    +--> Write to ./reports/treasury/YYYY-MM-DD-treasury.json
    |
    +--> Telegram push → Godman morning brief
```

This is a clean integration with the existing Kognai treasury report infrastructure. The JSONL files are flat, line-delimited, and trivial to parse with `readline` or `fs.createReadStream`. No external database required.

**Cryptographic integrity:** Every record carries `_signature` (HMAC-SHA256). The `create-sentinel inspect <receipt_id>` CLI command verifies any record without authentication. This provides tamper-evidence for the treasury archive.

---

### 6. $UAID Assessment

**What is UAID?**

$UAID is a stablecoin purpose-built for autonomous AI agents, developed by Valeo Protocol on Solana. "UAID" stands for Universal Agent Identity Dollar (inferred from context — the litepaper PDF was not publicly accessible during this research).

**Key properties from available documentation:**

- **Programmable settlement** — designed for agent-to-agent payments where traditional EOA wallets are insufficient
- **Verifiable transaction flows** — every payment carries proof-of-execution, not just proof-of-transfer
- **Replay-safe receipts** — prevents double-spend attacks in automated agent loops
- **Capability-scoped payment intents** — payment authorizations are scoped to specific permitted actions, not open-ended fund transfers
- **Non-custodial** — agents hold their own keys; Valeo does not custody funds

**v402 vs x402:**

Valeo has developed "v402" as their Solana-native variant of the x402 protocol. v402 adds:
- Capability-scoped intents (what the payment is authorized to purchase)
- Replay-safe receipts
- Proof-of-execution flows

The Coinbase x402 standard (`@x402/core`) underpins EVM chains (Base, Ethereum, etc.). v402 appears to be a conceptually parallel standard for Solana, with the UAID stablecoin as the settlement asset.

**UAID relationship to Sentinel:**

This is the critical gap: **UAID and Sentinel currently operate on separate chains and separate payment protocols.**

- Sentinel (`@x402sentinel/x402`) wraps Coinbase x402 → EVM chains → Base mainnet → USDC settlement
- UAID lives on Solana, settled via v402

There is NO documented Sentinel integration with UAID or Solana in the current v0.2.0 SDK. The audit record's `network` field uses CAIP-2 EVM identifiers. No SVM (Solana Virtual Machine) chain support is present.

**Assessment for Kognai:**

UAID is architecturally interesting as a future agent-native stablecoin with stronger programmatic guarantees than vanilla USDC. However:
- Kognai runs on Base mainnet (EVM)
- USDC is the current settlement asset
- Sentinel's x402 wrapper is EVM-native

UAID is a Phase 4+ consideration, not a Phase 1 dependency. Monitor for a future Sentinel release that adds Solana/v402 support. If/when Valeo Protocol unifies their stack (Solana UAID + EVM Sentinel), the combined product would be a strong candidate for Kognai's treasury layer.

**Risk flag:** Valeo Protocol's Solana focus and Valeo Cash's EVM focus suggest possible product fragmentation. It is unclear whether these are two products from the same team converging, or two separate entities using the Valeo brand. Godman should verify via direct contact before any deep integration dependency.

---

### 7. Install Steps (npm + config)

**Step 1 — Install core package**

```bash
npm install @x402sentinel/x402
```

Peer dependencies (likely already in Kognai's package.json):
```bash
npm install @x402/core @x402/fetch
```

**Step 2 — Get API key (optional for local-only operation)**

Visit `sentinel.valeocash.com/dashboard/settings` → generate API key.
For local-only JSONL storage (no cloud dashboard), API key is not required.

**Step 3 — Create sentinel config module**

```typescript
// scripts/lib/sentinel-config.ts
import {
  wrapWithSentinel,
  customPolicy,
  FileStorage,
  ApiStorage,
  SentinelBudgetError,
} from "@x402sentinel/x402";

export function createAgentFetch(
  paymentFetch: typeof fetch,
  agentId: "macgyver" | "bloomberg" | "sherlock" | "satoshi",
  policy: ReturnType<typeof customPolicy>
) {
  return wrapWithSentinel(paymentFetch, {
    agentId,
    team: "kognai-core",
    humanSponsor: process.env.GODMAN_EMAIL,
    budget: policy,
    audit: {
      enabled: true,
      storage: new FileStorage(`./logs/sentinel/${agentId}.jsonl`),
    },
    hooks: {
      onBudgetExceeded: (v) => {
        console.error(`[SENTINEL] ${agentId} budget breach: ${v.type} limit=${v.limit} attempted=${v.attempted}`);
        // Wire to Telegram notifier
      },
      onAnomaly: (ctx, a) => {
        console.warn(`[SENTINEL] ${agentId} spike: ${a.amount} USDC (avg=${a.average})`);
      },
    },
  });
}
```

**Step 4 — Validate endpoint compatibility**

```bash
npx @x402sentinel/test https://target-api.example.com/endpoint
```
Returns a 0-10 score across: reachability, HTTP 402 validation, payment schema, security headers, latency.

**Step 5 — Run doctor check**

```bash
npx create-sentinel doctor
```
Validates SDK install, config, API connectivity, and framework detection.

**Step 6 — Wire into Satoshi treasury cron**

Add a `generateTreasuryReport()` function that reads all four JSONL files, runs `summarize()` per agent, and writes the consolidated JSON report.

---

### 8. Recommended Per-Agent Caps (MacGyver / Bloomberg / Sherlock / Satoshi)

Caps are set in USDC. Kognai currently pays x402 endpoints for data access (Messari, Nansen, research APIs per INTEL-008/017). Based on known agent roles and the AgentTax framework ($0.001 USDC/call per TICKET-017):

**MacGyver — Execution / Build Agent**

Role: Sprint execution, code generation, tool calls, system writes. High call volume, moderate per-call cost.

```typescript
customPolicy({
  maxPerCall: "0.50",      // Hard stop on any single expensive tool call
  maxPerHour: "10.00",     // Prevents runaway sprint loops
  maxPerDay: "50.00",      // Daily ceiling
  maxTotal: "500.00",      // Phase budget ceiling
  spikeThreshold: 2.5,     // Flag if 2.5x rolling average
  requireApproval: {
    threshold: "5.00",     // Godman approval for any call >$5
    handler: approvalHandler,
  },
})
```

**Bloomberg — Intelligence / Research Agent**

Role: Market intelligence, data API calls, INTEL briefs. Moderate call volume, potentially higher per-call cost (paid data APIs).

```typescript
customPolicy({
  maxPerCall: "2.00",      // Data API calls can be pricier
  maxPerHour: "20.00",
  maxPerDay: "100.00",
  maxTotal: "1000.00",     // Research budget is higher
  spikeThreshold: 3.0,
  allowedEndpoints: [
    "*.messari.io/*",
    "*.nansen.ai/*",
    "*.coingecko.com/*",
    // Add known research endpoints
  ],
  requireApproval: {
    threshold: "10.00",
    handler: approvalHandler,
  },
})
```

**Sherlock — Audit / Verification Agent**

Role: Code review, compliance checks, ACP scoring, perm-judge. Low call frequency, low per-call cost. Should NOT be making high-value payments.

```typescript
conservativePolicy()  // $0.10/call, $5/hr, $50/day
// Sherlock hitting conservative limits = red flag worth investigating
// Add custom alert:
// onBudgetExceeded: alert as high severity (unexpected)
```

Or if Sherlock needs external verification APIs:
```typescript
customPolicy({
  maxPerCall: "0.25",
  maxPerHour: "5.00",
  maxPerDay: "25.00",
  maxTotal: "250.00",
  spikeThreshold: 2.0,   // Tighter — any spike is anomalous for audit agent
})
```

**Satoshi — Treasury / Financial Intelligence Agent**

Role: Financial reporting, payment reconciliation, budget analysis, INTEL briefs. Low frequency, may call pricing/DeFi APIs.

```typescript
customPolicy({
  maxPerCall: "1.00",      // Financial data APIs
  maxPerHour: "10.00",
  maxPerDay: "50.00",
  maxTotal: "500.00",
  spikeThreshold: 2.0,    // Treasury agent should never spike — tight threshold
  requireApproval: {
    threshold: "2.00",    // Satoshi should get Godman sign-off on anything >$2
    handler: approvalHandler,
  },
  allowedEndpoints: [
    "*.coingecko.com/*",
    "*.defillama.com/*",
    "*.etherscan.io/*",
    "*.basescan.org/*",
    // Add treasury-relevant endpoints
  ],
})
```

**Team-level summary caps (aggregate across all 4 agents):**

| Agent | maxPerCall | maxPerDay | maxTotal |
|-------|-----------|----------|----------|
| MacGyver | $0.50 | $50 | $500 |
| Bloomberg | $2.00 | $100 | $1,000 |
| Sherlock | $0.25 | $25 | $250 |
| Satoshi | $1.00 | $50 | $500 |
| **Team total (daily)** | — | **$225** | **$2,250** |

These are initial caps. After 30 days of data, recalibrate based on actual `summarize()` output from the JSONL files.

---

### 9. Recommended Actions (numbered, prioritised)

**P0 — Unblocks treasury visibility immediately**

1. **Install Sentinel core package.** `npm install @x402sentinel/x402`. No config required to start. Wrap existing `paymentFetch` with `sentinel(paymentFetch)` (zero-config mode) to begin capturing all x402 payments immediately, even before per-agent policies are wired.

2. **Create `./logs/sentinel/` directory** in Kognai repo and add `*.jsonl` to `.gitignore`. This prevents audit records (which may contain tx hashes) from being committed to the private repo.

**P1 — Per-agent governance**

3. **Create `scripts/lib/sentinel-config.ts`** with `createAgentFetch()` factory and the four per-agent policy objects from Section 8. Gate: each agent's wrapped fetch must produce a JSONL record before calling it done.

4. **Wire Satoshi treasury cron** to read all four JSONL files at 06:00 daily. Output: `./reports/treasury/YYYY-MM-DD-treasury.json`. Push to Telegram via existing notifier.

5. **Set `SENTINEL_API_KEY`** in `.env` and enable `ApiStorage` for cloud dashboard visibility at `sentinel.valeocash.com`. This gives real-time monitoring without waiting for the daily cron.

**P2 — Hardening**

6. **Wire `onBudgetExceeded` and `onAnomaly` hooks** to the Telegram notifier. Sherlock and Satoshi budget violations should be HIGH severity (they should never spike). MacGyver and Bloomberg violations are MEDIUM (expected in heavy sprint days).

7. **Add `requireApproval` handler** for MacGyver (>$5.00) and Satoshi (>$2.00). The handler should post a `/approve-payment` message to Telegram and block until Godman responds (30-minute timeout → auto-reject).

8. **Run `npx create-sentinel doctor`** after wiring to validate config before first production payment.

9. **Validate endpoints with `npx @x402sentinel/test`** for every x402 API Kognai calls (Messari, Nansen, any new research APIs). Score <7 = flag for manual review before agent is permitted to call it.

**P3 — Future**

10. **Monitor Valeo Protocol for Solana/UAID Sentinel integration.** When v402 + UAID support lands in `@x402sentinel/x402`, evaluate whether UAID's capability-scoped payment intents offer stronger guarantees than vanilla USDC for agent treasury. Assign to Satoshi EVAL-015 (queue after EVAL-014 AgentTax).

11. **Evaluate BOND v0.2 integration with Sentinel audit trail.** BOND protocol (AMD-019 + TICKET-016) generates recurring mandate receipts. Sentinel's `afterPayment` hook could capture BOND mandate executions and include them in the daily treasury report alongside spot x402 payments. Wire together in Sprint 540+.

12. **Add Sentinel records as evidence layer in AAR middleware.** Every x402 payment made during a sprint could be attached to the AAR receipt (already wired in Kognai). This creates a full economic record per autonomous action: what the agent decided, what it paid, what it received.

---

## Research Notes and Caveats

**Confirmed facts (from live package inspection):**
- Package `@x402sentinel/x402` v0.2.0 exists at npm, authored by Valeo, MIT license
- Repository: `https://github.com/valeo-cash/Sentinel`
- Homepage: `https://sentinel.valeocash.com`
- 7-package monorepo confirmed (cli, express, langchain, next, sentinel-router, sentinel-test, vercel-ai)
- `eip155:8453` (Base mainnet) explicitly in type definitions — Base compatible
- Full type definitions inspected from `unpkg.com` CDN
- 82+ passing tests per dashboard site metadata

**Confirmed facts (from valeocash.com/valeoprotocol.io):**
- Valeo Protocol = Solana-native (v402 + UAID stablecoin)
- Valeo Cash = EVM-native (Sentinel for x402)
- These appear to be the same company (two products) but this warrants direct verification

**Unresolved questions:**
- UAID litepaper PDF not publicly accessible during this research — full tokenomics unconfirmed
- Pricing tiers for Sentinel cloud dashboard not publicly listed (dashboard settings page was Next.js SSR, content not extractable)
- Whether Valeo Protocol and Valeo Cash are the same legal entity — domain redirect from `valeocash.com/litepaper` → `valeoprotocol.io` suggests yes, but not confirmed
- v0.2.0 is a relatively early version — API stability for production use should be evaluated

**Risk assessment:** LOW-MEDIUM. The package is real, the code is inspectable, the architecture is sound, and it solves a genuine gap in Kognai's treasury infrastructure. The main risk is early-stage package maturity (v0.2.0) and the ambiguous relationship between the Solana and EVM product lines. Recommend wiring in P1 with FileStorage (no cloud dependency) before committing to ApiStorage cloud integration.

---

*INTEL-027 prepared by Satoshi — Treasury Intelligence Agent, Kognai*
*Sources: npmjs.com/package/@x402sentinel/x402, unpkg.com CDN, sentinel.valeocash.com, github.com/valeo-cash/Sentinel, valeoprotocol.io, x402.org*
