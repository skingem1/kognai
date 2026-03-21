# EVAL-001 — OpenViking Evaluation for Skill Bank

**Date:** 2026-03-22
**Evaluator:** CTO Agent (via deepseek-r1:14b analysis + web research)
**Sprint:** 653

## Subject

**OpenViking** by ByteDance/Volcengine — open-source context database for AI agents.
- GitHub: volcengine/OpenViking
- License: Apache 2.0
- Stars: ~4,700+ (fast-growing, launched Jan 2026)
- Version: 0.1.19.dev (pre-1.0)

## Evaluation Criteria

### 1. Python SDK + ARM64 (Mac Mini M4 Pro)

| Criterion | Result |
|-----------|--------|
| Python SDK available | ✅ `pip install openviking`, Python 3.10+ |
| ARM64 support | ⚠️ Likely compatible (ARM Kunpeng optimizations exist), needs source build test |
| Dependencies | Go 1.22+, GCC 9+/Clang 11+ (available on macOS) |

**Assessment:** SDK is pip-installable. ARM64 on M4 Pro should work via source build but no explicit M4 test exists. **PARTIAL** — needs verification install.

### 2. Skill Bank Mount

| Criterion | Result |
|-----------|--------|
| Skill storage namespace | ✅ `viking://agent/skills/` is first-class |
| Skill format | ✅ SKILL.md with YAML frontmatter |
| OpenClaw integration | ✅ Native — `openclaw_openviking_skill` published |
| Semantic skill search | ✅ Vector retrieval built in |
| Tiered access | ✅ L0 (100 tokens) → L1 (2k) → L2 (full) |

**Assessment:** This is the intended use case. OpenViking was designed as the skill storage layer for OpenClaw agents. **STRONG FIT.**

### 3. Memory Architecture

| Category | Mapping | Status |
|----------|---------|--------|
| Episodic | Events + Cases | ✅ |
| Semantic | Entities + Profile | ✅ |
| Procedural | Patterns + Skills | ✅ |
| Preferences | Preferences directory | ✅ |

**Assessment:** 6 memory categories auto-extracted at session end. Maps cleanly to BrainX memory types. **STRONG FIT.**

### 4. Distillation Hook

| Criterion | Result |
|-----------|--------|
| Auto-compression | ✅ L0/L1/L2 tiering is built-in distillation |
| Session-end extraction | ✅ MemoryExtractor runs automatically |
| Mid-session hook | ❌ No arbitrary `compress()` API |
| External callable | ❌ Distillation is lifecycle-bound |

**Assessment:** Distillation is built-in but not arbitrarily callable. Sufficient for Kognai since orchestrator has session boundaries. **PARTIAL** — adequate for our needs.

### 5. Production Readiness

| Criterion | Result |
|-----------|--------|
| Team backing | ✅ ByteDance Volcengine — TikTok vector search since 2019 |
| Documentation | ✅ Mintlify docs site, DeepWiki architecture docs |
| License | ✅ Apache 2.0 |
| Security | ⚠️ CVE-2026-22207 (root API key bypass) — patched in 0.1.19 |
| API stability | ❌ Pre-1.0, breaking migrations between versions |
| Community | ⚠️ Active but young (Lark + WeChat groups) |

**Assessment:** Production-backed team, but pre-1.0 with breaking changes. Pin version, set root_api_key. **PARTIAL** — ready for dev/staging, not mission-critical prod yet.

## Overall Scorecard

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Python SDK + ARM64 | 7/10 | 20% | 1.4 |
| Skill Bank Mount | 10/10 | 30% | 3.0 |
| Memory Architecture | 9/10 | 20% | 1.8 |
| Distillation Hook | 6/10 | 15% | 0.9 |
| Production Readiness | 5/10 | 15% | 0.75 |
| **Total** | | | **7.85/10** |

## Recommendation

### **PARTIAL ADOPT**

**Rationale:**
- OpenViking is architecturally the best fit for Kognai's Skill Bank — it is literally the OpenClaw skill storage layer
- Memory architecture maps cleanly to BrainX types (episodic/semantic/procedural)
- Pre-1.0 status and breaking migrations make full adoption risky right now
- Saves 4-5 sprints if we use it instead of building our own skill filesystem

**Action Plan:**
1. **Now:** Pin version 0.1.19, test install on Mac Mini M4 Pro
2. **If install works:** Wire into Skill Bank as read layer (Kognai skills registered via OpenViking)
3. **Keep BrainX:** Retain BrainX for episodic memory (pgvector, already working). Use OpenViking for skill discovery only.
4. **Do NOT migrate BrainX to OpenViking** — the memory subsystem is already working. Only use OpenViking for what it's best at: skill/resource filesystem.
5. **Security:** Set `root_api_key` in config immediately on install

**Blockers for FULL ADOPT:**
- ARM64 install verification (1 sprint)
- API stability (wait for 1.0)
- Breaking migration risk (unacceptable for production memory store)

---

*Evaluation cost: $0.00 (web research + local analysis)*
