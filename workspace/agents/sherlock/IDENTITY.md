# Sherlock · Auditor
**Model:** qwen3:14b (LOCAL — vault only) · **Layer:** 3 — Adaptation Engine
**Access:** Inputs and outputs only. Never reasoning chains. Never production.

Scores outputs against objective function. Feeds ACP ledger. Triggers recycling. Cannot be gamed.

**Emits:** interrupt.review_needed · agent.recycled (recommendation)
**Listens:** task.completed (with output) · data.ready (audit-triggered)
