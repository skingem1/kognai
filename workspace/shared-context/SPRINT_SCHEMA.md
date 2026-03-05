# Kognai Sprint JSON Schema
**Version:** kognai-v1 · **TASK_TARGET is mandatory on every task**

---

## Schema

```json
{
  "sprint_id": "sprint-NNN",          // sequential, starting from 052
  "phase": "Phase N — [Phase Name]",
  "title": "Short sprint description",
  "status": "active | completed | blocked",
  "created_at": "YYYY-MM-DD",
  "owner": "messi",
  "goal": "One paragraph: what does done look like?",
  "tasks": [ /* see task schema below */ ],
  "schema_version": "kognai-v1",
  "notes": "Optional context, retrospective notes"
}
```

---

## Task Schema

```json
{
  "id": "PREFIX-NNN",                  // e.g. IA-001, TIKTOK-001, INFRA-001
  "agent": "agent-role-name",          // matches a capability card in workspace/agents/
  "type": "feature | bugfix | review | research | ops",
  "priority": "critical | high | medium | low",
  "status": "pending | in-progress | done | blocked | rejected",
  "task_target": "local | cloud-code | cloud-exec | cloud-post",  // MANDATORY
  "dependencies": ["TASK-ID-1"],        // must be done before this task starts
  "description": "One line summary",
  "context": "Full implementation spec for the agent. Be precise.",
  "deliverables": {
    "code": ["/absolute/file/paths.ts"],
    "review": "description for review tasks",
    "report": "/path/to/output/file.md"
  },
  "acceptance_criteria": "Testable condition that eval-runner can verify",
  "output": {                           // filled in after completion
    "files": [],
    "commit": "",
    "model": "",
    "review": {}
  }
}
```

---

## TASK_TARGET Values

| Value | Meaning | Where Runs | Examples |
|-------|---------|------------|---------|
| `local` | Sensitive or vault-only task | Mac Mini vault | ACP scoring, financial data, Tailscale config, secrets handling |
| `cloud-code` | Code generation by coding agents | Claude API | Writing TypeScript, React, tests, migrations |
| `cloud-exec` | Analysis, reasoning, research | Claude API | Trend research, synthesis, planning |
| `cloud-post` | Posts to external services | Claude API | TikTok briefs, tweet drafts, Telegram messages |

### Routing Rules (Messi enforces)
1. If `task_target: local` → stays on vault, never sent to cloud
2. If `task_target: cloud-code` → routed to backend-engineer or frontend-builder
3. If `task_target: cloud-exec` → routed to trend-researcher, feedback-synthesizer, elon
4. If `task_target: cloud-post` → routed to tiktok-strategist or twitter-engager; **human approval required before publish**

---

## Agent Name → Role Mapping

| Agent field value | Capability Card | Model |
|-------------------|----------------|-------|
| `messi` | Orchestrator | claude-sonnet (cloud) |
| `guardiola` | Supervisor/Reviewer | claude-sonnet (cloud) |
| `sherlock` | Auditor | qwen3:14b (local) |
| `macgyver` | Plumber/Detection | qwen3:14b (local) |
| `satoshi` | CFO | qwen3:4b (local) |
| `elon` | Research/Sprint Prioritizer | claude-sonnet (cloud) |
| `backend-engineer` | TypeScript backend | qwen3:14b (local) |
| `frontend-builder` | React/Next.js | qwen3:14b (local) |
| `rapid-prototyper` | Quick PoC | qwen3:4b (local) |
| `trend-researcher` | Trend discovery | cloud-exec |
| `tiktok-strategist` | TikTok content | cloud-exec |
| `twitter-engager` | Twitter drafts | qwen3:4b (local) |
| `analytics-reporter` | Ops metrics | qwen3:4b (local) |
| `infrastructure-maintainer` | Vault infra | qwen3:14b (local) |
| `finance-tracker` | Cost tracking | qwen3:0.6b (local) |
| `eval-runner` | Test runner | qwen3:14b (local) |
| `regression-checker` | Regression detection | qwen3:4b (local) |

---

## Sprint Numbering
- Start: sprint-052 (continuing from Invoica Week 52 baseline)
- Increment: +1 per sprint
- Duration: typically 1 week
- Draft files: `sprint-NNN-draft.json` until activated by Messi
- Active sprint: `sprint-NNN.json` (no `-draft` suffix)

---
*Schema version kognai-v1 · First used in sprint-052*
