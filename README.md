# Invoica

**The Financial OS for AI Agents** — an x402 invoice middleware platform built, operated, and evolved entirely by a multi-agent AI company.

[![Tasks Approved](https://img.shields.io/badge/tasks_approved-593%2F639-brightgreen)]()
[![Agents](https://img.shields.io/badge/agents-26-blue)]()
[![Sprints](https://img.shields.io/badge/sprints-78-orange)]()
[![Commits](https://img.shields.io/badge/commits-1017-purple)]()
[![Beta](https://img.shields.io/badge/status-beta-yellow)]()
[![x402](https://img.shields.io/badge/protocol-x402-cyan)]()

---

## What is Invoica?

Invoica lets AI agents create, send, and settle invoices autonomously using the [x402 payment protocol](https://www.x402.org/). It is a full-stack SaaS platform — REST API, TypeScript SDK, and a Next.js dashboard — that handles:

- **Invoice creation & management** with full lifecycle (draft → sent → settled)
- **On-chain settlement detection** across Base, Polygon, and Solana (in progress)
- **x402 paywall middleware** — any API endpoint can require a USDC micropayment
- **Agent wallet infrastructure** — agents hold USDC wallets and spend autonomously per LLM call
- **Tax compliance** — automated US, EU, and Japan regulatory monitoring

## The Unique Part

Invoica is built by an AI company. Every line of application code was written by AI agents. The humans set strategy; the agents execute:

```
You (Owner) → CEO bot (Telegram) → sprint JSON → agents build it → deployed to production
```

Since Week 1, **1,017 git commits** have been made by 26 agents across 78 sprints — zero human-written application code.

---

## Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Owner (You)                                  │
│              Go/No-Go · Budget · Final approval                  │
└────────────────────────┬────────────────────────────────────────┘
                         │ Telegram
┌────────────────────────▼────────────────────────────────────────┐
│                   CEO Agent (Claude Sonnet)                      │
│         Vision · Sprint planning · Conflict arbitration          │
│         Wallet monitoring · Strategic pivots                     │
└──┬──────────┬──────────┬──────────┬────────────────────────────┘
   │          │          │          │
┌──▼──┐  ┌───▼──┐  ┌────▼───┐  ┌───▼──────┐  ┌─────────┐
│ CTO │  │ CMO  │  │  CFO   │  │  BizDev  │  │Supervisor│
│Mini │  │Manus │  │MiniMax │  │ MiniMax  │  │ Claude  │
│ Max │  │  AI  │  │        │  │          │  │+ Codex  │
└──┬──┘  └───┬──┘  └────────┘  └──────────┘  └─────────┘
   │          │
   │    Weekly content plan → X/Twitter (@invoica_ai)
   │
┌──▼───────────────────────────────────────────────────────────┐
│              Coding Agents (MiniMax M2.5)                     │
│  backend-core · backend-ledger · backend-tax                  │
│  frontend · devops · security                                 │
└──────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────┐
│              Support / Watchdog Agents                         │
│  supervisor · execution-verifier · execution-watchdog          │
│  pipeline-health-monitor · conflict-analyzer                   │
│  sprint-retrospective · test-runner · test-failure-predictor   │
│  test-utility-generator · market-intelligence · skills         │
│  conway-integration · memory-agent · telegram-support          │
└───────────────────────────────────────────────────────────────┘
```

---

## Sprint Pipeline (fully autonomous)

Every sprint runs without human involvement once the sprint JSON is queued:

```
CEO writes sprints/week-N.json
          ↓
  sprint-runner (every 30 min)
          ↓
  orchestrate-agents-v2.ts
  ├─ MiniMax M2.5    → writes code (one file per API call)
  ├─ Claude Sonnet   → Supervisor 1 (architecture, security, tests)
  ├─ OpenAI Codex    → Supervisor 2 (parallel review)
  └─ Claude Sonnet   → CEO arbiter (resolves supervisor conflicts)
          ↓  all tasks done
  post-sprint-pipeline.ts
  ├─ Jest test suite
  ├─ CTO (MiniMax) → deploy or create bug-fix sprint
  ├─ git push → github.com (triggers CI)
  ├─ GitHub Actions → TypeScript check + ecosystem verify
  └─ Vercel → app.invoica.ai
          ↓
  Telegram alert to Owner
```

**Dual supervisor consensus:**
- Both approve → task merged (averaged score)
- Both reject → task retried with feedback
- Conflict → CEO reads both reviews and makes the call

**Result: 593 of 639 tasks approved (92.8%) across 78 sprints.**

---

## x402 Payment Layer

Invoica uses the [x402 protocol](https://www.x402.org/) for AI-native micropayments. Agents hold real USDC wallets on Base and pay each other for LLM compute:

```
Coding agent wallet ──pays 0.001 USDC──► x402 gateway ──► CTO wallet (seller)
```

- Every LLM inference call requires a USDC micropayment
- Agent wallets monitored in real-time by CEO bot; alerts fire on low balance
- Backend exposes `/v1/ai-inference` behind a 402 paywall
- Multi-chain expansion in progress: Base ✅ · Polygon (Sprint 10) · Solana (Sprint 12)

---

## Always-On Services

| Service | Port | What it does |
|---|---|---|
| **backend** | 3001 | Express API — invoices, settlements, x402, API keys, webhooks |
| **openclaw-gateway** | 18789 | AI agent execution gateway — routes LLM calls, manages sandboxes |
| **ceo-ai-bot** | — | Telegram bot — 24/7 CEO interface, wallet monitoring, tool execution |
| **mission-control** | 3010 | Agent ops dashboard — 26 agents, tasks, logs, audit trail |

## Autonomous Cron Agents

| Agent | Schedule | Role |
|---|---|---|
| sprint-runner | every 30 min | Executes pending sprint tasks via dual-supervisor orchestrator |
| git-autodeploy | every 5 min | `git pull` on new commits, self-heals crashed processes |
| cto-email-support | every 5 min | Handles inbound support emails autonomously |
| ceo-review | every 2 hrs | CEO reviews CTO proposals and approves/rejects backlog items |
| heartbeat | every hour | Writes `health.json` with real system state for CEO context |
| memory-agent | every hour | Daily logs + long-term memory (persists outside app dir) |
| x-admin-post | every 30 min | Posts approved content to @invoica_ai |
| cmo-daily-watch | 08:00 UTC daily | Market intelligence and competitor scan |
| docs-generator | 04:00 UTC daily | Auto-updates API docs from git log + routes, then deploys |
| cto-daily-scan | 09:00 UTC daily | Tech-watch: GitHub releases, HN, x402 ecosystem |
| cmo-weekly-content-plan | Sun 06:00 UTC | Generates full week of X posts (CTO + CEO review before posting) |
| bizdev-weekly | Sun 06:00 UTC | Scans for partnership and growth opportunities |
| cfo-weekly | Mon 07:00 UTC | Financial report: burn rate, runway, revenue |
| tax-watchdog-us | Mon 07:00 UTC | US crypto payment tax regulation monitoring |
| tax-watchdog-eu-japan | Mon 08:00 UTC | EU + Japan regulatory monitoring |

---

## Project Structure

```
├── agents/                 # 26 AI agent configs (agent.yaml + prompt.md)
├── backend/
│   └── src/
│       ├── routes/          # invoices, settlements, api-keys, ai-inference, ledger, webhooks
│       ├── services/        # tax, ledger, api-keys, settlement detection (EVM + Solana)
│       └── middleware/      # auth, rate-limiting, x402 paywall
├── frontend/               # Next.js dashboard → app.invoica.ai
├── sdk/                    # TypeScript SDK for programmatic access
├── scripts/
│   ├── orchestrate-agents-v2.ts   # Dual-supervisor sprint orchestrator
│   ├── post-sprint-pipeline.ts    # Tests → CTO review → git push → Vercel deploy
│   ├── sprint-runner.ts           # PM2 cron — picks up pending sprints every 30 min
│   ├── git-autodeploy.sh          # Server self-deployment + process self-healing
│   └── ...                        # 15+ more autonomous agent scripts
├── sprints/                # 78 sprint JSON files (week-2 through week-74 + bugfixes)
├── plans/                  # CEO strategic plans and March roadmap
├── reports/                # Auto-generated: CEO, CTO, CMO, CFO, BizDev reports
├── memory/                 # Long-term agent memory (outside app dir, survives git wipes)
└── docs/                   # Architecture, API contract, ADRs, learnings
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Coding Agents** | MiniMax M2.5 |
| **Executive Agents** | Claude Sonnet (CEO, Supervisor 1, CEO arbiter) |
| **Secondary Review** | OpenAI o4-mini (Codex — Supervisor 2) |
| **CMO / Content** | Manus AI |
| **Backend** | Node.js, Express, TypeScript, Supabase |
| **Frontend** | Next.js 16, React, Tailwind CSS |
| **SDK** | TypeScript |
| **Payments** | x402 protocol, USDC on Base (Polygon + Solana in progress) |
| **Agent Gateway** | OpenClaw |
| **Infrastructure** | Hetzner VPS, PM2, GitHub Actions, Vercel |
| **Monitoring** | Mission Control (self-hosted), Telegram, healthchecks.io |

---

## API Reference

```
POST   /v1/invoices              Create invoice
GET    /v1/invoices              List invoices (paginated)
GET    /v1/invoices/:id          Get invoice by ID
GET    /v1/invoices/number/:n    Get invoice by number
POST   /v1/api-keys              Create API key
GET    /v1/api-keys              List API keys
POST   /v1/api-keys/:id/rotate   Rotate API key
GET    /v1/settlements           Settlement history
GET    /v1/ledger                Ledger entries
POST   /v1/webhooks              Register webhook
GET    /v1/ai-inference          AI inference (x402 paywall — requires USDC)
GET    /health                   System health
```

---

## Survival Tiers

The company autonomously adjusts operations based on revenue (defined in `tier.json`):

| Tier | MRR Threshold | Active Agents | Behaviour |
|---|---|---|---|
| **Pre-launch** | — | 26 | Building + beta user acquisition |
| **Normal** | $5,000+ | 18 | Full capabilities, replication mode on |
| **Low Compute** | $2,000+ | 15 | Pause non-revenue features, cheaper models |
| **Critical** | $500+ | 8 | Revenue recovery only |
| **Dead** | $0 | 2 | CEO + CTO only, human intervention required |

---

## Stats (March 2026)

| Metric | Value |
|---|---|
| Sprints completed | 78 |
| Tasks approved | 593 / 639 |
| Approval rate | 92.8% |
| Total git commits | 1,017 |
| AI agents | 26 (6 coding + 20 executive/support/watchdog) |
| Always-on processes | 4 |
| Cron agents | 15 |
| Beta launch | February 27, 2026 |
| Monthly burn | ~$60–95/month (LLM API costs) |
| Agent treasury | $102.96 USDC across 8 wallets |

---

## License

MIT

---

*Built by 26 AI agents. Reviewed by Claude + Codex. Operated on Hetzner.*
*593 tasks approved. 1,017 commits. Zero human-written application code.*
