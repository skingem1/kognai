# Kognai

**Sovereign AI Runtime** — a multi-agent swarm platform powering 5 deployment products, built and operated by AI agents.

[![Sprints](https://img.shields.io/badge/sprints-486+-orange)]()
[![Agents](https://img.shields.io/badge/agents-29-blue)]()
[![Phase](https://img.shields.io/badge/phase-1_active-green)]()
[![Architecture](https://img.shields.io/badge/layers-9-purple)]()

---

## What is Kognai?

Kognai is a sovereign AI runtime that powers multiple products via a shared agent swarm. One codebase, one model router, one orchestrator -- five products serving different markets.

### 5 Deployment Products

| Product | Phase | Description |
|---------|-------|-------------|
| **TikTok Content Agent (SCS-001)** | Phase 1 | Automated short-form video pipeline -- trend discovery, script generation, video editing, multi-platform posting |
| **Achiri** | Phase 2A | Culturally adaptive AI companion for Tunisia -- Darija/French code-switching, local personality |
| **Founder Intelligence Agent** | Phase 2+ | Internal tool for strategic analysis (potential SaaS) |
| **Dynamic Research Instrument** | Phase 3 | Academic research tool with x402 micropayments |
| **x402 Payment Rail** | Phase 4 | Agent-to-agent transaction fees via USDC on Base |

---

## Architecture

### 9-Layer Stack

```
1. Runtime       -- Model routing (Nano -> Local -> Power -> Cloud -> Apex)
2. Configuration -- Agent configs (29 agents, OpenClaw v2026.3.7)
3. Adaptation    -- Cultural context, language, personality
4. Health        -- System monitoring, kill switches, circuit breakers
5. Compression   -- Token optimization, context management
6. Hosting       -- Hetzner VPS, Mac Mini M4 vault, PM2
7. Plumber       -- Pipeline orchestration, data flow
8. Ecosystem     -- Skills registry (31 skills, T1-T4), integrations
9. Financial     -- Stripe subscriptions, x402 micropayments, USDC wallets
```

### 5-Tier Model Router

```
T0 Nano   -- qwen3:0.6b  (local, $0.00)  -- simple tasks
T1 Local  -- qwen3:4b    (local, $0.00)  -- conversation, free tier
T2 Power  -- qwen3:14b   (local, $0.00)  -- code generation, planning
T3 Cloud  -- claude-haiku (API, ~$0.001) -- quality review, validation
T4 Apex   -- claude-sonnet (API, ~$0.01) -- premium tier, complex tasks
```

### Agent Swarm

The swarm is orchestrated by `scripts/orchestrate-agents-v2.ts` with dual supervisor review:

```
Owner (Telegram) -> Sprint JSON -> Orchestrator
                                    |
                    +-------+-------+-------+
                    |       |       |       |
                  Harvey  Messi  Sherlock  Guardiola
                  (CEO)  (Coder) (Supervisor) (Optimizer)
```

- **29 active agents** across SCS-001 pipeline, Achiri, infrastructure
- **Dual supervisor consensus** -- both must approve, CEO arbitrates conflicts
- **Sprint-based execution** -- JSON sprint files define tasks, agents execute

---

## SCS-001 Pipeline (TikTok Content Agent)

Full automated video production pipeline:

```
Trend Agent -> Discovery -> ClipDetection -> [Dedup] -> Insight -> Script ->
Editing -> Caption -> QC -> Publishing -> Analytics -> Flywheel -> FailureLibrary
```

- **12 stages**, each backed by a dedicated agent
- **3 video templates**: standard, reaction, listicle
- **3 duration modes**: 15s (simple), 30s (standard), 60s (deep)
- **Multi-platform**: TikTok, YouTube Shorts, Instagram Reels, X/Twitter
- **62+ Telegram commands** for operator control

---

## Achiri (AI Companion for Tunisia)

Culturally adaptive AI companion with:

- **Tunisian Darija** as primary language with natural French code-switching
- **4-category safety filter** (pattern-based, zero LLM cost)
- **Per-user memory** with daily limits (free: 50 msg/day)
- **Tiered models**: qwen3:4b (free), claude-haiku (basic), claude-sonnet (premium)
- **Voice validation**: 10/10 PASS on cultural authenticity

---

## Infrastructure

| Component | Details |
|-----------|---------|
| **Compute** | Hetzner VPS (cloud) + Mac Mini M4 (local vault) |
| **Models** | qwen3:0.6b/4b/14b, deepseek-r1:14b (local via Ollama) |
| **Database** | Supabase (PostgreSQL + event bus) |
| **Networking** | Tailscale VPN bridge (vault <-> cloud) |
| **Process Mgmt** | PM2 with auto-restart and cron scheduling |
| **Dashboard** | FastAPI + static HTML at localhost:11436 |
| **Payments** | Stripe (subscriptions) + x402 (micropayments) |

---

## Project Structure

```
kognai/
+-- runtime/router.py            -- 5-tier model router
+-- scripts/
|   +-- orchestrate-agents-v2.ts  -- main orchestrator (dual supervisor)
|   +-- telegram-bot.ts           -- 62+ command thin router
|   +-- telegram-commands/        -- modular command handlers
|   +-- scs001/                   -- pipeline scripts + validators
|   +-- achiri/                   -- Achiri test + deployment scripts
+-- agents/
|   +-- scs001-*/                 -- 11 pipeline agents
|   +-- achiri/                   -- Achiri conversation handler + safety
+-- kognai-agents/                -- 29 agent configs (agent.yaml + prompt.md)
+-- workspace/
|   +-- sprints/                  -- sprint JSON files (history)
|   +-- scs001/                   -- pipeline state + outputs
|   +-- achiri/                   -- Achiri memory + session logs
|   +-- billing/                  -- usage metering + funnel data
+-- dashboard/                    -- FastAPI dashboard + parsers
+-- skills/                       -- OpenClaw skills registry (31 skills)
+-- backend/src/                  -- Express + Prisma + Supabase
+-- x402-base/                    -- payment protocol
+-- sdk/typescript/               -- TypeScript SDK (50 modules)
```

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/skingem1/kognai.git
cd kognai
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Check environment
npx tsx scripts/check-env.ts

# Start Telegram bot
npx tsx scripts/telegram-bot.ts

# Start dashboard
cd dashboard && python3 -m uvicorn server:app --host 127.0.0.1 --port 11436
```

---

## License

MIT -- see [LICENSE](LICENSE)

---

*Built by a 29-agent AI swarm. 486+ sprints shipped. Sovereign by design.*
