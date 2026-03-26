# Rule 4 — Context Hygiene Standard

**Rule:** Every agent prompt must declare its `## Input Context` scope.
**Enforced by:** Sherlock auditor via `scripts/governance/context-hygiene-audit.ts`
**Log:** `logs/context-hygiene/YYYY-MM-DD.jsonl`

## Why

Context bleed occurs when an agent reads inputs outside its declared scope — e.g., a TikTok
content agent accidentally receiving financial ledger data. Undeclared context creates
unpredictable agent behaviour and violates the principle of least privilege.

## Template (paste into your agent's prompt.md)

```markdown
## Input Context

- **Allowed inputs:** [list the exact files, env vars, or data streams this agent may read]
- **Forbidden inputs:** [list inputs this agent must NEVER touch — even if available]
- **Contamination triggers:** [conditions that indicate context bleed and require an audit log]
```

## Examples

### Compliant — scs001-script

```markdown
## Input Context

- **Allowed inputs:** viral-topics.jsonl, calibration-clips/, SOUL.md, USER.md
- **Forbidden inputs:** achiri/* memory, stripe/*, financial ledger, CEO conversations
- **Contamination triggers:** reading any file outside workspace/scs001/ without an explicit flag
```

### Non-compliant — generic supervisor

```markdown
# Supervisor Agent — Code Review

You are the Supervisor for the Countable project...
```

Missing the `## Input Context` section entirely. The auditor will flag this agent with
`risk_level: "undeclared"`.

## Severity Levels

| Level | Meaning |
|-------|---------|
| `compliant` | Agent has a valid `## Input Context` section |
| `undeclared` | Agent has no context scope declaration — must be added |

## Audit Schedule

The auditor runs as part of the governance hook. Results accumulate in
`logs/context-hygiene/YYYY-MM-DD.jsonl`. Each line is one audit run with full agent list.
