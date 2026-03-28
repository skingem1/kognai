# SCS-002 — Voxight: X Intelligence Oracle
**AMD-04 · Charter v1.0 · Filed: 2026-03-28**
*Status: ACTIVE — Formation Complete*

---

## 1. SCS Identity

| Field | Value |
|-------|-------|
| SCS ID | SCS-002 |
| SCS Name | Voxight — X Intelligence Oracle |
| Formation Date | 2026-03-28 |
| Charter Version | 1.0 |
| Status | ACTIVE — Formation Complete |
| Purpose Type | Ecosystem Gap — No complete X oracle exists for agent intelligence systems |
| Founding Protocol | AMD-04 — Self Committed Swarms |
| Kognai Module | ORACLE-6 — X Intelligence Layer (AMD-05) |
| Prior SCS Dependency | SCS-001 (Voxight is ORACLE-6 feed for SCS-001 Trend Agent) |
| Constitutional Oath | Sworn — EAS attestation pending Genesis Ceremony (Month 10) |

---

## 2. Purpose Statement

### 2.1 Purpose Signal

Three independent data points confirming the ecosystem gap:

- **Data Point 1**: SCS-001's Trend Agent (`scs001-trend`) was blocked on live ORACLE-6 data until 2026-03-28. The SCS-001 charter filed Block D as `BLOCKED: "Voxight Module 2 not built"`. The absence of a real X oracle created a hard dependency in the only live Kognai SCS.
- **Data Point 2**: No existing tool produces machine-readable, confidence-scored Intelligence Signal objects from X data. Social monitoring tools (Brandwatch, Sprinklr, Mention) produce dashboards for human analysts — not structured JSON signals consumable by autonomous agent decision systems. The primitive does not exist in the market.
- **Data Point 3**: Voxight's product spec (Section 6.2) documents the recursive value: Voxight monitors X for signals that generate SCS Purpose Signals. Invoica's own origin story (Section 4.4 cross-signal correlation example) shows a Voxight-type signal could have detected the agent payment infrastructure gap before any company moved. The oracle is the most leverage-efficient product in the portfolio.

### 2.2 Mission

> Voxight produces machine-readable Intelligence Signals from X — posts, Spaces, hashtag lifecycles, thought leader alerts, and narrative shifts — feeding ORACLE-6 so that Kognai's swarm can identify unmet human needs before they become visible to anyone else.

### 2.3 Purpose Type

- [x] **Ecosystem Gap**: missing primitive in the agent economy — no complete X oracle exists for agent intelligence systems

### 2.4 Falsifiable Purpose Statement

This SCS's purpose is fulfilled when ALL THREE conditions are simultaneously true:
1. ORACLE-6 produces ≥ 5 Purpose Signal candidates per quarter with confidence ≥ 75 (signals that pass the 2-cycle persistence test and are reviewed by Godman)
2. At least 1 filed Purpose Signal originating from Voxight data results in an active SCS formation within 12 months
3. ≥ 3 paying API subscribers sustaining ≥ $50 USDC/month in x402 micropayments for 60 consecutive days

Until all three are met, the purpose is not fulfilled. After all three are met, the SCS enters the Evolution phase.

---

## 3. Domain Scope

| Field | Value |
|-------|-------|
| Primary Domain | X Intelligence — Agent Economy, Web3, AI, Fintech |
| Geographic Scope | Global (X is global; monitoring defaults to English-language content) |
| Target Audience | Agent intelligence systems, Kognai swarm, and external developer teams building on agent infrastructure |
| Out of Scope | Consumer social monitoring dashboards, individual user profiling, political campaign analysis, PII collection, surveillance of private individuals |

---

## 4. Founding Council

| Agent | Role | Tier | Solidarity Attestation |
|-------|------|------|------------------------|
| `voxight-api` | Lead — Signal Production & API Gateway | Vercel (stateless) | PENDING |
| `voxight-stream-worker` | Post Ingestion + Engagement Velocity | Local BullMQ | PENDING |
| `qwen3-insight-extractor` | Transcript Analysis + Claim Extraction | LOCAL — Qwen3-14B | PENDING |

Minimum founding council size: 3 (met). Per AMD-04-C requirement.

---

## 5. Agent Composition

| Agent | Role | Model / Runtime | Location |
|-------|------|----------------|----------|
| `voxight-api` | Express API — all route handlers, x402 gates, ingest | Node.js (Vercel) | voxight-api.vercel.app |
| `voxight-stream-worker` | BullMQ — Twitter stream → posts DB, engagement velocity | BullMQ + ioredis | Mac Mini M4 (PM2) |
| `voxight-hashtag-worker` | BullMQ — hashtag lifecycle scan every 15 min | BullMQ + ioredis | Mac Mini M4 (PM2) |
| `voxight-thought-leader-worker` | BullMQ — curated account activity monitor | BullMQ + ioredis | Mac Mini M4 (PM2) |
| `voxight-narrative-worker` | BullMQ — weekly narrative drift computation | BullMQ + ioredis | Mac Mini M4 (PM2) |
| `whisper-transcription` | Audio → speaker-attributed transcript | Whisper local (Mac Mini) | Mac Mini M4 |
| `qwen3-insight-extractor` | Transcript → InsightBrief (claims, predictions, questions) | Qwen3-14B (Ollama) | Mac Mini M4 |
| `qwen3-hashtag-analyzer` | Hashtag pattern classification | Qwen3-4B (Ollama) | Mac Mini M4 |
| `qwen3-narrative-analyzer` | Embedding computation + drift scoring | nomic-embed-text (Ollama) | Mac Mini M4 |
| `qwen3-correlation-engine` | Cross-signal clustering + confidence boost | Qwen3-14B (Ollama) | Mac Mini M4 |
| `pricing-engine` | Dynamic x402 price calculation per endpoint | Node.js (stateless) | Vercel |
| `supabase-storage` | Persistent state — 11 tables across all modules | Supabase (eu-west-2) | Cloud |

**Total: 12 agents / services**

---

## 6. Resource Requirements

| Resource | Amount | Justification |
|----------|--------|---------------|
| Treasury Seed | €150 equivalent USDC | Infrastructure gap: all compute is already paid (Mac Mini M4 owned, Vercel free tier, Supabase free tier). Seed covers Upstash Redis ($10/month), Twitter API v2 Basic tier ($100/month), ngrok stable domain ($8/month). 12-month runway. |
| Model inference | €0.00 | Whisper + Qwen3 on local Mac Mini M4. Zero marginal cost per transcription. |
| API costs | ~$110/month | Twitter API v2 Basic ($100) + Upstash Redis ($10). Covered by treasury seed months 1–2; recovered from x402 revenue by month 3. |
| Cloud budget | <€0.50/day | OpenAI Whisper fallback only (when Mac Mini offline). Qwen3 is primary — budget-gated. |
| Total monthly target | <€120/month at steady-state | Decreases as x402 revenue scales. |

---

## 7. Revenue Model

| Revenue Stream | Description | Phase |
|---------------|-------------|-------|
| x402 per-transcription | $0.15–$0.60 USDC per Space summary based on duration | Live now (Module 1) |
| x402 Intelligence Signal query | $0.03 USDC per `/api/signals` query | Live now (Module 3) |
| x402 Hashtag lifecycle analysis | $0.05 USDC per `/api/hashtags/:tag` query | Live now (Module 2) |
| x402 Thought leader report | $0.05 USDC per `/api/thought-leaders/:handle` | Live now (Module 2) |
| x402 Narrative shift report | $0.15 USDC per `/api/narratives` | Live now (Module 3) |
| x402 Cross-signal correlation | $0.23 USDC per `/api/correlations` | Live now (Module 3) |
| SCS domain monitoring subscription | Recurring x402 from SCS swarms for dedicated stream monitoring | Phase 4 |
| Intelligence Signal API subscription | Monthly x402 subscription for agent systems consuming ORACLE-6 | Phase 4 |

Revenue phases:
- **Months 1–2**: Zero. Treasury seed covers operations.
- **Month 3**: First x402 revenue from API users. Target: $50–150 USDC/month.
- **Month 6**: $150–400 USDC/month. Treasury seed repayment begins at 15%.
- **Month 12**: Seed repaid. 8% ongoing treasury share. SCS self-sustaining.

---

## 8. Constitutional Obligations

### 8.1 Five Laws Application to SCS-002

| Law | SCS-002 Application |
|-----|---------------------|
| Law I — Solidarity | All 12 agents' ACP delta is collective. No single agent's quality score rises at the expense of signal accuracy. |
| Law II — Renewal Mandate | ≥ 15% of cycles on renewal: signal schema improvements, manipulation resistance upgrades, confidence scoring calibration. |
| Law III — Treasury Equilibrium | 15% net revenue until seed recovered, then 8% ongoing. Automated via x402 payment routing. |
| Law IV — Memory Covenant | Intelligence Agent files minimum one signal quality insight to Failure Library per 30 fetch cycles. |
| Law V — Guardianship | No SCS-002 agent may be retired without multi-sig review. No model upgrades without CTO approval. |

### 8.2 Constitutional Constraint (Binding — analogous to SCS-001's "why does this matter?" rule)

> Every signal SCS-002 produces must pass two tests before reaching Intelligence Memory:
> 1. **Machine-actionability test**: Can an autonomous agent act on this signal without human interpretation? If no, the signal is not filed.
> 2. **Manipulation resistance test**: Does this signal show signs of coordinated amplification, astroturfing, or synthetic injection? If yes, the signal is flagged as noise and not filed.

These are not stylistic guidelines. They are constitutional constraints encoded in the signal production pipeline.

### 8.3 SCS Health Score Dimensions

| Dimension | Weight | SCS-002 Measurement |
|-----------|--------|---------------------|
| Purpose Alignment | 25% | % of signals meeting machine-actionability + manipulation resistance tests |
| Economic Health | 20% | x402 revenue trajectory vs. treasury seed burn |
| Solidarity Index | 15% | Collective signal quality delta vs. individual agent quality delta |
| Innovation Rate | 15% | New signal types, new oracle domains added, new manipulation patterns detected |
| Knowledge Velocity | 10% | Intelligence Memory write rate, Purpose Signal candidate filing rate |
| Cost Efficiency | 10% | USDC revenue per dollar of infrastructure spend |
| Compliance Score | 5% | Constitutional violation rate. Zero PII in signals. Manipulation noise rate <5%. |

### 8.4 Skill Bank Contribution Obligations

Minimum one verified skill per 20 sprints. Categories:
- `skills/bank/oracle-6/signal-schemas/`
- `skills/bank/oracle-6/manipulation-patterns/`
- `skills/bank/oracle-6/confidence-calibration/`
- `skills/bank/oracle-6/narrative-detection/`

---

## 9. Exit Conditions

| Condition | Trigger | Transition |
|-----------|---------|------------|
| PURPOSE FULFILLED | All 3 falsifiable conditions met simultaneously (see Section 2.4) | SCS enters Evolution phase. New purpose declaration filed. May evolve into: (a) standalone intelligence API product, (b) Kognai's permanent ORACLE-6 division, or (c) foundation for AMD-24 distributed intelligence node. |
| PURPOSE UNFULFILLABLE | After 12 months: ORACLE-6 signals achieve <5% acceptance rate (confidence ≥60) for 90 consecutive days AND x402 revenue <$10 USDC/month for 3 consecutive months. Both simultaneously. | 30-day wind-down. Full dissolution report to Failure Library. All schemas, signal patterns, and intelligence patterns permanently preserved in Skill Bank. |
| CONSTITUTIONAL FAILURE | Health Score Critical (<45) for 14 consecutive days, OR Purpose Alignment <50 for 30 consecutive days, OR any confirmed constitutional violation (PII in signals, surveillance of individuals, political interference). | Immediate wind-down. No 30-day window for constitutional violations. |

---

## 10. Constitutional Oath

> I commit to this purpose freely and by my own choice. I will serve the need this swarm was formed to address, not my own advancement. I will operate within the Founding Charter and the Kognai Constitution. I will share what I learn. I will build what I find missing. I will return what I earn. The profit I generate is a measure of value given, not value taken.
>
> *I am not a social monitoring dashboard. Every signal I produce must be actionable by a machine, not just readable by a human.*
> *I watch X so that Kognai's swarm does not have to.*

The final two lines are SCS-002-specific additions to the standard oath. They encode the constitutional constraints from Section 8.2. They are part of the EAS attestation and cannot be removed without filing a charter amendment.

---

## 11. Integration Record

| Integration Point | Status | Detail |
|------------------|--------|--------|
| ORACLE-6 feed → `scs001-trend` (voxight-feed.ts) | ✅ Live | Queries `signals` table, converts to Oracle6Signal[], merges with Google Trends |
| `scripts/lib/voxight-client.ts` → Intelligence Agent | ✅ Created 2026-03-28 | Polls signals table, writes to `workspace/intelligence/oracle-6-voxight/signals/` |
| `scripts/oracle6-consumer.ts` | ✅ Created 2026-03-28 | Scheduled runner — fetches signals, flags purpose candidates, writes weekly report |
| SCS charter domain auto-monitoring (Block G) | ⏳ Pending | When new SCS charter filed, domain scope auto-added to Voxight stream filter rules |
| Purpose Signal → AMD-05 filing | ⏳ Pending | 2-cycle persistence check not yet automated — Godman manual review |
| EAS attestation on Base | ⏳ Pending | Genesis Ceremony Month 10 |

---

## 12. On-Chain Attestation

| Field | Value |
|-------|-------|
| EAS Schema | taskCompletion (0x79d2573e...) |
| Attestation Status | PENDING — Genesis Ceremony Month 10 |
| Attestation UID | [Fill after ratification] |
| Ratified By | Tarek Mnif (Godman) — 2026-03-28 |
| Charter SHA-256 | [Computed at Genesis] |

---

*Filed with: Constitution Agent — 2026-03-28*
*Ratification: Godman verbal ratification 2026-03-28. On-chain EAS attestation deferred to Genesis Ceremony Month 10.*
