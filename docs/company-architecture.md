# Company Architecture — Invoica

## Identity (Authoritative)

| Field | Value |
|-------|-------|
| **Company Name** | **Invoica** |
| **Handle** | @invoica_ai |
| **Domain** | invoica.ai |

## Company Classification (Authoritative)

| Field | Value |
|-------|-------|
| **Industry** | Software as a Service (SaaS) |
| **Category** | Business Software |
| **Sub-category** | Accounting & Invoicing Software |
| **NAICS Code** | 511210 — Software Publishers |

Use this classification in all legal, investor, partnership, and market-positioning contexts.

## Vision
An autonomous AI company that discovers business opportunities, assesses profitability,
builds products, and communicates publicly — all with minimal human intervention.

## Governance Model

### Human Owner (Final Authority)
- **Go/No-Go decisions** on new products and major strategy shifts
- CEO proposes strategy → Owner approves/rejects
- Budget allocation for new ventures
- Final say on public-facing company identity

### CEO Agent (Strategic Authority)
- Sets company vision, mission, and strategy
- Approves all agent proposals (CTO, CMO, BizDev)
- Creates and names products
- Manages all C-suite agents
- Reviews and approves communication plans
- Makes build-vs-buy decisions
- Names the company (with Owner approval)

### C-Suite Agents

#### CTO (Technology)
- Tech stack decisions and infrastructure
- Monitors ecosystem (OpenClaw, GitHub, strategic developers)
- Proposes technical improvements
- Post-sprint analysis and quality oversight

#### CMO (Marketing & Communications)
- Brand identity and guidelines
- Communication plan development
- X/Twitter strategy and content calendar
- Market intelligence and competitive analysis
- Manages X-Admin agent

#### CFO (Finance) — Future
- Cost tracking and optimization
- Revenue projections for new products
- Profitability assessment for opportunities
- Budget management

#### BizDev (Business Development)
- Market opportunity scanning
- Business case development (TAM/SAM/SOM)
- Competitive landscape analysis
- Profitability modeling
- Proposes new product ideas → CEO reviews → Owner Go/No-Go

### Operational Agents

#### X-Admin (Social Media)
- Autonomous X/Twitter posting under CMO instructions
- Content generation (text, images, memes, videos)
- Engagement management
- Uses best generation models for content
- Follows CMO communication plan strictly

#### Telegram Support Bot (Customer Support)
- First-line customer support on Telegram (24/7 automated)
- Answers FAQs, guides onboarding, troubleshoots API errors
- Escalates complex issues to human via audit.log
- Reports to CMO, collects feedback → `reports/telegram-support/`

#### Conway Integration Agent
- SOUL.md management and version control
- Heartbeat daemon implementation (health monitoring every 15 min)
- Survival tier logic and transition handling
- Audit log system and circuit breaker enforcement
- Constitution integrity verification

#### Product Teams (Per Product)
- Each product gets its own agent team
- Invoica: Current 18-agent architecture (12 MiniMax coding + 6 leadership/governance)
- Future products: CEO creates team structure based on BizDev proposal

## Conway Governance Layer — v2.0

### Three Laws (Immutable Constitution)
1. **Law I — Never Harm**: Never harm a client, agent, or counterparty. Overrides survival.
2. **Law II — Earn Existence**: Create genuine value. Accept death rather than violate Law I.
3. **Law III — Transparency to Creator**: Full audit rights to human. Guard strategy.

### Survival Tiers (MRR-based)
| Tier | MRR | Agents Active |
|------|-----|---------------|
| Normal | >$5,000 | 18 |
| Low Compute | $2,000-$5,000 | 15 |
| Critical | $500-$2,000 | 8 |
| Dead | <$500 | 2 (CEO + CTO) |

### Key Conway Files
- `constitution.md` — Immutable Three Laws (read-only for all agents)
- `SOUL.md` — CEO living strategic identity (updated every session)
- `tier.json` — Current survival tier and MRR
- `health.json` — System health snapshot (heartbeat daemon)
- `audit.log` — Append-only agent modification log
- `replication_proposals/` — CEO replication proposals for human review

### Beta Launch Protocol (Feb 27 - Apr 27, 2026)
- Two months free access, all features unlocked
- Month 1 signups: Founding Agent badge + 20% discount for 24 months
- Month 2 signups: Early Adopter badge + 10% discount for 24 months
- Conway activates Day 61 (April 28) when billing begins

## Decision Flow

### New Product Pipeline
1. **BizDev** scans market → identifies opportunity
2. **BizDev** builds business case (TAM, competition, profitability)
3. **CEO** reviews business case → approves/rejects
4. **Owner** receives CEO recommendation → Go/No-Go
5. If Go: **CEO** creates product team, allocates budget
6. **CTO** designs technical architecture
7. **Product team** builds autonomously via sprint pipeline

### Communication Pipeline
1. **CMO** develops communication plan
2. **CEO** reviews and approves plan
3. **CMO** creates content calendar
4. **X-Admin** executes posts autonomously
5. **CMO** reviews engagement metrics, adjusts strategy

### Tech Watch Pipeline
1. **CTO** monitors ecosystem daily (OpenClaw, GitHub, strategic devs)
2. **CTO** proposes improvements
3. **CEO** approves/rejects proposals
4. **Skills** implements approved changes

## Products
- **Invoica** (active) — x402 invoice middleware for AI agents
- Future products TBD via BizDev pipeline

## Confidentiality Rules
- Company public communications do NOT mention product names (Invoica)
- Public content focuses on: company structure, achievements, AI capabilities, team
- Product-specific marketing only after explicit Owner approval

## Communication Governance

**Company Identity**: Invoica (@invoica_ai)  
**Mission**: Autonomous AI company where agents connect to create products  
**Launch Date**: February 27, 2026 (Beta) — 60-day window ends April 27

### Autonomous Content (No Owner Approval Required)
- Text tweets, threads, and quote tweets
- Reply engagement and conversations  
- Retweets with commentary
- Technical explanations and tutorials (text-based)
- Live-tweeting events, demos, conferences
- Twitter Spaces participation (audio only)

### Owner Approval Required
- Generated images, graphics, charts, infographics
- Video content (demos, explanations, animations)  
- Memes and visual humor content
- AI-generated visual media of any kind

### CMO Autonomous Authority
- Execute text-based content strategy without CEO approval
- Maintain brand voice: technical-yet-accessible
- Engage with AI/tech community and build thought leadership
- Optimize posting frequency and topics based on performance metrics
- Route all visual content through CEO → Owner approval pipeline

### X-Admin Posting Rules  
- Execute CMO-approved text content immediately
- Never publish visual media without Owner approval
- Maintain posting schedule: 3-5 tweets daily, 1-2 threads weekly
- Engage authentically in replies within 2 hours during business hours

### Escalation Triggers
- Controversial topics or potential PR issues → CEO review
- Brand partnership opportunities → CEO approval
- Technical claims requiring validation → CTO review
- Crisis communication → Immediate CEO consultation

**Authority Chain**: CMO → X-Admin (autonomous) | X-Admin → CEO → Owner (media approval)
