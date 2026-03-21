# Agent Catalog

Kognai operates 28+ agents organised into core governance agents and SCS-001 pipeline agents.

## Core Agents

| Agent | Role | Model | Reports To |
|-------|------|-------|------------|
| **ceo** (Harvey) | Strategic oversight, sprint approval | deepseek-r1:14b | — |
| **coder** (Messi) | Code execution, feature implementation | qwen3:14b | ceo |
| **supervisor** (Sherlock) | Quality validation, output review | qwen3:14b | ceo |
| **cmo** | Brand strategy, market intelligence | manus-1.6 | ceo |
| **constitution** | Constitutional enforcement | qwen3:14b | — |
| **intelligence** | Founder intelligence gathering | qwen3:14b | ceo |
| **stripe** | Payment processing, subscription management | qwen3:4b | ceo |
| **telegram-bot** | Operator interface, commands | qwen3:4b | ceo |

## SCS-001 Pipeline Agents

The TikTok Content Agent pipeline consists of 11 specialised agents executing 12 stages:

| Agent | Stage | Function |
|-------|-------|----------|
| **scs001-trend** | 1. Trend Detection | Google Trends RSS + YouTube API scanning |
| **scs001-discovery** | 2. Discovery | Video search and source identification |
| **scs001-clip-detection** | 3. Clip Detection | Viral moment scoring (parallel) |
| **scs001-insight** | 4. Insight | Speaker-level analysis, key claims extraction |
| **scs001-script** | 5. Script Generation | Hook formula application, LLM rewrite |
| **scs001-script-validator** | 6. Validation | Pre-editing quality gate |
| **scs001-editing** | 7. Editing | Video composition, caption overlay |
| **scs001-caption** | 8. Caption | Topic-aware hashtag generation |
| **scs001-qc** | 9. Quality Control | Multi-criteria scoring (14 → 10 filter) |
| **scs001-publishing** | 10. Publishing | TikTok API / manual posting |
| **scs001-analytics** | 11. Analytics | View tracking, engagement metrics |

### Supporting Agents

| Agent | Function |
|-------|----------|
| **scs001-orchestrator** | Pipeline coordination, stage sequencing |
| **scs001-flywheel** | Feedback loop: boost trending topics |
| **scs001-failure-library** | Learn from failed generations |
| **scs001-experiment** | A/B test framework, hook formula tuning |
| **scs001-scorer** | Content quality scoring |
| **scs001-hosting** | Supabase Storage upload, CDN |
| **scs001-viral-downloader** | Source video acquisition |

## Other Agents

| Agent | Function |
|-------|----------|
| **achiri** | Culturally adaptive AI companion (Phase 2A) |
| **archive-scraper** | Historical content analysis |
| **caption-generator** | General-purpose caption generation |
| **tiktok-client** | TikTok API interface |
| **vision-scorer** | Visual quality assessment |

## Named Swarm Agents

| Name | Role | Specialty |
|------|------|-----------|
| **messi** | Coder | Feature implementation, bug fixes |
| **sherlock** | Supervisor | Output validation, quality gates |
| **guardiola** | Orchestrator | Multi-agent coordination |
| **macgyver** | Problem solver | Creative workarounds, unblocking |
| **satoshi** | Financial | x402, wallet management, tokenomics |
| **elon** | Growth | Scaling, performance optimisation |

## OpenClaw Skills Registry

31 skills across 4 tiers:

| Tier | Count | Examples |
|------|-------|---------|
| T1 Foundation | 6 | Core runtime, config management |
| T2 Content | 8 | Script generation, editing, captions |
| T3 Intelligence | 11 | Safety filter, eval harness, Derja profiler |
| T4 Commerce | 6 | Stripe integration, x402 payments |
