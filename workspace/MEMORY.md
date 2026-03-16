# MEMORY.md — Curated Long-Term Memory
**Distilled from daily logs by Sherlock. Not raw logs. Updated on compression cycle.**
**Load in direct sessions only — not in shared group contexts.**

---

## Founding Context — 2026-03-05

Kognai starts from Week 52 of Invoica — not from zero. The orchestration engine, sprint JSON format, dual-supervisor review pattern, and Supabase integration are all inherited. The Invoica codebase (74 sprints, 27 agents, 96.4% approval rate) is the starting point.

What is NOT inherited: Invoica's product (invoicing, payments, tax). Kognai is infrastructure. The costume changes. The runtime does not.

**Sovereign vault is live:**
- Mac Mini M4 24GB — operational
- Models: qwen3:0.6b, qwen3:4b, qwen3:14b, qwen3:32b (manual), deepseek-r1:14b
- Router: ~/kognai/runtime/router.py — tested and live
- GitHub: github.com/skingem1/kognai — first commit pushed

**Agent swarm — named agents:**
- Messi (Orchestrator) — Claude Sonnet, cloud
- Sherlock (Auditor) — qwen3:14b, local
- MacGyver (Plumber) — qwen3:14b, local
- Satoshi (CFO) — deepseek-r1:14b, local
- Elon (Research) — deepseek-r1:14b, local
- Guardiola (Supervisor) — qwen3:14b, local

---

## Failure Patterns Inherited From Invoica (Layer 4 Seed)

These are real failure patterns from production. Every new agent is briefed from this list.

**FP-001 — Backend port collision**
Situation: PM2 process restart loop when port 3001 already bound. 491+ restarts observed.
Pattern: Do not hardcode ports. Use environment variables. Add port-in-use check on startup.
Avoid: Any service that assumes its port is free without checking.

**FP-002 — Heartbeat staleness**
Situation: Heartbeat monitoring not updated for 11 days. Swarm health appeared nominal while real issues accumulated.
Pattern: Health checks must be automated and scheduled. Manual heartbeat updates decay immediately.
Avoid: Any health signal that requires a human or agent to manually update it.

**FP-003 — Agent wallet depletion**
Situation: 8 agents at 0 USDC despite x402 spending being active. Swarm continued operating without flagging the financial gap.
Pattern: Financial monitoring must run continuously from day one, not be added later.
Avoid: Assuming financial state is healthy without explicit Satoshi verification.

**FP-004 — Think mode latency on local models**
Situation: Qwen3 think mode added 60-120s per call on local tiers. Unacceptable for agent loops.
Pattern: Think mode is disabled for all local tiers. Enabled for CLOUD and APEX only.
Avoid: Enabling think mode on any Ollama model in the hot path.

**FP-005 — 300-600s timeout on 32B model**
Situation: qwen3:32b consistently timed out even at 600s timeout. Blocked sprint execution.
Pattern: 32B reserved for manual use only. qwen3:14b is the POWER tier ceiling for agent loops.
Avoid: Routing any automated task to qwen3:32b.

**FP-006 — Supervisor conflict without escalation**
Situation: Claude and Codex supervisors gave conflicting review verdicts on the same code. Resolution required CEO intervention, adding ~2 sprint cycles of delay.
Pattern: When two reviewers conflict, escalation to orchestrator is immediate. Do not retry with same reviewers.
Avoid: Looping on conflicting reviews without escalating.

---

## Decisions Made — Never Revisit Without New Evidence

- qwen3:14b is the POWER tier. qwen3:32b is manual only.
- Think mode: disabled for all local tiers.
- Tailscale is the vault-cloud tunnel. No alternatives.
- One file per API call. Max 200 lines. Non-negotiable.
- Supabase Realtime is the event bus. Built alongside Phase 1.
- TASK_TARGET field is the single most important extension to the sprint JSON.

---

---

## Kognai State — 2026-03-16

**Last git commit:** f153268 (feat(coder): 095-02 - gate-tracker.md update)
**Last sprint:** 095 — Phase 0→Phase 1 Gate Validator
**Pipeline status:** SCS-001 Blocks A–G complete + hardening (Sprints 076–094)

**Phase Gates:**
- Phase 0→Phase 1: CONDITIONAL PASS (Mar 16) — gate-tracker.md updated. validate-phase0-gate.ts has broken imports (needs fix Sprint 096).
- SCS-001 Block A: CONDITIONAL PASS

**Critical Gaps (must fix):**
- validate-phase0-gate.ts: wrong import paths — imports `Router` from Python file, `DedupLedger` wrong path. Needs rewrite with correct paths:
  - `SCS001Orchestrator` from `../../agents/scs001-orchestrator/index`
  - `DedupLedger` from `../../agents/scs001-orchestrator/dedup-ledger`

**Next Sprint:** 096 — Fix gate validator + begin Phase 1 prep (T2 Skills / TikTok live mode)

*This file is updated by Sherlock on the weekly compression cycle. Raw daily logs are in memory/YYYY-MM-DD.md. This file contains only what has proven durable.*
