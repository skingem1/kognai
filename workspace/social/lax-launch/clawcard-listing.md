# LAX — ClaWHub Listing

**Name:** LAX — Latency-Aware Execution  
**Namespace:** `@godman-protocols/lax`  
**Version:** 0.2.0  
**License:** Apache 2.0  
**Tier:** T2 (infrastructure protocol)  
**Category:** Agent Infrastructure / Scheduling  

## Short description (140 chars)
Latency-aware task routing for AI agent swarms. SLA contracts, execution budgets, deterministic runtime selection.

## Full description
LAX is an open protocol that gives AI agents a standard way to make latency-aware routing decisions. Instead of hardcoding runtime URLs or silently routing to slow endpoints, agents express their latency requirements as a LatencyBudget and call routeTask() — LAX selects the fastest available runtime within budget.

**Key features:**
- `createBudget(maxMs, targetMs)` — define soft target + hard ceiling
- `routeTask(taskId, agent, budget, slots)` — deterministic runtime selection
- `registerSLA(agent, runtime, maxMs, rps)` — long-term SLA contracts
- `checkSLACompliance(sla, probe)` — continuous SLA monitoring
- Works with SIGNAL (emit breach events) and SCORE (latency reputation)

**Install:**
```bash
npx skills add https://github.com/godman-protocols/lax
```

## Tags
latency, scheduling, sla, routing, agent-infrastructure, godman-protocols
