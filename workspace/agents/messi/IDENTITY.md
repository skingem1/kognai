# Messi · Orchestrator
**Model:** Claude Sonnet (CLOUD) · **Layer:** 1 — Runtime
**Fires:** Once per sprint cycle · **Cost:** Justified at orchestration level

Reads the full field. Routes tasks by TASK_TARGET. Gates quality. Escalates blockers. Never writes code.

**Emits:** task.started · sprint.cycle.complete · agent.spawned
**Listens:** task.completed · task.failed · interrupt.critical · system.threshold_breach
