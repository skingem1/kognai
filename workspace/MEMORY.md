# MEMORY.md — Curated Long-Term Memory

> ⚠️ **TRANSITIONING TO AMF v1.0 — See `~/Documents/Kognai/Master Documents/amf_protocol_v1.md`**
> This file is now a **read-only human-readable index**. All new persistent agent memory writes go to AMF directly.
> Full deprecation after ARCH-001 ships (~3–4 weeks). Genesis Records #0 (SOUL) + #1 (Constitution) already live.
> AMF root: `~/kognai/workspace/memory/amf-records/` · Index: `~/kognai/workspace/memory/amf-index.json`
> Ratified: 2026-03-29 · Godman Protocol #4

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

**Last git commit:** b58ae19 (Sprint 097: Phase 1 activation config + readiness validator)
**Last sprint:** 097 — Phase 1 Activation: SCS_MODE=live config + readiness validator
**Pipeline status:** SCS-001 Blocks A–G complete + hardening (Sprints 076–094). Phase 0 COMPLETE. Phase 1 CONFIGURED (pending TIKTOK_ACCESS_TOKEN).

**Phase Gates:**
- Phase 0→Phase 1: PASS (Mar 16) — gate report at workspace/gates/phase0-phase1-gate.json.
- SCS-001 Block A: CONDITIONAL PASS
- Phase 1 Activation Readiness: workspace/gates/phase1-activation-readiness.json (3/4 pass — blocked on TIKTOK_ACCESS_TOKEN)

**Phase 1 Live Posting — Requires Human Action:**
1. Set TIKTOK_ACCESS_TOKEN in .env (obtain from TikTok Developer Portal — video.upload scope)
2. Run: pm2 start ecosystem.config.js --only scs001-live

**ecosystem.config.js — SCS-001 Processes:**
- scs001-pipeline: mock mode (dry-run, always safe, 4x daily cron)
- scs001-live: live mode (Phase 1), requires TIKTOK_ACCESS_TOKEN in .env

**Deferred (Sprint 098+):**
- T2 Skills Installation (6 content/monetization skills) — was Mar 14
- OpenClaw v2026.3.7 gateway.auth.mode setup (T1 skills, 13 skills) — was Mar 10

**Critical Gaps:**
- TIKTOK_ACCESS_TOKEN not yet set in .env — live posting blocked until set (human action)

**Swarm pattern note (FP-007):** qwen3:14b cannot reliably rewrite files using real API interfaces it hasn't seen, and fails destructively on files >200 lines. Skip swarm and write directly for: (a) interface-heavy TS rewrites, (b) files >200 lines like ecosystem.config.js.

**Next Sprint:** 098 — T2 Skills Installation + OpenClaw v2026.3.7 setup (OR: set TIKTOK_ACCESS_TOKEN + verify first live post if token is available)

*This file is updated by Sherlock on the weekly compression cycle. Raw daily logs are in memory/YYYY-MM-DD.md. This file contains only what has proven durable.*
