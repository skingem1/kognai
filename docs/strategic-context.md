# KOGNAI STRATEGIC CONTEXT
*Extracted from KOGNAI_FULL_DEVELOPMENT_PLAN.md v3 + Master Architecture v14 + Master Plan v7*
*Updated: 2026-03-16*

## KEY PRINCIPLES
- TikTok = cashflow engine (must never break)
- Achiri = product differentiator (voice before memory)
- Kognai Runtime = infrastructure layer (abstracted last)
- ~95% agent work runs local ($0.00), cloud only on escalation
- Gate-driven: never proceed past a phase without passing the gate
- Summer Yu rule: safety constraints in bootstrap files, never chat-only
- Kill switches: non-negotiable triggers that force immediate action

## 9-LAYER ARCHITECTURE
1. Runtime → 2. Configuration → 3. Adaptation → 4. Health → 5. Compression → 6. Hosting → 7. Plumber → 8. Ecosystem → 9. Financial Autonomy

## 5 PRODUCTS
| Product | Phase | Revenue |
|---------|-------|---------|
| TikTok Content Agent | P1 | €9/mo subscription |
| Achiri AI Companion | P2A | Free + 5/15 TND/mo tiers |
| Founder Intelligence | P2+ | Internal → SaaS |
| Dynamic Research | P3 | Academic + x402 |
| x402 Payment Rail | P4 | Transaction fees |

## CURRENT PHASE
**Phase 1 — ACTIVE** (started Mar 17 2026)
- TikTok content pipeline running via scs001-live PM2 process (4x daily: 07:00, 12:00, 18:00, 21:00)
- Gate passed: workspace/gates/phase0-phase1-gate.json (Sprint 096, 2026-03-16)
- Launch kit: scripts/setup-phase1.sh + run-live.sh
- Phase 1.5 decision gate: Apr 7 — kill switch: <500 views/30 posts
- Current sprint: 101+

## PHASE SEQUENCE
| Phase | Dates | Focus | Status |
|-------|-------|-------|--------|
| P0 | Mar 9-16 | Foundation hardening (TASK_TARGET + event bus + pipeline) | ✅ COMPLETE |
| **P1** | **Mar 17 - Apr 11** | **TikTok content pipeline (revenue)** | **🟢 ACTIVE** |
| P1.5 | Apr 7 | Decision gate: TikTok stable enough for Achiri? | ⏳ Pending |
| P2A | Apr 14 - May 16 | Achiri lite alpha → full alpha | ⏳ Pending |
| P2B | Jun 1-27 | Runtime extraction + auditor | ⏳ Pending |
| P3 | Jun 29 - Sep 26 | Plumber agents, QLoRA, ACP, ClawRouter, scale | ⏳ Pending |
| P4 | Sep 29 - Dec 19 | SDK, survey agent, marketplace | ⏳ Pending |

## OPENCLAW SKILLS TIMELINE
| Tier | Phase | Skills Count |
|------|-------|-------------|
| T1 (Day 1) | P0 | 13 skills (infra + dev tooling) — deferred to Sprint 102+ |
| T2 (Phase 1) | P1 | 6 skills (content + monetization) — deferred to Sprint 102+ |
| T3 (Phase 2A) | P2A | 6 skills (Achiri-specific) |
| T4 (Ongoing) | P3+ | 6 skills (advanced features) |

## EXPERTISE ROUTING (ClawRouter — Phase 3+)
| Task Type | Preferred Model | Fallback |
|-----------|----------------|----------|
| code | Claude Sonnet 4 | MiniMax-M2.5 |
| reason | Claude Opus 4 | Gemini 2.5 Pro |
| lang | Qwen3-14B (local) | Claude Sonnet 4 |
| util | Qwen3-4B (local) | MiniMax-M2.5 |
| audit | Qwen3-14B (local) | Claude Sonnet 4 |

## COST GUARDRAILS
- Local models: qwen3:0.6b/4b/14b, deepseek-r1:14b ($0.00)
- Cloud escalation: Claude Sonnet ($0.003/1k), Opus ($0.015/1k)
- Budget guard: any task estimated >$0.10 falls back to POWER tier
- Target: <$5/day cloud spend
- Monthly running costs: ~€150-270/month
- Break-even: ~20-30 TikTok subscribers at €9/month

## KILL SWITCHES
- TikTok banned → switch to IG Reels only
- <500 views after 30 posts → 3 format experiments, then freeze
- Achiri Day-7 retention <20% after 2 fixes → stop, do 5 user interviews
- Swarm approval <80% for 2 sprints → pause, debug orchestrator
- Mac Mini >22GB memory → kill low-priority processes
- >6h/day oversight → slow down, simplify
- Agent ignoring constraints post-compaction → STOP, write to bootstrap files

## SPRINT NUMBERING
- Invoica legacy: 001-062e (completed)
- Kognai starts: 063+
- Current: Sprint 101+ (as of 2026-03-16)

## FOUNDER SCHEDULE
- AM (07:00-09:30): Review + kick off
- MID (12:00-14:00, M/W/F only): Deep work
- PM (18:00-19:30): Check progress + session log
- Weekends: OFF
- Sunday: no-swarm day (reflection)
- Total: 26h/week

*Full plan: ~/Documents/Kognai/KOGNAI_FULL_DEVELOPMENT_PLAN.md (v3)*
*Full timeline: ~/Documents/Kognai/KOGNAI_DAILY_TIMELINE.md*
*Master architecture: ~/Documents/Kognai/Master Documents/kognai master architecture v14.docx*
*Master plan: ~/Documents/Kognai/Master Documents/kognai achiri master plan v7.docx*
