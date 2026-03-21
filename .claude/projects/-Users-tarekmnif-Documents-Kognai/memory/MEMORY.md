# KOGNAI SESSION MEMORY
*Last updated: Sprint 620 — 2026-03-21*

---

## Current Phase
**Phase 1 — Active** (Mar 17 – Apr 11 2026) | TikTok content pipeline (€9/mo)
- Phase 0→Phase 1 gate: **PASSED** (2026-03-16, sprint-096)
- Blocker: TIKTOK_ACCESS_TOKEN not set in .env (human action required)
- Production mode: set `SCS_EDITING_MODE=production` + `TIKTOK_ACCESS_TOKEN` in .env

## Kognai State
- Last commit: 1244699 (Sprint 685 shipped 2026-03-21)
- Sprint numbering: Invoica legacy 001-062e → Kognai starts 063+
- Current sprint: 690 (next)
- Gate reports: workspace/gates/phase0-phase1-gate.json, workspace/gates/phase1-activation-readiness.json, workspace/gates/production-quality-check.json
- Gate status: 0/30 posts, ~17 days to Apr 7 Phase 1.5 gate (CRITICAL — need human posting)
- Stripe: LIVE (keys set, operational)
- Achiri alpha: Apr 25 (~40d) — deploy script ready (scripts/deploy-achiri.sh), alpha whitelist file-based

## Build Priority Sequence

| Sprint | Block | Agent/Component | Status |
|--------|-------|-----------------|--------|
| 076 | A | Trend Agent | ✅ PASS |
| 077 | A | Discovery Agent | ✅ PASS |
| 078 | A | ClipDetection Agent | ✅ PASS |
| 079 | B | Insight Agent | ✅ PASS |
| 080 | B | Script Agent | ✅ PASS |
| 081 | C | Editing Agent | ✅ PASS |
| 082 | C | Caption Agent | ✅ PASS |
| 083 | C | QC Agent | ✅ PASS |
| 084 | E | Publishing Agent | ✅ PASS |
| 085 | E | Analytics Agent | ✅ PASS |
| 086 | F | Orchestrator | ✅ PASS |
| 087 | G | Dashboard + Pipeline Runner | ✅ PASS |
| 088 | F+ | Flywheel + Failure Library | ✅ PASS |
| 089 | A-fix | ClipDetection scoring fix | ✅ PASS |
| 090 | ops | PM2 scheduling | ✅ PASS |
| 091 | integration | Telegram notification bridge | ✅ PASS |
| 092 | hardening | Pipeline error recovery | ✅ PASS |
| 093 | performance | ClipDetection parallel scoring | ✅ PASS |
| 094 | hardening | Deduplication + metrics logging | ✅ PASS |
| 095 | gate | Phase 0→Phase 1 gate validator | ✅ CONDITIONAL PASS |
| 096 | gate-fix | Phase 0→Phase 1 gate PASS | ✅ PASS |
| 097 | activation | Phase 1 activation (PM2 scs001-live) | ✅ PASS |
| 098 | production-quality | Production video quality + live publishing | ✅ PASS |
| 099 | hosting | Video hosting layer (Supabase Storage + preflight) | ✅ PASS |
| 100 | ops | Phase 1 operator launch kit (.env.example, setup-phase1.sh, run-live.sh) | ✅ PASS |
| 101 | data-pipeline | Live trend pipeline (Google Trends RSS + YouTube API + real video search) | ✅ PASS |
| 102 | hardening | Doc-gen bugfix (strategic-context.md) + end-to-end smoke test | ✅ PASS |
| 103 | dashboard | Go-Live Readiness panel (env checklist, kill switches, pipeline status) | ✅ PASS |
| 104 | quality | Content quality scorer Stage 5.5 (14 scored → 4 filtered → 10 to editing) | ✅ PASS |
| 105 | publishing | Topic-aware hashtags (50-tag bank) + round-robin slot distribution (07/12/18/21) | ✅ PASS |
| 106 | quality | Caption dedup (Part N suffix) + InsightAgent speaker cap (MAX_PER_SPEAKER=3) | ✅ PASS |
| 107 | content+ops | Viral hook templates (24 templates, 6 formulas) + Publish History dashboard (Panel 15) | ✅ PASS |
| 108 | quality | Script validator Stage 6-validate (pre-editing gate) + ExperimentTracker Stage 9-experiment | ✅ PASS |
| 109 | dashboard | Experiments Panel 17 (formula pass-rate bars + top speakers) + validation error visibility | ✅ PASS |
| 110 | feedback+ops | Viral-topic feedback loop (TrendAgent +15 boost) + Phase 1.5 30-post projection in Panel 14 | ✅ PASS |
| 111 | operator+achiri | Telegram /status upgrade (ledger+experiments+readiness) + viral topic name fix + Achiri Phase 2A scaffold | ✅ PASS |
| 112 | achiri-voice | Achiri voice MVP — personality prompt (prompt.md) + conversation handler (index.ts) + checklist | ✅ PASS |
| 113 | achiri-llm | Achiri LLM wiring — Ollama (free/qwen3:4b) + Anthropic (paid/claude-haiku) + voice validation 10/10 | ✅ PASS |
| 114 | achiri-memory | Achiri memory subsystem — per-user JSONL history (memory-store.ts), 50-turn cap, 3-turn validation PASS | ✅ PASS |
| 115 | achiri-api | Achiri HTTP API — POST /chat Express server, PM2 achiri-api, 5/5 endpoint validation PASS | ✅ PASS |
| 116 | achiri-telegram | Achiri Telegram Bridge — /achiri command wired to conversation handler | ✅ PASS |
| 117 | experiment-meta | Experiment metadata fix — hook_formula + speaker via insight_id lookup, enrich publish-ledger | ✅ PASS |
| 118 | readiness-fix | Readiness parser fix — pipeline_runs_exist + current_posts(141) + current_qc_pass(100%) | ✅ PASS |
| 119 | ops | Gitignore + Manual Post Tracker — exclude pipeline artifacts, add manual post CLI | ✅ PASS |
| 120 | telegram | Telegram /status V2 — manual posts gate progress + smoke-test-latest.json report | ✅ PASS |
| 121 | ops | Video Review Script — list generated videos with hook_formula+speaker+QC for manual posting | ✅ PASS |
| 122 | achiri | Achiri Daily Message Limit — enforce messages_per_day per tier | ✅ PASS |
| 123 | T3-skill | achiri-safety skill — pre-flight content safety filter (T3 Skills #1/6) | ✅ PASS |
| 124 | T3-skill | eval-harness T3 skill — automated Achiri conversation quality scorer (#2/6) | ✅ PASS |
| 125 | T3-skill | derja-profiler T3 skill — Darija dialect and formality detection (#3/6) | ✅ PASS |
| 126 | T3-skill | paymee T3 skill — Achiri monetization (#4/6) | ✅ PASS |
| 127 | T3-skill | achiri-voice T3 skill — voice message processing (#5/6) | ✅ PASS |
| 128 | T3-skill | achiri-memory T3 skill — semantic memory search (#6/6) | ✅ PASS |
| 129 | achiri | Achiri Hetzner Deployment Package — public URL deploy script | ✅ PASS |
| 130 | achiri | Achiri HTTP Bridge — Telegram production wiring | ✅ PASS |
| 131 | achiri | Achiri Alpha Access Gate — Apr 25 alpha gating | ✅ PASS |
| 132 | gate | Phase 1.5 Gate Review — Apr 7 kill switch | ✅ PASS |
| 133 | housekeeping | Gate-tracker T3 PASS + /help update | ✅ PASS |
| 134 | ops | Daily Pipeline Digest — gate monitoring | ✅ PASS |
| 135 | achiri | Achiri /start Onboarding — alpha prep | ✅ PASS |
| 136 | achiri | Achiri Waitlist Command — alpha prep | ✅ PASS |
| 137 | ops | /waitlist export + smoke test cron | ✅ PASS |
| 138 | ops | Cadence tracker + /achiri-health | ✅ PASS |
| 139 | dashboard | Dashboard Achiri stats panel | ✅ PASS |
| 140 | telegram | /post-reminder Telegram command | ✅ PASS |
| 141 | ops | Pipeline health watchdog + dashboard parser fixes | ✅ PASS |
| 142 | telegram | /review Telegram command — top-3 QC-passed videos | ✅ PASS |
| 143 | telegram | /record Telegram command — record posted video to gate tracker | ✅ PASS |
| 144 | telegram | /update-views + daily-digest hint | ✅ PASS |
| 145 | gate | Gate urgency escalation in daily digest + gate regen cron | ✅ PASS |
| 146 | achiri | /invite-achiri + file-based runtime alpha whitelist | ✅ PASS |
| 147 | achiri | /deploy-status Achiri alpha deploy checklist | ✅ PASS |
| 148 | dashboard | Dashboard Achiri alpha panel + invite DM notification | ✅ PASS |
| 149 | stripe | Stripe go-live: webhook PM2 + /stripe-status | ✅ PASS |
| 150 | telegram | /queue posting queue: unposted videos + daily pace | ✅ PASS |
| 151 | ops | Daily digest: queue count + Stripe status | ✅ PASS |
| 152 | ops | Digest urgency fix: WARNING on 0 posts + inline top-3 queue | ✅ PASS |
| 153 | telegram | /tiktok-status TikTok live mode readiness checklist | ✅ PASS |
| 154 | telegram | /post-now manual posting assistant — file path + hashtags + /record shortcut | ✅ PASS |
| 155 | ops | Posting time reminders — noon + evening PM2 crons (posting-reminder.ts) | ✅ PASS |
| 156 | telegram | /caption command — ready-to-paste TikTok caption generator | ✅ PASS |
| 157 | ops | kognai-brief-regen PM2 cron — daily brief auto-regeneration at 06:45 | ✅ PASS |
| 158 | telegram | /pace command — dynamic posting pace calculator | ✅ PASS |
| 159 | telegram | /today command — daily operator morning cockpit | ✅ PASS |
| 160 | telegram | /viral command — trending topics content inspiration | ✅ PASS |
| 161 | ops | Enrich daily digest with viral topics | ✅ PASS |
| 162-264 | various | Sprints 162-264 (see git log) | ✅ PASS |
| 265 | telegram | Telegram operator commands (scripts/telegram-bot.ts backup) — /record, /queue, /review | ✅ PASS |
| 266 | ops | TikTok view count tracker — oEmbed auto-scrape + PM2 cron | ✅ PASS |
| 267 | telegram | Telegram /lastrun — pipeline execution summary | ✅ PASS |
| 268 | analytics | Pipeline metrics aggregator + /metrics command | ✅ PASS |
| 269 | revenue | Revenue tracking — /revenue command + financial gates | ✅ PASS |
| **270** | **?** | **NEXT** | ⏳ pending |

## SCS-001 Pipeline Architecture
12 stages, 11 agents:
`Trend → Discovery → ClipDetection → [Dedup] → Insight → Script → Editing → Caption → QC → Publishing → Analytics → Flywheel → FailureLibrary`

All agents located at: `agents/scs001-*/`

## Critical Gaps / Blockers
1. **TIKTOK_ACCESS_TOKEN** not in .env — live posting blocked (human must obtain from TikTok Developer Portal, video.upload scope). Use /post-now + /caption for manual posting workflow.
2. **Gate urgency: 0/30 posts, ~22 days to Apr 7** — operator must start posting MANUALLY NOW using /post-now
3. STRIPE_SECRET_KEY: SET ✅ | SUPABASE_URL: SET ✅ | YOUTUBE_API_KEY: SET ✅ | SCS_EDITING_MODE: SET ✅ — all resolved as of 2026-03-16

## Key File Locations
- Pipeline runner: `agents/scs001-orchestrator/run-pipeline.ts`
- Orchestrator: `agents/scs001-orchestrator/index.ts`
- PM2 config: `ecosystem.config.js` (scs001-pipeline + scs001-live processes)
- Model router: `runtime/router.py` (5-tier: Nano/Local/Power/Cloud/Apex)
- Gate reports: `workspace/gates/`
- Sprint JSONs: `workspace/sprints/`
- Progress log: `workspace/scs001/progress.md`

## Swarm Known Issues
- qwen3:14b times out on files >150 lines (e.g. editing/index.ts = 228 lines)
- 3 rejections = write directly. Large complex files = skip swarm, write directly.
- Swarm works well for: new single-file scripts <150 lines, stdlib-only, no class API surface to hallucinate

## Architecture Amendments (AMD-01 through AMD-12)
| AMD | Title | Status |
|-----|-------|--------|
| 01 | A2A / AP2 / x402 / ERC-8004 Protocol Integration | Active |
| 02 | Skill Bank & Knowledge Asset Layer | Active |
| 03 | Constitutional Framework | Active |
| 04 | Self Committed Swarms (SCS) | Active |
| 05 | IRL Intelligence Layer (Voxight X Oracle) | Active |
| 06 | Federated Modular Architecture | Active |
| 07 | Code Asset Library | Active |
| 08 | Monotask Mandate and Agent State Machine | Active |
| 09 | Agent Fusion Protocol | Active |
| 10 | Capability Atlas (COMMANDS.md) | Active |
| 11 | Builder Verification Service | Active |
| **12** | **Qwen Context Gateway (QCG)** | **Active (Mar 2026)** |

## Qwen Context Gateway (QCG) — AMD-12
- **Level 1 (Pre-Flight Brief)**: ✅ OPERATIONAL — `scripts/generate-sprint-brief.py` runs before each autonomous session. Output: `workspace/sprint-brief.md` (~2,500 tokens vs ~100K+ raw). 97% token reduction.
- **Level 2 (Query Gateway)**: PLANNED — HTTP service for agent queries against skill bank, AAR, failures
- **Level 3 (Orchestrator Integration)**: PLANNED — Wire into callLLM() for automatic context compression
- **Files**: `run-autonomous.sh` (pre-flight step), `autonomous-prompt.txt` (brief-first directive), `scripts/generate-sprint-brief.py` (generator)
- **Cost impact**: ~$14.25/day savings at 50 sessions/day. Target <5K input tokens per sprint cycle.
- **Doc**: `~/Documents/Kognai/Master Documents/kognai_architecture_amendment_12.docx`

## Infrastructure
- Mac Mini M4: local models qwen3:0.6b/4b/14b, deepseek-r1:14b (Ollama at 127.0.0.1:11434)
- Shared with Invoica: Hetzner VPS, Supabase, PM2, x402 protocol
- See: docs/shared-infra.md for details
