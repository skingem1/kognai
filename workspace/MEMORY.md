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

**Last git commit:** 95e7f5c (Sprint 096: Phase 0→Phase 1 gate PASS)
**Last sprint:** 096 — Phase 0→Phase 1 Gate PASS
**Pipeline status:** SCS-001 Blocks A–G complete + hardening (Sprints 076–094). Phase 0 COMPLETE.

**Phase Gates:**
- Phase 0→Phase 1: PASS (Mar 16) — gate report at workspace/gates/phase0-phase1-gate.json. All 3 criteria passed.
- SCS-001 Block A: CONDITIONAL PASS

**Phase 1 is now UNLOCKED.** Next actions:
1. Set SCS_MODE=live in ecosystem.config.js (TikTok live posting)
2. T2 Skills Installation (was target Mar 14 — overdue)
3. OpenClaw v2026.3.7 gateway.auth.mode setup (T1 skills, 13 skills)

**Critical Gaps:**
- None blocking Phase 1 start

**Swarm pattern note (FP-007):** qwen3:14b cannot reliably rewrite files using real API interfaces it hasn't seen. When task requires calling specific class methods (DedupLedger.recordPublished, filterNewClips), the swarm consistently hallucinates non-existent methods (insertClip, removeClip). For interface-heavy rewrites, skip the swarm and write directly.

**Next Sprint:** 097 — Phase 1 activation: SCS_MODE=live + ecosystem.config.js update

*This file is updated by Sherlock on the weekly compression cycle. Raw daily logs are in memory/YYYY-MM-DD.md. This file contains only what has proven durable.*
