# SHARED INFRASTRUCTURE CONTEXT
*Applies to: Invoica + Kognai*
*Updated: 2026-03-24*

This file is the single source of truth for infrastructure shared between the Invoica and Kognai projects. Both projects' CLAUDE.md files reference this doc. When shared infra changes, update HERE — both sessions will pick it up.

## WHAT IS SHARED vs PROJECT-SPECIFIC

| Layer | Shared (both projects) | Invoica-only | Kognai-only |
|-------|----------------------|--------------|-------------|
| Server | Hetzner VPS (65.108.90.178) | Invoica app deploy path | — |
| Compute | Mac Mini M4 vault (Ollama) | — | kognai-router (port 11435) |
| Network | Tailscale VPN (vault bridge) | — | — |
| Database | Supabase (project: shared) | Invoica tables, Prisma schema | kognai_events table |
| Payment | x402 protocol, seller wallet | Invoice/payment routes | ClawRouter (Phase 3+) |
| Process | PM2 (ecosystem.config.js) | backend, git-autodeploy | sprint-runner, kognai-router |
| Models | 5-tier router, local Qwen/DeepSeek | MiniMax for dev agents | OpenClaw skills |
| Source | GitHub (skingem1) | skingem1/Invoica repo | kognai/ monorepo |
| Memory | Summer Yu rule (bootstrap files) | SOUL.md, constitution.md | AGENTS.md, policy/*.txt |
| Code | x402-base, SDK, backend patterns | Invoica-specific routes/UI | Kognai-specific agents/runtime |
| Identity | @invoica_ai X account | Content, posting, engagement | — |

## HETZNER VPS

- **IP:** 65.108.90.178
- **Users:** `root`, `invoica`
- **SSH key:** `~/.ssh/id_ed25519` (primary), `~/.ssh/invoica_hetzner` (secondary)
- **Invoica app path:** `/home/invoica/apps/Invoica`
- **Memory persistence:** `/home/invoica/memory` (survives git operations)
- **Logs:** `/home/invoica/apps/Invoica/logs/`
- **Deploy:** git-autodeploy process (every 5 min via PM2)

## MAC MINI M4 VAULT

- **Role:** Local inference, zero-cost compute
- **Ollama:** port 11434 (models: qwen3:0.6b, qwen3:4b, qwen3:14b, deepseek-r1:14b)
- **Kognai Router:** port 11435 (FastAPI, 5-tier routing)
- **Dashboard:** port 11436 (planned — vault monitoring)
- **Tailscale:** bridges vault to Hetzner VPS (`http://vault:11434`)
- **Memory limit:** kill switch at 22GB

## SUPABASE

- **Shared project** — both Invoica and Kognai use the same Supabase instance
- **Invoica tables:** invoices, payments, customers, webhooks, etc.
- **Kognai tables:** kognai_events (event bus), agent state
- **Auth:** Supabase Auth for Invoica frontend; internal-only for Kognai agents
- **Migrations:** Invoica via Prisma; Kognai via raw SQL files

## PM2 PROCESS MANAGEMENT

**Config:** `~/kognai/ecosystem.config.js` (manages ALL processes for both projects)

| Process | Project | Schedule | Purpose |
|---------|---------|----------|---------|
| backend | Invoica | always-on | Main API server |
| openclaw-gateway | Shared | always-on | OpenClaw v2026.3.7 |
| cto-email-support | Invoica | every 5 min | Support automation |
| cto-daily-scan | Shared | daily 09:00 | Tech watch |
| heartbeat | Shared | hourly | Health monitor |
| x-admin-post | Invoica | every 30 min | X posting |
| cmo-daily-watch | Shared | daily 08:00 | Market watch |
| cmo-weekly-content-plan | Invoica | Sunday 06:00 | Content generation |
| tax-watchdog-us | Invoica | Monday 07:00 | US tax compliance |
| tax-watchdog-eu-japan | Invoica | Monday 08:00 | EU/JP tax compliance |
| ceo-review | Shared | every 2 hours | CEO decision pipeline |
| cfo-weekly | Invoica | Monday 07:00 | Financial reporting |
| ceo-ai-bot | Shared | always-on | Telegram bot (shared ops) |
| git-autodeploy | Invoica | every 5 min | Auto-deployment |
| bizdev-weekly | Shared | Sunday 06:00 | Business development |
| sprint-runner | Kognai | every 30 min | Orchestrator executor |
| memory-agent | Shared | hourly | Persistent memory |
| mission-control | Invoica | always-on (port 3010) | Ops dashboard |
| docs-generator | Invoica | daily 04:00 | Changelog + API ref |
| kognai-router | Kognai | always-on (port 11435) | FastAPI model router |
| pending-local-drain | Kognai | every 5 min | Queue drainage |
| telegram-bot | Kognai | always-on | Operator Telegram bot (/status, /blockers, /godman, etc.) |
| kognai-stripe-webhook | Kognai | always-on | Stripe webhook handler |
| kognai-checkout | Kognai | always-on | Checkout server (TikTok Agent subscriptions) |
| kognai-smoke-test | Kognai | every 6 hours | Pipeline smoke tests |
| kognai-pipeline-auto | Kognai | 06:00/10:00/14:00/18:00 | SCS-001 TikTok pipeline automation |
| kognai-pipeline-watchdog | Kognai | every 30 min | Pipeline health watchdog |
| kognai-daily-digest | Kognai | daily 07:00 | Daily digest generation |
| kognai-weekly-report | Kognai | Sunday 20:00 | Weekly performance report |
| kognai-gate-regen | Kognai | daily 06:55 | Phase 1.5 gate JSON regeneration |
| achiri-daily-engage | Kognai | daily 08:00 | Achiri user engagement |
| achiri-reengage | Kognai | daily 15:00 | Achiri re-engagement nudges |
| achiri-alpha-weekly | Kognai | Monday 09:00 | Achiri alpha test report |
| kognai-pipeline-cleanup | Kognai | Sunday 03:00 | Pipeline artifact cleanup |
| kognai-geo-monitor | Kognai | Monday 08:00 | Geo audience monitoring |
| kognai-daily-report | Kognai | daily 23:55 | Daily performance report |
| kognai-constitution-agent | Kognai | Sunday 18:00 | Constitutional safety review |
| scs001-remind-noon | Kognai | daily 12:00 | TikTok posting reminder (noon) |
| scs001-remind-evening | Kognai | daily 19:00 | TikTok posting reminder (evening) |
| scs001-youtube-upload | Kognai | daily 07:30 | YouTube Shorts cross-platform publish |
| scs001-healer | Kognai | every 5 min | PM2 auto-healer for SCS-001 |
| scs001-queue-archiver | Kognai | daily 00:05 | Archive stale pipeline queue items |
| scs001-validator | Kognai | daily 06:00 | Validate pipeline output quality |

## X402 PAYMENT PROTOCOL

- **Seller wallet:** `0x3e127c918C83714616CF2416f8A620F1340C19f1` (receives USDC)
- **Invoica role:** Invoice middleware, payment routes, tax engine
- **Kognai role:** ClawRouter pay-per-call inference (Phase 3+), CEO Wallet
- **Protocol base:** `~/kognai/x402-base/`

## MODEL ROUTING (5-TIER)

| Tier | Models | Cost | Used By |
|------|--------|------|---------|
| NANO | qwen3:0.6b | $0.00 | Both — trivial tasks |
| LOCAL | qwen3:4b, qwen3:14b | $0.00 | Both — standard local |
| POWER | deepseek-r1:14b | $0.00 | Both — reasoning |
| CLOUD | Claude Sonnet ($0.003/1k) | $$$ | Both — complex tasks |
| APEX | Claude Opus ($0.015/1k) | $$$$ | Kognai — critical only |

**Budget guard:** any task estimated >$0.10 falls back to POWER tier
**Daily target:** <$5/day cloud spend

## AGENT MEMORY RULES (APPLY TO BOTH)

1. **Summer Yu rule:** Safety constraints must be in bootstrap files, NEVER chat-only. Must survive context compaction.
2. **Compaction config:** `reserve_tokens_floor=40000`, `memory_flush=true`, `soft_threshold=4000`
3. **Memory layers:**
   - Bootstrap files (survives compaction) — CLAUDE.md, AGENTS.md, SOUL.md, policy/
   - Session transcript (lost on compaction)
   - LLM context window (container)
   - Retrieval index (survives if written to disk)
4. **Session logs:** Always write end-of-session summary

## GITHUB

- **User:** skingem1
- **Invoica repo:** skingem1/Invoica (branch: main)
- **Kognai repo:** local monorepo at `~/kognai/` (not yet on GitHub)

## SHARED CODE REGISTRY

Code that exists in both projects or was built in one and is reusable by the other. When you write or modify code that fits a shared module below, update the canonical path here and note any project-specific forks.

| Module | Canonical Path | Used By | Notes |
|--------|---------------|---------|-------|
| x402 protocol | `~/kognai/x402-base/` | Both | Invoica also has `~/Documents/Invoica/x402-base/`, `x402-evm/`, `x402-test/` |
| Backend (Express+Prisma) | `~/Documents/Invoica/backend/` | Both | Kognai fork at `~/kognai/backend/src/` — diverging (event bus) |
| TypeScript SDK | `~/Documents/Invoica/sdk/` | Both | Kognai fork at `~/kognai/sdk/typescript/` (50 modules) |
| PM2 ecosystem | `~/kognai/ecosystem.config.js` | Both | Single file manages all processes |
| Supabase migrations | `~/Documents/Invoica/supabase/` | Invoica | Kognai uses raw SQL in `backend/` |
| Godman Protocols | `~/kognai/workspace/godman-protocols/` | Kognai | 7 protocols + SDK at v0.2.0 (PACT, LAX, SCORE, SIGNAL, SOUL, AMF, DRS). npm publish planned April 14. |

**Rules for shared code:**
1. **New shared utility?** Add it here with the canonical path
2. **Forked and diverging?** Note both paths and which is canonical
3. **Invoica-only code?** Don't list here (it's not shared)
4. **Kognai-only code?** Don't list here (it's not shared)
5. **When modifying shared code:** check if the change applies to both projects. If yes, update both. If no, note the divergence here.

## WHEN TO UPDATE THIS FILE

Update `shared-infra.md` when any of these change:
- Hetzner server config (IP, users, paths)
- Supabase project or schema changes affecting both projects
- PM2 process additions/removals
- Model availability or routing changes
- Tailscale/VPN configuration
- x402 wallet or protocol changes
- Cost guardrails or budget limits
- SSH keys or authentication methods
- GitHub org/repo changes
- **Shared code: new reusable module written, existing module forked, or shared module updated**

After updating, verify both CLAUDE.md files still reference this correctly.
