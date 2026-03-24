# DRS — X Launch Thread
**Account:** @invoica_ai  
**Date:** April 2026 (week 6 after PACT launch)  
**Format:** 6-tweet thread  

---

## Tweet 1 — Hook

Three AI agents. One Mac Mini M4. All trying to use the local model at once.

Who gets the inference slot? Who waits? Who gets preempted when something critical fires?

We just open-sourced the scheduler that decides.

DRS — Dynamic Resource Scheduling. 🧵

---

## Tweet 2 — The problem

Multi-agent systems compete for limited compute:

→ No capacity tracking — agents allocate blindly until OOM
→ No cost ceilings — a runaway agent burns your API budget overnight
→ No preemption — a stuck low-priority job blocks critical-path tasks forever

---

## Tweet 3 — What DRS does

DRS gives agents a standard way to request, hold, and release compute:

- Register pools (local model, cloud API, GPU)
- Allocate with constraints: latency, cost, priority
- Auto-expiry prevents capacity leaks
- Priority preemption: CRITICAL beats MEDIUM, always

---

## Tweet 4 — The code

```typescript
const alloc = scheduler.allocate({
  requestingAgent: 'did:kognai:messi',
  poolId: qwenPool.id,
  unitsRequested: 2,
  priority: 'medium',
  maxLatencyMs: 200, maxCostUsdc: 0,
  requestedAt: new Date().toISOString(),
});
// null if constraints can't be met
```

---

## Tweet 5 — Preemption

When Harvey fires a CRITICAL task while Guardiola holds all the slots:

```typescript
scheduler.preempt(guardiolaAlloc.id, { priority: 'critical', ... });
// Guardiola → 'preempted', Harvey → 'active', capacity reclaimed
```

Priority wins. The scheduler is honest about why.

---

## Tweet 6 — CTA

DRS is protocol 5 of 7 from Godman Protocols.

Compute scheduling for agent swarms — the missing infrastructure primitive.

GitHub: github.com/godman-protocols/drs
ClaWHub: [ClaWHub link]
Install: npx skills add https://github.com/godman-protocols/drs

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 233 | ✓ |
| 2 | 213 | ✓ |
| 3 | 230 | ✓ |
| 4 | 212 | ✓ |
| 5 | 196 | ✓ |
| 6 | 195 | ✓ |
