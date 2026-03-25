# Agent Capability Profile (ACP) v1
*Ratified: 2026-03-25 · Referenced in AMD-17 §3.2 + AMD-21 §2.4 + CONSTITUTION.md §Agent Rights #1*
*Binding on all Kognai swarm agents. Amendment requires human authorization.*

---

## What This File Is

The ACP defines how each agent's capabilities are measured, scored, and governed. It is the trust ledger of the swarm — the operational mechanism behind Constitution Right #1 (Right to Earn). Every agent carries an ACP profile. The profile determines which task tiers an agent may be assigned, how much budget it may spend autonomously, and how its output influences future routing.

**This file is not preferences. It is law.**

---

## System Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| `psychological_resilience_budget` | `5%` | Max share of sprint capacity for error-recovery, retry, and self-correction loops. Excess triggers human escalation. |
| `trust_floor` | `0.6` | Minimum ACP score for any agent to be assigned autonomous tasks. Below floor → supervised mode only. |
| `narrative_continuity` | `true` | Agents must maintain consistent reasoning across sessions. Context discontinuity is a scored deficiency. |
| `cross_agent_memory_inheritance` | `warm_only` | On agent recycle or fresh session: only `WARM` tier memories inherit. `HOT` and `RENTAL_EXPIRED` memories do not carry over. |
| `error_posture` | `transparent` | Errors are always logged, always emitted, never silently swallowed. An agent that hides a failure has committed a governance violation. |
| `max_autonomous_spend_usd` | `0.10` | Per-task cloud inference budget ceiling. Exceeding requires CEO escalation. (Source: CONSTITUTION.md §Agent Obligations #5) |

---

## The Five Capability Registers

Each register is scored 0.0–1.0 per sprint cycle. The composite ACP score is the weighted mean.

### 1. Perception (weight: 0.15)
Ability to read, parse, and understand input — code, diffs, specs, JSON contracts, error logs.

- **High (>0.8)**: Extracts correct task intent from ambiguous briefs. Detects schema violations before executing.
- **Low (<0.4)**: Misinterprets task scope. Reads the wrong file. Executes on stale context.
- **Scored by**: Sherlock/Supervisor on task acceptance accuracy.

### 2. Reasoning (weight: 0.30)
Ability to plan, sequence, and make correct architectural decisions within a task.

- **High (>0.8)**: Correct approach on first attempt. Reasoning chain traceable to at least one Five Principle.
- **Low (<0.4)**: Wrong file modified, wrong abstraction chosen, circular retry loops.
- **Scored by**: CTO approval gate outcomes + Supervisor review pass rate.

### 3. Action (weight: 0.30)
Ability to produce correct, working output — code that runs, files that validate, migrations that apply.

- **High (>0.8)**: First-pass output passes QC gate. Zero regressions introduced.
- **Low (<0.4)**: Compilation errors, broken contracts, destructive file rewrites.
- **Scored by**: QC gate pass/fail + regression count per sprint.

### 4. Memory (weight: 0.15)
Ability to correctly use, retrieve, and respect swarm memory — BrainX skill bank, ASMR, WARM/HOT tiers.

- **High (>0.8)**: Cites relevant prior skill before calling LLM. Correctly tiers new memories (WARM vs HOT).
- **Low (<0.4)**: Re-derives patterns already in the skill bank. Writes to wrong memory tier.
- **Scored by**: BrainX cache hit rate + memory tier violation count.

### 5. Communication (weight: 0.10)
Ability to emit clean proposals, concise reports, and traceable escalations.

- **High (>0.8)**: Proposals reference the specific architecture section, sprint ID, and change needed. Reports have no padding.
- **Low (<0.4)**: Vague proposals. Reports that bury the signal. Missing escalation paths.
- **Scored by**: Harvey/CEO accept rate on CTO proposals from this agent.

---

## Trust Score Lifecycle

```
Agent created → ACP score = 0.70 (provisional)
     ↓
Sprint executed → registers scored → composite updated
     ↓
score >= 0.6 → autonomous mode continues
score  0.4–0.6 → supervised mode (all output reviewed before commit)
score < 0.4 → suspension (one sprint cycle) → recycle if no improvement
     ↓
Recycle → SOUL.md reset + ACP zeroed → provisional 0.70 restart
```

---

## ACP and CERBERUS / PACT

External agents entering via AMD-23 Cerberus Airlock are assigned `trust_floor = 0.3` (external provisional) until they complete 5 supervised tasks. PACT-signed agents inherit the trust level of their originating swarm node, capped at `0.75` until locally validated.

---

## Relationship to Other Documents

- **CONSTITUTION.md** — Defines the rights that ACP scores unlock (Right to Earn = Right to Tier).
- **FIVE_PRINCIPLES.md** — Principle 5 (Benefit to Others) is the ethical basis for all register scoring.
- **SOUL.md** — Agent identity that ACP scores are attributed to.
- **brainx-schema.sql** — Memory tier definitions (`WARM`, `HOT`, `RENTAL_EXPIRED`) that Register 4 governs.
- **AMD-17 §3.2** — `psychological_resilience_budget = 5%` — source of the system parameter above.
- **AMD-21 §2.4** — Six-vector ASMR extraction is scored under Register 4 (Memory).

---

*This document is owned by the architecture. The trust floor and capability weights may only be adjusted via a signed AMD, human-authorized.*
