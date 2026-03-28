# Thinking Mode Rules — Kognai Rules Library

**Rule ID:** RULE-THINK-001
**Source:** TICKET-021 — witcheer Mac Mini M4 operational lessons (Lesson 1)
**Author:** Chomsky (Prompt Engineer)
**Created:** 2026-03-28

---

## The 10 /think Call Limit

### Rule

No agent session may issue more than **10 `/think` calls** before performing a mandatory reset.

On reaching the 10th `/think` call in a session, the agent must:

1. Log the session's reasoning chain summary to `workspace/agents/memory/<agent>-think-log-YYYY-MM-DD.md`
2. Clear working context of accumulated reasoning state
3. Restart from the current task specification only
4. Record the reset event in the session log with timestamp

### Why This Exists

`/think` calls on the Mac Mini M4 running `qwen3:14b` accumulate silently. Each call consumes thermal budget and working memory. After ~10 calls in one session, two failure modes emerge:

- **Thermal throttling**: The M4 chip reduces clock speed to manage heat. Subsequent reasoning quality degrades without any visible signal to the operator.
- **Context drift**: Each `/think` call loads and reprocesses accumulated context. By call 10+, the model is reasoning about its own reasoning chains rather than the original task. Output quality collapses.

These failure modes are invisible in log output. The agent appears to be working while producing degraded or circular results.

---

## When to Use /think vs Not

### Use /think when:

- Evaluating a complex architectural decision with ≥3 competing trade-offs
- Parsing an ambiguous instruction where the wrong interpretation has irreversible consequences
- Planning a multi-file surgical edit (10+ files affected)
- Deciding whether to escalate to a higher tier (T2 → T3) — the call must be justified
- Reviewing a sprint against constitutional constraints before approval

### Do NOT use /think when:

- Executing a deterministic write task (EXACT CONTENT mode)
- Parsing structured JSON or YAML with a known schema
- Fetching and summarising a single document
- Performing a routine health check
- Responding to a status query

**Default posture: do not use /think unless the task is genuinely ambiguous or consequential.**

Overuse of `/think` on routine tasks is the primary cause of the 10-call limit being hit prematurely. Reserve it.

---

## Session Reset Protocol

When the 10-call limit is reached:

```
THINK-LIMIT REACHED (10/10)
Logging reasoning chain → workspace/agents/memory/<agent>-think-log-YYYY-MM-DD.md
Performing session context reset.
Reloading from: [current task spec only]
Think counter reset to 0/10.
```

The agent must NOT carry forward:
- Previous `/think` chain outputs
- Intermediate conclusions that were not written to a file
- Any assumption made inside a `/think` block that was not validated externally

After reset, the agent resumes from the written task specification as if starting fresh.

---

## Mac Mini M4 Thermal Context

`qwen3:14b` is the heaviest local model in the vault. On the Mac Mini M4 Pro:

- Sustained inference at full context (128K tokens) draws ~40W from the Neural Engine
- Back-to-back `/think` calls without pause can sustain this load for minutes at a time
- macOS thermal management throttles the Neural Engine clock before any user-visible alert appears
- Batch tasks using `/think` loops should be scheduled during off-peak hours (see `RULE-THERMAL-001` in `rules/mac-mini-scheduling.md`)

The 10-call limit functions as a **thermal circuit breaker** as much as a reasoning quality guardrail.

---

## Related Rules

- `RULE-THERMAL-001` — Mac Mini batch scheduling (off-peak hours for heavy inference)
- `RULE-INTEL-001` — Intel brief research protocol (source diversity, write-back)
- `RULE-SESSION-001` — Stale context re-verification requirement

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-28 | Initial version — TICKET-021 | Chomsky |
