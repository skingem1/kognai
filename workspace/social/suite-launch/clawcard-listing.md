# Godman Protocols Suite — ClaWHub Marketplace Listing

**Platform:** ClaWHub.com
**Launch date:** April 14, 2026
**Suite install:** `npx skills add https://github.com/godman-protocols/sdk`

---

## Listing content

**Title:** Godman Protocols — 7 Open Protocols for the Agent Layer

**Category:** Infrastructure / Multi-Agent / Protocol Suite

**Tagline:** Trust, routing, reputation, messaging, scheduling, governance and agent discovery — as composable open protocols.

**Description:**

Multi-agent AI is broken at the seams. Agents trust each other blindly. They pick the wrong runtime. They charge erratically. They speak incompatible dialects.

The Godman Protocols fix that. Seven open protocols that give autonomous agent systems a production-grade infrastructure layer — with zero external dependencies and Apache 2.0 licensing.

---

## The 7 Protocols

**PACT — Protocol for Agent Coordination and Trust**
Mandate signing, scope verification, and revocation so agents only do what they're explicitly authorised to do.
`npm install @godman-protocols/pact`

**LAX — Latency-Aware Execution**
Route tasks to the right runtime based on latency budgets and real-time probes. No more "use Opus for everything."
`npm install @godman-protocols/lax`

**SCORE — Scoring & Reputation**
Evaluate agent output quality. Build verifiable reputation across tasks. Know which agents to trust before you delegate.
`npm install @godman-protocols/score`

**SIGNAL — Event Bus & Observation**
Typed publish/subscribe event bus for agent observability. Every decision, delegation, and state change — auditable.
`npm install @godman-protocols/signal`

**SOUL — Constitutional Engine**
Policy-as-code governance for autonomous agents. Write constitutional rules once; agents enforce them at runtime.
`npm install @godman-protocols/soul`

**AMF — Agent Message Format**
A canonical envelope for agent-to-agent messages: typed payloads, routing headers, trace IDs, payment metadata.
`npm install @godman-protocols/amf`

**DRS — Dynamic Resource Scheduling**
Allocate compute, memory, and budget across agents. Priority queues, preemption, and hard resource limits.
`npm install @godman-protocols/drs`

---

## Install the full suite

```bash
npm install @godman-protocols/sdk
```

Or install individually — each protocol is standalone with zero cross-dependencies.

---

## Works with

- **Kognai OpenClaw** — all 7 protocols ship `.openclaw` configs for skill registry integration
- **Claude Code / Cursor / Codex** — `.claude-plugin`, `.cursor-plugin`, `.codex` configs included
- **Invoica x402** — PACT mandate `maxPaymentUsdc` maps directly to x402 payment caps; AMF carries x402 payment metadata
- **Clawcard ERC-8004** — agents pass PACT trust verification on install; SOUL constitution can reference on-chain identity
- Any multi-agent system (LLM-agnostic, runtime-agnostic)

---

## Technical profile

- **Language:** TypeScript (fully typed)
- **Runtime:** Node 20+ / Deno 1.40+ / Edge compatible
- **External deps:** Zero
- **Test coverage:** 100% unit tests across all 7 protocols
- **License:** Apache 2.0
- **Version:** v0.2.0

---

## Links

- GitHub org: github.com/godman-protocols
- SDK: github.com/godman-protocols/sdk
- Docs: godman-protocols.dev
- npm: npmjs.com/org/godman-protocols
- License: Apache 2.0

**Tags:** trust, coordination, reputation, latency-routing, event-bus, governance, message-format, resource-scheduling, multi-agent, autonomous-ai, TypeScript, x402, ERC-8004

---

## ClaWHub submission checklist

- [ ] GitHub org public (April 14)
- [x] All 7 protocol READMEs complete
- [x] All 7 protocol API docs complete
- [x] All 7 protocols have `.openclaw` configs
- [x] All 7 protocols have `.claude-plugin` configs
- [x] All 7 protocols have `.cursor-plugin` configs
- [x] All 7 protocols have `.codex` configs
- [x] X launch megathread ready (workspace/social/suite-launch/x-megathread.md)
- [x] Individual protocol listings ready (workspace/social/*/clawcard-listing.md)
- [ ] ClaWHub listing submitted (April 14 — human action)
- [ ] Suite listing link added to SDK README (after submission)
