# Kognai Sprint Brief
*Updated: 2026-03-19 — Sprint 185 done, OMEL Phase 2 COMPLETE*

---

## Current Status
- **Last completed sprint**: Sprint 185 (commit `c6000d8`)
- **Next sprint**: Sprint 186
- **Phase**: Phase 1 — Viral Detection Upgrade (Sprints 186–187)
- **Block**: BLOCK 4: Viral Detection (after OMEL Phase 2 ✅ COMPLETE)

---

## OMEL Phase 2 — COMPLETE ✅
Gate: `workspace/gates/omel-phase2-gate.json` → **PASS (45/45 tests)**

| Sprint | Module | Status |
|--------|--------|--------|
| 181 | PhantomWorkspace hardening | ✅ DONE |
| 182 | CredentialVault hardening | ✅ DONE |
| 183 | WipeWitness hardening + rollback | ✅ DONE |
| 184 | HumanBrake risk scoring + AAR | ✅ DONE |
| 185 | Integration test + AMD-13 gate | ✅ DONE |

**AMD-13 status**: IMPLEMENTED. All 5 OMEL components hardened and gate-passed.

---

## Sprint 186 — Viral Detection: Week 1 Quick Wins

**Type**: create + modify | **Agents**: coder (local)
**Sprint file**: `workspace/sprints/sprint-186.json`

### Context
Current ClipDetectionAgent scores clips via metadata proxies (view count, engagement).
The Viral Detection Upgrade Report adds a 9-method cascade. Week 1 = 3 highest-signal methods:
- **PySceneDetect** → `scene_density_score` (scene change rate)
- **librosa** → `audio_excitement` (audio energy/tempo)
- **OpenCLIP** → `clip_topic_alignment` (topic vs trending vector)

Composite: `partial_viral_score = clip_topic_alignment×0.35 + audio_excitement×0.35 + scene_density_score×0.30`

### Tasks

**186-01**: Create `scripts/scs001/viral-scorer.py`
- Python script (new file, <120 lines)
- 3 functions: `scene_density(video_path)`, `audio_excitement(video_path)`, `clip_topic_alignment(video_path, topics)`
- Uses: scenedetect, librosa, open_clip, numpy
- Main: reads JSON from stdin (`{video_path, topics}`), writes JSON to stdout (`{scene_density_score, audio_excitement, clip_topic_alignment, partial_viral_score, error?}`)
- Graceful: if dep missing, return score=0.5 (neutral) + log warning to stderr

**186-02**: Create `scripts/scs001/viral-scorer.ts`
- TypeScript wrapper (new file, <100 lines)
- Spawns `python3 scripts/scs001/viral-scorer.py` via child_process
- `score(videoPath: string, topics: string[]): Promise<ViralScoreResult>`
- Interface: `ViralScoreResult { scene_density_score, audio_excitement, clip_topic_alignment, partial_viral_score, error? }`
- Timeout: 30s. On error/timeout: returns neutral scores (0.5) + logs warning.

**186-03**: Extend clip schema + wire into ClipDetectionAgent
- File: `agents/scs001-clip-detection/index.ts` (currently 189 lines — SURGICAL ADD ONLY)
- Add to clip metadata type: `scene_density_score?: number`, `audio_excitement?: number`, `clip_topic_alignment?: number`, `partial_viral_score?: number`
- In scoring stage: after existing score, call `viralScorer.score(clip.localPath, trendingTopics)`
- Merge results into clip object
- Import `viralScorer` from `../../scripts/scs001/viral-scorer`
- **IMPORTANT**: File must stay <250 lines. If it grows beyond that, move viral scoring call into a helper.

### Success Criteria
- `scripts/scs001/viral-scorer.py` runs: `echo '{"video_path":"test.mp4","topics":["dance"]}' | python3 scripts/scs001/viral-scorer.py`
- `scripts/scs001/viral-scorer.ts` compiles: `npx tsc --noEmit`
- 3 new score fields present in clip metadata schema
- No TS errors in modified files

---

## Sprint 187 — Viral Detection: Full Cascade (AFTER 186)

**Type**: modify | After Sprint 186 ships
**Files**: `scripts/scs001/viral-scorer.py` (extend), `agents/scs001-clip-detection/index.ts` (extend)
**New methods**: DeepFace, NIMA, Whisper+LLM, OpenCV Optical Flow
**Full composite formula**: from Viral Detection Upgrade Report

---

## Environment
- Ollama models: qwen3:0.6b, qwen3:4b, qwen3:14b, qwen3:32b, deepseek-r1:14b
- ClawRouter v2.0: ALL LLM calls through routeCall() — §17 compliant
- OMEL Phase 2: HARDENED — all 5 components with rollback + audit
- TikTok: BLOCKED on API approval (submitted 2026-03-15)
- Plan B: /send-video Telegram command LIVE (commit f6b29e9)
- Python deps for Sprint 186: pip3 install scenedetect librosa open-clip-torch pillow
  → Run this BEFORE swarm executes Sprint 186

## Known Limits (FP-007)
- qwen3:14b destructively rewrites files >200 lines
- Keep ALL swarm tasks to new files or surgical adds to <200-line files
- 3 swarm rejections = write directly
- No external npm packages in swarm tasks (stdlib + existing deps only)

## Sprint History (last 5)
| Sprint | What | Status |
|--------|------|--------|
| 181 | OMEL PhantomWorkspace hardening | DONE |
| 182 | OMEL CredentialVault hardening | DONE |
| 183 | OMEL WipeWitness + rollback | DONE |
| 184 | OMEL HumanBrake risk scoring | DONE |
| 185 | OMEL Phase 2 gate (45/45 PASS) | DONE |

## Git State
- Latest: c6000d8 Sprint 181-185 DONE — OMEL Phase 2 hardening complete
- Branch: main, up to date
- Staged: nothing
