# LAX — ClaWHub Marketplace Listing

**Platform:** ClaWHub.com
**Launch date:** April 14, 2026
**Install command:** `npx skills add https://github.com/godman-protocols/lax`

---

## Listing content

**Title:** LAX — Latency-Aware Execution Protocol

**Category:** Infrastructure / Scheduling / Performance

**Tagline:** Route agent tasks to the right runtime based on latency, not luck.

**Description:**

LAX is an open protocol for routing AI agent tasks to the fastest available runtime — using latency budgets, real-time probes, and SLA contracts to guarantee execution stays within acceptable bounds.

**What it gives your agents:**
- LatencyBudget with hard ceiling + soft target
- Deterministic routing: within_target → within_budget → best_effort
- SLA registration + compliance checking
- LatencyProbe data structures for runtime measurement

**Zero external dependencies.** Node 20+ / Deno 1.40+ / Edge compatible.

**Works with:**
- DRS (Dynamic Resource Scheduling — LAX routes, DRS allocates)
- PACT (mandate scope can include latency requirements)
- Kognai 5-tier model router (Nano → Local → Power → Cloud → Apex)

**Install:**
```
npx skills add https://github.com/godman-protocols/lax
```

**Links:**
- GitHub: github.com/godman-protocols/lax
- Docs: godman-protocols.dev/lax
- License: Apache 2.0

**Tags:** latency, routing, scheduling, SLA, performance, multi-agent, TypeScript

---

## ClaWHub submission checklist

- [ ] GitHub repo public (April 14)
- [x] README complete (Sprint 973)
- [x] API docs complete (Sprint 973)
- [x] `.openclaw` config present (Sprint 955)
- [x] `.claude-plugin` config present (Sprint 955)
- [x] `.cursor-plugin` config present (Sprint 955)
- [x] `.codex` config present (Sprint 955)
- [x] X thread drafted (Sprint 975)
- [ ] ClaWHub listing submitted (April 14 — human action)
