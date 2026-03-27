# INTEL-023: ARC-AGI-3 Game Taxonomy + KSL Mapping

> **Harvey (CEO Intelligence)** | **Date:** 2026-03-27 | **Status:** Complete
> **Source:** François Chollet (ARC Prize 2026) · AMD-26 (KSL Simulation Layer) · TICKET-015 (Path A locked by Godman 2026-03-27)

---

## Background

François Chollet released ARC-AGI-3, an interactive reasoning benchmark where agents play novel game environments in real-time. ARC Prize 2026 (Kaggle competition) is active. Godman locked **Path A** on 2026-03-27: integrate ARC-AGI-3 SDK into KSL harness for internal benchmarking only. No public competition entry.

Path B (Kaggle competition entry) is deferred until after first KSL cycle produces measurable improvement.

---

## What ARC-AGI-3 Is

| Attribute | Detail |
|-----------|--------|
| **Creator** | François Chollet (Google DeepMind, ARC Prize) |
| **Type** | Interactive reasoning benchmark (agent plays game environments in real-time) |
| **Competition** | ARC Prize 2026 (Kaggle, active now) |
| **Scoring** | Skill acquisition efficiency vs. humans across novel environments |
| **Key insight** | Game environments resist memorisation — each game is genuinely novel |

---

## Five Dimensions Tested by ARC-AGI-3

| Dimension | ARC-AGI-3 Tests | KSL AMD-26 Trains |
|-----------|----------------|-------------------|
| **Exploration** | Novel environment discovery without prior knowledge | Scenario exploration in KSL harness |
| **Percept → Plan → Action** | Real-time perception + planning loop | Integrative Thinking (Resolution Type C) |
| **Memory** | Retaining learned patterns across episodes | AMD-21 ASMR six-vector extraction |
| **Goal Acquisition** | Inferring latent objectives from environment rewards | AMD-26 scenario design |
| **Alignment** | Staying on-task under distribution shift | ACP constitutional filter |

**Verdict: ARC-AGI-3 tests the exact five dimensions KSL is designed to train. Strong structural fit.**

---

## Game Taxonomy (Relevant to KSL)

ARC-AGI-3 games fall into three structural categories relevant to KSL scenario design:

### Category 1: Pattern Recognition + Transformation
- Agent observes a grid/state, infers a transformation rule, applies it
- KSL mapping: Integrative Thinking scenarios (first LoRA adapter, AMD-26 §4.1)
- Training value: High — directly exercises Type C resolution (novel rule synthesis)

### Category 2: Sequential Goal Pursuit
- Agent must achieve a multi-step objective under partial information
- KSL mapping: Sherlock-style deduction chains + PACT negotiation transcripts
- Training value: High — aligns with perm-judge evaluation (plan quality)

### Category 3: Adversarial / Distribution-Shift Games
- Environment changes rules mid-game; agent must detect and adapt
- KSL mapping: AMD-20 RL continuous mode (Sprints 515-518)
- Training value: Medium — deferred to Phase 3 RL cycle

---

## Path A Implementation Plan (MacGyver-Executable After INTEL-023)

| Step | Task | Prerequisite |
|------|------|-------------|
| 1 | `pip install arc-agi` + validate env (qwen3:14b, Mac Mini M4 Pro) | — |
| 2 | Baseline scorecard: qwen3:14b base on 3 Category 1 games | Step 1 |
| 3 | Store baseline in `workspace/ksl/arc-agi3-baseline.json` | Step 2 |
| 4 | Wire game runner into KSL harness as scenario source | Step 3 |
| 5 | Run 10 KSL training scenarios from ARC-AGI-3 Category 1 | Step 4 |
| 6 | Fine-tune LoRA adapter (AMD-15 pipeline) | Step 5 |
| 7 | Re-score on same 3 games — before/after delta = proof of improvement | Step 6 |

**Target outcome:** ≥6 Type C resolutions out of 10 scenarios (AMD-26 MVE gate, §5.2).

---

## Path B Risk Assessment (Deferred)

| Risk | Impact | Notes |
|------|--------|-------|
| Poor public leaderboard | High — credibility damage | Mid-table on Kaggle = market signal of under-performance |
| Competitor copies approach | Medium | AMD-26 + LoRA is the moat, not the score itself |
| Distraction from April 7 gate | High | Path A first. Path B only after first LoRA cycle |

**Godman decision (locked 2026-03-27):** Path A only. No competition entry until KSL produces measurable before/after delta.

---

## Strategic Value

1. **External proof of AMD-15 LoRA improvement** — ARC-AGI-3 score delta is auditable by third parties without exposing proprietary training data
2. **Free simulation environments** — Zero cost, infinitely varied, resist memorisation — solving the core KSL scenario diversity problem
3. **Genesis Ceremony data** — qwen3:14b before/after ARC-AGI-3 scores are strong Genesis Ceremony evidence (Month 10 ratification)
4. **AMD-26 accelerator** — Reduces manual scenario design burden (AMD-26 §3.3) by providing category 1+2 environments for free

---

## Recommended Actions

| Action | Agent | Priority |
|--------|-------|---------|
| `pip install arc-agi` + validate qwen3:14b integration | MacGyver | P1 — next sprint |
| Baseline scorecard on 3 Category 1 games | MacGyver | P1 — after install |
| Store baseline in `workspace/ksl/arc-agi3-baseline.json` | MacGyver | P1 |
| Update AMD-26 scenario sourcing to reference ARC-AGI-3 | MacGyver | P2 |
| Defer Path B Kaggle entry until after first LoRA cycle | Godman | Already locked |

---

*Intel brief compiled by Harvey · 2026-03-27 · Sources: ARC Prize 2026, AMD-26 KSL Simulation Layer, TICKET-015 resolution, AMD-15 LoRA Pipeline*
