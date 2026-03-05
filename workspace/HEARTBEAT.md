# HEARTBEAT.md — Self-Healing Checks
**Built on: 2026-03-05 (pre-populated from Invoica failure patterns — do not wait for first failure)**
**Owner:** MacGyver · **Schedule:** Every 30 minutes via PM2 cron

---

## Why This Exists

In Invoica, the heartbeat went stale for 11 days. The swarm appeared healthy while real failures accumulated. Kognai does not repeat that. This file defines what MacGyver checks, how often, and what triggers an alert.

---

## Check Suite

### Tier 1 — Critical (every 30 min)

| Check | Pass condition | Fail action |
|---|---|---|
| Ollama API responsive | `curl localhost:11434/api/tags` returns 200 | Alert Tarek + suspend local tasks |
| PM2 processes running | All defined processes show `online` status | Restart + alert if second failure |
| Tailscale tunnel live | Vault reachable from cloud at Tailscale IP | Mark all `local` tasks `suspended` — retry every 30s |
| Disk space | >20% free on vault drive | Alert Tarek — do not auto-delete anything |
| Active model loaded | At least one Ollama model loaded and responsive | Reload last active model |

### Tier 2 — Health (every 4 hours)

| Check | Pass condition | Fail action |
|---|---|---|
| Sherlock audit score trend | Rolling 10-interaction average ≥ 0.65 | Alert Messi — flag agent for review |
| Sprint task completion rate | Current sprint ≥ 80% on-track | Elon gets notified — sprint proposal review |
| Memory log freshness | Today's log exists and is non-empty | Alert — swarm may be idle |
| FEEDBACK-LOG.md updated | Last entry within 48 hours | Flag — corrections may not be propagating |
| GitHub remote reachable | `git ls-remote origin` returns without error | Alert Tarek — do not push until resolved |

### Tier 3 — Financial (every 24 hours, 08:00 CET)

| Check | Pass condition | Fail action |
|---|---|---|
| Anthropic API cost | Daily spend below $5.00 | Alert Satoshi + Tarek immediately |
| Cloud task ratio | Local tasks ≥ 80% of all tasks | Flag to Messi — check TASK_TARGET assignments |
| ACP ledger accessible | SQLite DB readable on vault | Alert — ACP scoring may be failing silently |

---

## Incident Response Protocol

**On any Tier 1 failure:**
1. MacGyver fires `interrupt.critical`
2. Messi suspends affected tasks
3. Telegram alert to @skingem — one message: failure type + impact + status
4. MacGyver attempts repair from hot-fix library
5. If not resolved in 10 minutes: second Telegram alert — human intervention required

**On any Tier 2 failure:**
1. MacGyver logs to `memory/YYYY-MM-DD.md`
2. Relevant named agent notified via event
3. No Telegram alert unless failure persists through next check cycle

**On any Tier 3 failure:**
1. Satoshi generates immediate financial alert
2. Telegram to @skingem with cost breakdown
3. Messi gates next sprint start until Tarek approves

---

## What MacGyver Does NOT Do

- Does not auto-delete files to free disk space
- Does not restart Tailscale without human approval
- Does not modify production configuration to resolve a health check failure
- Does not fire more than one Telegram alert per incident per 4-hour window

---

*This file evolves. After every production incident, MacGyver proposes a new check to add here. Tarek approves. The swarm gets smarter about what it monitors.*
