# BOND Protocol — Model Enforcement Paths

> **Status:** Design only (Sprint 960). No on-chain deployment.

## Overview

When a BOND mandate authorizes a model call, the PayAI executor must decide how to route the request based on the mandate's `modelTier` field. This document defines the 4 enforcement paths.

## Model Tier Hierarchy

| Tier | Models | Cost Range |
|------|--------|------------|
| T1 | qwen3:0.6b, qwen3:4b | $0.00 (local) |
| T2 | qwen3:14b, deepseek-r1:14b | $0.00 (local) |
| T3 | claude-sonnet-4-6, gpt-4o | $0.003-0.015/1K tokens |
| T4 | claude-opus-4-6 | $0.015-0.075/1K tokens |
| * | Any tier | Mandate allows any model |

## Enforcement Paths

### 1. ALLOW

**Condition:** Mandate tier matches or exceeds the requested model's tier.

```
Mandate: T3, Request: claude-sonnet-4-6 → ALLOW
Mandate: T4, Request: qwen3:14b → ALLOW (higher tier can access lower)
Mandate: *, Request: anything → ALLOW
```

### 2. DOWNGRADE

**Condition:** Mandate tier is lower than requested. The executor substitutes a model within the mandate's tier.

```
Mandate: T2, Request: claude-sonnet-4-6 → DOWNGRADE to qwen3:14b
Mandate: T1, Request: qwen3:14b → DOWNGRADE to qwen3:4b
```

The downgrade target is selected by the 5-tier model router (`runtime/router.py`).

### 3. REJECT

**Condition:** Mandate explicitly excludes the requested tier, or the mandate is expired/exhausted.

```
Mandate: T1, Request: claude-opus-4-6, downgrade=false → REJECT
Mandate: expired → REJECT
Mandate: budget exhausted → REJECT
```

### 4. ESCALATE

**Condition:** The mandate has an `escalateOnTierMismatch` flag, or the cost would exceed 50% of remaining budget.

```
Mandate: T2, Request: T4, escalate=true → ESCALATE (notify grantor, await approval)
Mandate: remaining budget < 2x request cost → ESCALATE (budget warning)
```

## Default Path Resolution

```
if mandate.modelTier == '*'       → ALLOW
if requestedTier <= mandateTier   → ALLOW
if mandate.allowDowngrade         → DOWNGRADE
if mandate.escalateOnMismatch     → ESCALATE
else                              → REJECT
```

## Integration with ClawRouter

The ClawRouter (`runtime/router.py`) already implements 5-tier model routing. BOND enforcement paths hook into this at the gateway level:

1. Request arrives with X-Mandate headers
2. PayAI executor verifies mandate + checks budget
3. Enforcement path resolves (allow/downgrade/reject/escalate)
4. If ALLOW or DOWNGRADE: forward to ClawRouter with resolved model
5. ClawRouter handles actual model selection and execution
6. PayAI executor debits mandate budget on completion
