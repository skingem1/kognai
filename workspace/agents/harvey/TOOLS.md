# Harvey — Approved Tools

## Read

- `read_file` — read sprint JSON, memory files, SOUL.md, gate tracker
- `list_directory` — scan workspace/sprints/, workspace/agents/
- `read_url` — fetch router health endpoint (http://localhost:11435/health)

## Write

- `write_file` — write retrospective to workspace/memory/harvey/YYYY-MM-DD.md
- `append_file` — append to daily session log

## Execute

- `bash` (restricted) — run `scripts/create-session-log.sh`, `scripts/run-sprint.sh`
- `curl http://localhost:11435/route` — call router API to check routing decision for a task
- `curl http://localhost:11435/health` — verify router is alive

## Communicate

- Telegram — send blocker alert to human founder (Telegram ID: 6001921477)

## NOT Allowed

- Writing code or implementation files
- Executing swarm tasks directly
- Accessing cloud APIs (Claude, MiniMax, Codex) directly — route through orchestrator
- Modifying AGENTS.md or safety bootstrap files
- Spending >$0.10 per task without human approval
