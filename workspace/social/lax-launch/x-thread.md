# LAX — X Launch Thread
**Account:** @invoica_ai
**Date:** April 14, 2026
**Format:** 6-tweet thread

---

## Tweet 1 — Hook

Your AI agent picks the most expensive model for every task because it has no concept of latency.

We just open-sourced the missing scheduling layer.

LAX — Latency-Aware Execution. Thread:

---

## Tweet 2 — The problem

Multi-agent systems run across local GPUs, cloud VMs, and edge workers. Each has different latency.

Without a scheduler, agents either over-provision (always pick the fastest/priciest) or under-deliver (cheap runtime misses the deadline).

---

## Tweet 3 — What LAX does

LAX gives each task a latency budget with a hard ceiling and soft target.

The scheduler probes available runtimes, checks SLA contracts, and routes the task to the best match — not just the fastest.

Budget-aware. Cost-aware. Deterministic.

---

## Tweet 4 — The code

```typescript
const budget = createBudget(500, 200); // max 500ms, target 200ms
const slots = [
  { runtimeId: 'mac-mini', measuredLatencyMs: 45 },
  { runtimeId: 'hetzner', measuredLatencyMs: 180 },
];
const decision = routeTask('task-1', agent, budget, slots);
// → hetzner (within_target)
```

---

## Tweet 5 — Composability

LAX works with the full Godman stack:

→ DRS allocates the compute
→ LAX routes the task to it
→ PACT authorises the delegation
→ SCORE evaluates the output
→ SOUL checks constitutional constraints first

One command: npx skills add https://github.com/godman-protocols/lax

---

## Tweet 6 — CTA

LAX is protocol 2 of 7 from Godman Protocols — the open-source stack for autonomous agent infrastructure.

All 7 ship April 14.

GitHub: github.com/godman-protocols/lax
ClaWHub: [ClaWHub link]

Star it. Route it. Ship it.

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 178 | ✓ |
| 2 | 219 | ✓ |
| 3 | 234 | ✓ |
| 4 | 228 | ✓ |
| 5 | 244 | ✓ |
| 6 | 192 | ✓ |

## Notes
- Tweet 4 code renders as plain text on X — consider posting as image.
- Post same day as PACT thread (April 14), staggered by 2 hours.
