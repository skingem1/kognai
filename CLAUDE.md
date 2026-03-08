# KOGNAI — Claude Code Session Context

## BEFORE YOU DO ANYTHING

1. Read `docs/daily-brief.md` — today's tasks, active sprint, schedule
2. Read `docs/strategic-context.md` — phase sequence, cost guardrails, principles
3. Read `docs/gate-tracker.md` — upcoming decision gates
4. Read `docs/shared-infra.md` — shared infrastructure with Invoica (Hetzner, Supabase, PM2, models)

These files are auto-generated daily by `scripts/generate-daily-brief.py`.
If `daily-brief.md` is stale (wrong date), regenerate it:
```bash
python3 scripts/generate-daily-brief.py
```

## PROJECT OVERVIEW

Kognai is a sovereign AI runtime that powers multiple products via a shared agent swarm.

**5 Deployment Products:**
- TikTok Content Agent (Phase 1 — cashflow engine, €9/mo subscription)
- Achiri (Phase 2A — culturally adaptive AI companion for Tunisia, free + TND tiers)
- Founder Intelligence Agent (Phase 2+ — internal tool → potential SaaS)
- Dynamic Research Instrument (Phase 3 — academic + x402 micropayments)
- x402 Payment Rail (Phase 4 — agent-to-agent transaction fees)

**9-Layer Architecture:**
1. Runtime → 2. Configuration → 3. Adaptation → 4. Health → 5. Compression → 6. Hosting → 7. Plumber → 8. Ecosystem → 9. Financial Autonomy

**Key Infrastructure:**
- 5-tier model router: `runtime/router.py` (Nano → Local → Power → Cloud → Apex)
- ClawRouter + CEO Wallet: x402 pay-per-call model routing (Phase 3+)
- Orchestrator: `scripts/orchestrate-agents-v2.ts` (dual supervisor review)
- 28 agent configs: `kognai-agents/` with OpenClaw v2026.3.7
- Named swarm agents: `workspace/agents/` (messi, sherlock, guardiola, macgyver, satoshi, elon)
- Supabase backend with event bus (kognai_events table)
- Mac Mini M4 vault (local models: qwen3:0.6b/4b/14b, deepseek-r1:14b)
- Tailscale VPN bridge to cloud
- OpenClaw Skills Registry: 31 skills across T1-T4 tiers

**Sprint numbering:** Invoica legacy 001-062e, Kognai starts at 063+

## KEY RULES

1. **Read the daily brief first** — it tells you what's happening today
2. **Never skip a gate** — check `docs/gate-tracker.md` before advancing phases
3. **Cost-conscious** — prefer local models ($0.00). Cloud only on genuine escalation
4. **Session logs** — write what happened at end of every session to `workspace/agents/memory/`
5. **Don't break TikTok** — it's the cashflow engine, stability > features
6. **Voice before memory** — for Achiri, validate personality before adding memory subsystem
7. **Manual posting is default** — TikTok API is a known SPOF, always have manual fallback
8. **Summer Yu rule** — safety constraints must be in bootstrap files (AGENTS.md, SOUL.md, policy/*.txt), NEVER chat-only. They must survive context compaction.
9. **Kill switches** — respect non-negotiable triggers: account banned, <500 views/30 posts, retention <20% after 2 fixes, approval <80%, memory >22GB, >6h/day oversight
10. **Shared changes → update shared-infra.md** — infra changes OR reusable code written/modified → update so Invoica session stays in sync

## RELATIONSHIP TO INVOICA

Kognai and Invoica share infrastructure but are **separate products**:
- **Kognai** = sovereign AI runtime platform (5 products, Phase 0-4)
- **Invoica** = SaaS invoicing product (live beta, Conway governance)

**What's shared:** Hetzner VPS, Supabase, PM2, x402 protocol, model routing, Mac Mini vault, GitHub (skingem1). Details in `docs/shared-infra.md`.

**What's NOT shared:**
- Kognai phases/gates, TikTok agent, Achiri, OpenClaw skills — Kognai-only
- Invoica codebase, SOUL.md, constitution, Conway governance — Invoica-only

**Rule:** When making infrastructure changes (server, DB, PM2, models), update `docs/shared-infra.md` so the Invoica session picks it up too. When making Kognai-specific changes, update only Kognai docs.

**Invoica project path:** `~/Documents/Invoica/`
**Invoica agent in swarm:** `kognai-agents/invoica-x-admin/`

## MASTER DOCUMENTS (reference, don't modify)

- Full development plan: `~/Documents/Kognai/KOGNAI_FULL_DEVELOPMENT_PLAN.md` (v3)
- Daily timeline: `~/Documents/Kognai/KOGNAI_DAILY_TIMELINE.md`
- Master architecture: `~/Documents/Kognai/Master Documents/kognai master architecture v14.docx`
- Achiri plan: `~/Documents/Kognai/Master Documents/kognai achiri master plan v7.docx`

## FILE STRUCTURE

```
~/kognai/
├── CLAUDE.md                    ← you are here
├── runtime/router.py            ← 5-tier model router
├── scripts/
│   ├── orchestrate-agents-v2.ts ← main orchestrator
│   └── generate-daily-brief.py  ← daily brief generator
├── docs/
│   ├── daily-brief.md           ← TODAY's tasks (read first!)
│   ├── strategic-context.md     ← phase/cost overview
│   ├── gate-tracker.md          ← decision gates
│   └── shared-infra.md          ← shared infra with Invoica
├── kognai-agents/               ← 26 agent configs (agent.yaml + prompt.md)
├── workspace/
│   ├── agents/                  ← named swarm (messi, sherlock, etc.)
│   └── sprints/                 ← sprint history (052-062e)
├── backend/src/                 ← Express + Prisma + Supabase
├── x402-base/                   ← payment protocol
├── sdk/typescript/              ← TypeScript SDK (50 modules)
└── ecosystem.config.js          ← PM2 process configs
```
