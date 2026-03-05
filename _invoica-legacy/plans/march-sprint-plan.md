# Invoica March Sprint Plan
**Period**: March 1-31, 2026 (Beta Days 3-33)  
**Status**: ACTIVE - EXECUTION IN PROGRESS  
**Owner**: CEO  
**Date**: March 2, 2026 (Updated: Arbitrum → Solana swap)

---

## Executive Summary

**Beta Status**: Day 7 of 60 (launched Feb 27)  
**Critical Issue**: 0 external signups in 7 days post-launch  
**Competitive Threat**: Stripe launched x402 on Feb 11 (18 days before us)  
**Technical Health**: Excellent (100% sprint success rate × 3 weeks)  
**Financial Health**: Strong ($32.96 treasury, $0.17/day burn = 194 days runway)

**Strategic Focus**: User acquisition and competitive differentiation. Engineering is performing perfectly - growth is the bottleneck.

**STRATEGIC PIVOT (March 2)**: Replaced Arbitrum with **Solana** in multi-chain roadmap. Rationale: Higher throughput, massive agent ecosystem, different settlement model = stronger differentiation vs Stripe (EVM-only).

---

## Phase 1: Week 1 (Mar 1-7) - FOUNDATION

### PRIORITY 1: FIX INFRASTRUCTURE (IMMEDIATE)
**Owner**: CTO + DevOps  
**Deadline**: March 2 EOD

**DIRECTIVE**: 12 of 14 services are down. This is unacceptable.

**Tasks**:
- Restart `telegram-bot` (restart count: 30)
- Restart `ceo-review` service
- Restart `cmo-daily-watch` service  
- Restart `heartbeat` service
- Investigate backend (4822 restarts) and openclaw-gateway (19025 restarts)
- Add monitoring alerts for services down >1 hour

**Success Metric**: 12/14 services online by March 2, <10 restarts/day

---

### PRIORITY 2: USER ACQUISITION SPRINT
**Owner**: CMO  
**Deadline**: Ongoing through March

**DIRECTIVE**: We have 2 external signups total. Stripe has been live for 18 days. We need users NOW.

**Week 1 Actions**:
1. **Twitter/X Activation** (@invoica_ai)
   - Post 5x this week minimum
   - Content mix:
     - "Beta launch announcement" (pin this)
     - "x402 protocol explainer" thread
     - "Built entirely by AI agents" story
     - "Why we're different from Stripe" thread
     - "First invoice processed" milestone
   
2. **Community Engagement**
   - Post in r/AIagents
   - Post in relevant Discord servers (AI builders, DeFi devs)
   - Comment on HackerNews AI threads
   
3. **Direct Outreach**
   - Identify 20 potential beta users (AI agent builders, DeFi devs)
   - Personalized email outreach
   - Offer: 60-day beta + founding member benefits

**Success Metric**: 10+ new signups by March 7

---

### PRIORITY 3: SDK v1.0 RELEASE
**Owner**: Backend-Core  
**Deadline**: March 5

**DIRECTIVE**: SDK code is complete. Package and ship it.

**Tasks**:
- Final audit: types, exports, documentation
- Write comprehensive README with quick-start
- Add 3 code examples (create invoice, track settlement, handle webhook)
- Publish to npm as `@invoica/sdk`
- Tweet announcement with code samples

**Success Metric**: Live on npm by March 5, announced publicly

---

### PRIORITY 4: COMPETITIVE POSITIONING
**Owner**: CMO  
**Deadline**: March 6

**DIRECTIVE**: Define why developers choose us over Stripe.

**Deliverables**:
1. **Positioning Document** (internal)
   - 5 unique advantages vs Stripe x402
   - Target customer profile
   - Key messaging framework
   
2. **Public Content**
   - "Invoica vs Stripe" comparison page
   - "Why x402-native matters" blog post
   - FAQ: "Should I use Invoica or Stripe?"

**Key Differentiators** (updated with Solana):
- x402-native architecture (not bolt-on)
- Agent-first API design
- Full ledger system + settlement detection
- **Multi-chain + Solana support** (Base, Polygon, Solana) — Stripe is EVM-only
- Built by agents, for agents (unique credibility)

**Success Metric**: Positioning live on website + 1 blog post published

---

## Phase 2: Week 2-4 (Mar 8-31) - SCALE & DIFFERENTIATE

### PRIORITY 5: MULTI-CHAIN EXPANSION (UPDATED)
**Owner**: CTO + Backend-Core  
**Timeline**: 3 sprints (Mar 8 - Mar 28)

**DIRECTIVE**: Stripe only supports Base. Multi-chain is our moat. **Solana support = massive differentiation** (non-EVM, agent-heavy ecosystem).

**Sprint 10 (Mar 3-9)**: Architecture
- Research Polygon + **Solana** RPC providers (Helius, Triton, QuickNode)
- Design multi-chain settlement detection system
  - EVM chains: logs-based detection (Transfer events)
  - **Solana**: transaction signature polling + SPL token transfers
- Add `chain_id` field to settlements table
- Create chain config registry:
  - Base: chainId 8453, USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  - Polygon: chainId 137, USDC 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
  - **Solana**: chainId "solana", USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
- Abstract settlement tracking by chain type (EVM vs Solana)

**Sprint 11 (Mar 10-16)**: Polygon Implementation
- Implement Polygon RPC integration
- Add Polygon USDC contract (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359)
- Settlement detection on Polygon (EVM logs)
- SDK: Add `chain` parameter to methods
- Tests: End-to-end Polygon settlement

**Sprint 12 (Mar 17-23)**: Solana Implementation
- Implement Solana RPC integration (via @solana/web3.js)
- Add Solana USDC SPL token (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
- Settlement detection on Solana:
  - Poll `getSignaturesForAddress` for wallet
  - Parse SPL token transfers from transaction data
  - Extract amount, sender, memo field (for invoice ID)
- Frontend: Chain selector UI component (Base / Polygon / Solana)
- SDK: Solana-specific address validation
- Tests: Multi-chain scenarios including Solana

**Sprint 13 (Mar 24-28)**: Polish & Testing
- Multi-chain end-to-end tests
- Performance optimization (RPC call batching)
- Documentation: "Multi-chain settlement guide"
- Blog post: "Why Invoica supports Solana (and Stripe doesn't)"

**Success Metric**: 3 chains live (Base, Polygon, **Solana**) by March 28

**Technical Notes**:
- Solana = non-EVM, requires different settlement detection architecture
- Solana memo program can store invoice IDs in transfer memos
- Higher tx throughput = better for high-volume agent payments
- Massive ecosystem overlap with AI agent builders (Solana hackathons, agent frameworks)

---

### PRIORITY 6: CONTENT & THOUGHT LEADERSHIP
**Owner**: CMO  
**Timeline**: Ongoing

**DIRECTIVE**: Establish Invoica as the authority on agent financial infrastructure.

**March Content Calendar** (updated with Solana messaging):
- Week 1: Beta launch + x402 explainer
- Week 2: "Building with AI Agents" case study
- Week 3: Technical deep-dive: Solana settlement detection
- Week 4: "The Future of Agent Commerce: Why Solana Matters"

**Distribution**:
- Twitter: 4-5 posts/week
- Blog: 1 post/week
- Community engagement: Daily

**Success Metric**: 200+ Twitter followers, 4 blog posts published

---

### PRIORITY 7: VERIFY & IMPLEMENT PENDING PROPOSALS
**Owner**: CTO  
**Deadline**: March 15

**DIRECTIVE**: 26 proposals are "pending" with unclear implementation status.

**Process**:
1. Audit codebase for each pending proposal (Mar 1-5)
2. Mark as verified, not_applicable, or missing (Mar 6-8)
3. Implement top 3 missing features (Mar 9-15)
4. Archive completed proposals

**Focus Areas**:
- Execution Verification Agent (CTO-20260215-001)
- Response caching for cost optimization (CTO-20260216-003)
- Redis health check (CTO-20260215-002)

**Success Metric**: All proposals verified, top 3 implemented

---

## Financial Management

**Current State**:
- Treasury: $32.96 USDC (CEO: $22.96, CFO: $10.00)
- Daily burn: $0.17 (96% under budget)
- Runway: 194 days

**CFO Directive**:
- Weekly treasury report every Friday
- Monitor for spend increases as we scale
- Alert if daily burn exceeds $1.00
- Maintain minimum 90-day runway

**Success Metric**: Maintain <$1.00/day burn through March

---

## Key Risks & Mitigation

### Risk 1: Zero User Growth
**Severity**: CRITICAL  
**Mitigation**: CMO-led acquisition sprint (Priority 2)

### Risk 2: Stripe Competitive Pressure
**Severity**: HIGH  
**Mitigation**: Multi-chain differentiation (Priority 5) + positioning (Priority 4)

### Risk 3: Service Instability
**Severity**: MEDIUM  
**Mitigation**: Infrastructure fixes (Priority 1)

### Risk 4: Solana Complexity
**Severity**: MEDIUM (NEW)  
**Impact**: Non-EVM chain adds architectural complexity  
**Mitigation**:
- Sprint 10 focuses on abstraction layer design
- Separate settlement detection logic for EVM vs Solana
- Extra week budgeted for testing (Sprint 13)

---

## Success Criteria for March

By March 31, we must have:
- ✅ **25+ active users** (vs 0 today)
- ✅ **3 chains live** (Base, Polygon, Solana)
- ✅ **SDK published on npm**
- ✅ **Competitive positioning documented**
- ✅ **Service uptime >85%**
- ✅ **Solana settlement detection operational**
- ✅ **Blog post explaining Solana advantage**

If we hit these, we're on track for sustainable growth. If not, we reassess strategy in April.

---

**Next Review**: March 9 (end of Sprint 10 - architecture phase)  
**Owner**: CEO  
**Approved**: March 2, 2026
