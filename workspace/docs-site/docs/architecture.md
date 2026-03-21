# Architecture Overview

Kognai is built on a 9-layer architecture that separates concerns from raw compute to financial autonomy.

## 9-Layer Stack

```
Layer 9: Financial Autonomy  — x402, CEO Wallet, USDC distribution
Layer 8: Ecosystem           — SCS formation, agent marketplace, skill rental
Layer 7: Plumber             — Event bus, inter-agent messaging, orchestration
Layer 6: Hosting             — Supabase Storage, video hosting, CDN
Layer 5: Compression         — BrainX memory, knowledge distillation, QCG
Layer 4: Health              — Watchdog, kill switches, gate validators
Layer 3: Adaptation          — A/B testing, experiment tracking, flywheel
Layer 2: Configuration       — Agent configs (YAML), OpenClaw skills, COMMANDS.md
Layer 1: Runtime             — 5-tier model router, Ollama, Anthropic API
```

## Model Router

The model router (`runtime/router.py`) selects the optimal model for each request based on task complexity and cost constraints.

| Tier | Model | Cost | Use Case |
|------|-------|------|----------|
| Nano | qwen3:0.6b | $0.00 | Classification, simple extraction |
| Local | qwen3:4b | $0.00 | Summarisation, basic generation |
| Power | qwen3:14b, deepseek-r1:14b | $0.00 | Complex reasoning, code generation |
| Cloud | Claude Haiku, Sonnet | $$ | High-quality generation, evaluation |
| Apex | Claude Opus | $$$ | Critical decisions, architecture review |

## Orchestration

The orchestrator (`scripts/orchestrate-agents-v2.ts`) manages agent execution with dual supervisor review:

1. **Harvey (CEO)** — strategic oversight, approves agent plans
2. **Messi (Coder)** — executes tasks, writes code
3. **Sherlock (Supervisor)** — validates output, rejects substandard work

### Swarm Execution Flow

```
Sprint JSON → Harvey reviews → Messi executes → Sherlock validates → Commit
```

## Key Infrastructure

### Compute
- **Mac Mini M4 Pro** — local model inference via Ollama
- **Hetzner VPS** — cloud hosting for Achiri and public-facing services
- **Tailscale VPN** — secure bridge between local and cloud

### Storage
- **Supabase** — PostgreSQL database, Storage (video hosting), event bus
- **Local filesystem** — agent configs, sprint history, pipeline artifacts

### Process Management
- **PM2** — manages long-running processes (pipeline, Telegram bot, crons)

## Constitutional Framework

Every agent operates under:
- **Constitution** (`workspace/shared-context/CONSTITUTION.md`) — 9 Articles
- **Five Principles** (`workspace/shared-context/FIVE_PRINCIPLES.md`) — ethical foundation
- **ACP** (Agent Capability Protocol) — capability declarations per agent
- **Kill Switches** — non-negotiable triggers for automatic shutdown

## Architecture Amendments (AMD)

The architecture evolves through numbered amendments:

| AMD | Title |
|-----|-------|
| 01 | A2A / AP2 / x402 / ERC-8004 Protocol Integration |
| 02 | Skill Bank & Knowledge Asset Layer |
| 03 | Constitutional Framework |
| 04 | Self Committed Swarms (SCS) |
| 05 | IRL Intelligence Layer (Voxight X Oracle) |
| 06 | Federated Modular Architecture |
| 07 | Code Asset Library |
| 08 | Monotask Mandate and Agent State Machine |
| 09 | Agent Fusion Protocol |
| 10 | Capability Atlas (COMMANDS.md) |
| 11 | Builder Verification Service |
| 12 | Qwen Context Gateway (QCG) |
| 13 | (Latest) |
