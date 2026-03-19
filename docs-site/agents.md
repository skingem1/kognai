# Agent Catalog

Kognai runs 27 specialized agents coordinated by OpenClaw v2026.3.7. Each agent has a YAML config and prompt in `kognai-agents/`.

## Executive Agents

| Agent | Role |
|-------|------|
| **ceo** | Strategic decisions, gate reviews, sprint prioritization |
| **cto** | Technical architecture, model selection, infrastructure decisions |
| **cfo** | Budget enforcement, cost tracking, financial autonomy |
| **cmo** | Brand strategy, content direction, TikTok launch planning |
| **supervisor** | Dual-supervisor review, quality gates, swarm coordination |

## SCS-001 Pipeline Agents (TikTok Content)

| Agent | Role |
|-------|------|
| **scs001-discovery** | Trend discovery — YouTube, TikTok, web scraping for viral topics |
| **scs001-trend** | Trend analysis and scoring — identifies content opportunities |
| **scs001-script** | Script generation — hooks, narratives, CTAs from trend data |
| **scs001-script-validator** | Script quality validation before production |
| **scs001-clip-detection** | Video segment detection — PySceneDetect + motion analysis |
| **scs001-editing** | Video editing pipeline — FFmpeg composition, effects, captions |
| **scs001-caption** | Caption generation — platform-optimized captions + hashtags |
| **scs001-qc** | Quality control gate — technical + content quality scoring |
| **scs001-hosting** | Video hosting layer — upload, CDN, thumbnail generation |
| **scs001-publishing** | Publishing orchestration — scheduling, platform delivery |
| **scs001-analytics** | Performance analytics — views, engagement, retention tracking |
| **scs001-orchestrator** | Pipeline orchestration — coordinates all SCS-001 stages |
| **scs001-scorer** | Composite scoring — OpenCLIP + librosa + motion metrics |
| **scs001-experiment** | A/B testing — experiment design and result analysis |
| **scs001-flywheel** | Growth flywheel — feedback loops from analytics to discovery |
| **scs001-insight** | Content insights — pattern recognition across performance data |
| **scs001-failure-library** | Failure catalog — learns from failed content to avoid repeats |

## Infrastructure Agents

| Agent | Role |
|-------|------|
| **devops** | Infrastructure as Code — Terraform, PM2, server management |
| **security** | Security middleware, API authentication, vulnerability scanning |
| **frontend** | Next.js dashboard, React components, UI/UX |
| **backend-core** | Invoice middleware, settlement detection, core API |
| **backend-ledger** | Double-entry accounting, budget enforcement |
| **backend-tax** | Multi-jurisdiction tax calculation engine |

## Specialized Agents

| Agent | Role |
|-------|------|
| **achiri** | Culturally adaptive AI companion (Tunisia — Derja/Arabic/French) |
| **telegram-bot** | Telegram operator interface — commands, notifications, digests |
| **stripe** | Payment processing — subscription management, webhook handling |
| **invoica-x-admin** | Cross-project admin for shared Invoica infrastructure |

## Swarm Execution

The production swarm uses 3 core agents:
- **Harvey** (CEO) — strategic review and approval
- **Messi** (Coder) — code generation and implementation
- **Sherlock** (Supervisor) — quality review and validation

Orchestrated by `scripts/orchestrate-agents-v2.ts` with dual-supervisor review. Sprint JSON files define task lists; the swarm executes them autonomously.
