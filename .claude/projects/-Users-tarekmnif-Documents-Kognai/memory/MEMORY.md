# KOGNAI SESSION MEMORY
*Last updated: Sprint 098 — 2026-03-16*

---

## Current Phase
**Phase 1 — Active** (Mar 17 – Apr 11 2026) | TikTok content pipeline (€9/mo)
- Phase 0→Phase 1 gate: **PASSED** (2026-03-16, sprint-096)
- Blocker: TIKTOK_ACCESS_TOKEN not set in .env (human action required)
- Production mode: set `SCS_EDITING_MODE=production` + `TIKTOK_ACCESS_TOKEN` in .env

## Kognai State
- Last commit: 3216424 (Sprint 101 shipped 2026-03-16)
- Sprint numbering: Invoica legacy 001-062e → Kognai starts 063+
- Current sprint: 102 (next)
- Gate reports: workspace/gates/phase0-phase1-gate.json, workspace/gates/phase1-activation-readiness.json, workspace/gates/production-quality-check.json

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
| **102** | **?** | **NEXT** | ⏳ pending |

## SCS-001 Pipeline Architecture
12 stages, 11 agents:
`Trend → Discovery → ClipDetection → [Dedup] → Insight → Script → Editing → Caption → QC → Publishing → Analytics → Flywheel → FailureLibrary`

All agents located at: `agents/scs001-*/`

## Critical Gaps / Blockers
1. **TIKTOK_ACCESS_TOKEN** not in .env — live posting blocked (human must obtain from TikTok Developer Portal, video.upload scope)
2. **SUPABASE_URL + SUPABASE_SERVICE_KEY** not in .env — video hosting blocked
3. **YOUTUBE_API_KEY** not in .env — live trends/real video search blocked (free at console.cloud.google.com)
4. **SCS_EDITING_MODE** not in .env — production video quality not active (set to 'production')
5. **OpenClaw v2026.3.7** + T2 Skills — deferred to Sprint 102+ (gate-tracker.md shows both Deferred)
6. **generate-daily-brief.py** overwrites strategic-context.md — needs fixing before next run
7. **Run setup when env vars are set**: `bash scripts/setup-phase1.sh`

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

## Infrastructure
- Mac Mini M4: local models qwen3:0.6b/4b/14b, deepseek-r1:14b (Ollama at 127.0.0.1:11434)
- Shared with Invoica: Hetzner VPS, Supabase, PM2, x402 protocol
- See: docs/shared-infra.md for details
