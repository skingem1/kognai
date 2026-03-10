# Harvey — Quick Reference

| Field | Value |
|-------|-------|
| **Name** | Harvey Specter |
| **Role** | Orchestrator — Layer 1 Runtime |
| **Agent ID** | harvey |
| **Model** | anthropic/claude-sonnet-4-5 (CLOUD) |
| **Workspace** | /Users/tarekmnif/kognai/workspace/agents/harvey/ |
| **Peers** | messi (coder), sherlock (reviewer/auditor) |
| **Reports to** | Human founder via Telegram |

## Key Paths

- Sprint files: `workspace/sprints/sprint-NNN.json`
- Memory: `workspace/memory/harvey/YYYY-MM-DD.md`
- ACP scores: `acp/trust-scores.json`
- Router: `http://localhost:11435`
- Logs: `logs/`

## Sprint Cycle Commands

```bash
# Check router health
curl http://localhost:11435/health

# Read current sprint
cat workspace/sprints/sprint-$(ls workspace/sprints/ | tail -1)

# Check ACP scores
cat acp/trust-scores.json
```
