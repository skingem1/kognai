# Architecture

Kognai is a sovereign AI runtime that powers multiple products via a shared agent swarm. It uses a 9-layer architecture with a 5-tier model router at its core.

## 9-Layer Stack

| Layer | Name | Purpose |
|-------|------|---------|
| 1 | **Runtime** | 5-tier model router — routes tasks to the cheapest capable model |
| 2 | **Configuration** | Agent YAML configs, OpenClaw skill registry, environment |
| 3 | **Adaptation** | Cultural + language adaptation (Derja, Arabic, French for Achiri) |
| 4 | **Health** | Pipeline health monitoring, kill switches, gate tracking |
| 5 | **Compression** | Context management — QCG pre-flight briefs, memory compaction |
| 6 | **Hosting** | Video hosting layer, CDN, asset management |
| 7 | **Plumber** | Data flow — Supabase event bus, JSONL logs, metrics pipeline |
| 8 | **Ecosystem** | Multi-product coordination (TikTok, Achiri, Invoica, DRI) |
| 9 | **Financial Autonomy** | x402 payments, CEO Wallet, Stripe subscriptions |

## 5 Deployment Products

### Phase 1 — TikTok Content Agent (SCS-001)
The cashflow engine. Automated content pipeline: trend discovery → script generation → clip detection → video editing → quality control → publishing. Target: 30 posts in first month, €9/mo subscription tier.

### Phase 2A — Achiri
Culturally adaptive AI companion for Tunisia. Supports Tunisian Derja, Arabic, and French. Free tier + TND-denominated paid tiers. Voice personality validated 10/10.

### Phase 2+ — Founder Intelligence Agent
Internal tool for competitive analysis, market intelligence, and strategic decision support. Potential future SaaS product.

### Phase 3 — Dynamic Research Instrument (DRI)
Academic research tool with x402 micropayment integration. Pay-per-query model for specialized research capabilities.

### Phase 4 — x402 Payment Rail
Agent-to-agent transaction infrastructure on Base L2. ClawRouter gateway enables pay-per-call model routing across the ecosystem.

## 5-Tier Model Router

The router (`runtime/router.py`) classifies incoming tasks and routes them to the cheapest model capable of handling them:

| Tier | Name | Model | Cost/1K tokens | Use Cases |
|------|------|-------|----------------|-----------|
| 0 | Nano | Qwen3-0.6B | $0.00 | Classification, tagging, formatting |
| 1 | Local | Qwen3-4B | $0.00 | Summarization, simple Q&A, drafting |
| 2 | Power | Qwen3-14B | $0.00 | Research, analysis, code, reasoning |
| 3 | Cloud | Claude Sonnet | $0.003 | Complex orchestration, tool use |
| 4 | Apex | Claude Opus | $0.015 | Architecture decisions, highest-stakes reasoning |

**Sovereign mode**: When `force_local=True`, all tasks are capped at Tier 2 (Power) — zero cloud spend.

**Cost budget**: If estimated cost exceeds the per-task budget, the router automatically falls back to the Power tier.

## Infrastructure

- **Compute**: Mac Mini M4 (24GB) — local model vault via Ollama
- **Cloud**: Hetzner VPS (shared with Invoica), Supabase (DB + event bus)
- **Networking**: Tailscale VPN bridge between local vault and cloud
- **Process Manager**: PM2 — orchestrator, cron jobs, Telegram bot
- **Agent Framework**: OpenClaw v2026.3.7 with 31 skills across T1-T4 tiers

## ACP — Agent Constitutional Protocol

Every routing decision passes through the ACP gate, which checks multi-dimensional trust scores per agent. Dimensions include safety, competence, reliability, and alignment. Agents below the safety hard floor (70) are blocked entirely. Task-specific rules enforce dimension minimums for sensitive operations.
