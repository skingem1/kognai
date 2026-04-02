# Sprint: Harvey Morning Briefing + Telegram Triage Loop
**Sprint ID:** SPRINT-HARVEY-BRIEFING-01
**Approved:** 2026-03-29 | Godman
**Gap:** GAP-01 (TICKET-028)
**Priority:** P0 — Blocks all Tier 1/2 autonomy
**Dependency:** BUGFIX-TELEGRAM-CRASH must be resolved first (Telegram bot must be stable)
**Estimated effort:** 1 swarm session (~4-5 sprint tasks)
**Owner:** Harvey (spec + integration) + MacGyver (implementation)

---

## Context

The Autonomous Ticketing Protocol defines a morning briefing at 8:30am. Without this, the entire ticketing system is passive — tickets exist in Notion but nothing acts on them. Godman must manually check Notion to know what decisions are waiting.

This sprint builds the active triage loop that makes Godman's inbox work like a proper decision queue.

---

## Deliverables

### Task 1 — Harvey Cron Runner
**Owner:** MacGyver
**File:** `scripts/harvey-morning-briefing.ts`

- Cron: `30 8 * * *` (8:30am daily, Mac Mini local time)
- Reads Kognai Change Log from Notion (via MCP or Notion API)
- Filters tickets by:
  - Status = "Open"
  - `Auto Assignable = false` (requires Godman decision)
  - OR Priority = "P0" (always surfaces regardless of assignability)
- Sorts: P0 first, then P1, then by `Created` date

**Gate:** Cron fires at 8:30am, produces structured JSON at `logs/briefings/YYYY-MM-DD.json`

---

### Task 2 — Telegram Briefing Message Format
**Owner:** MacGyver
**Uses:** existing Telegram bot (after BUGFIX-TELEGRAM-CRASH fix)

Morning briefing message format:
```
🌅 KOGNAI MORNING BRIEFING — {date}

🔴 DECISIONS REQUIRED ({N} tickets):
{for each ticket requiring Godman decision}
  [{priority}] TICKET-{N}: {title}
  → {one-line summary}
  → /approve-ticket-{N} | /defer-ticket-{N} | /modify-ticket-{N}

⚙️ AUTO-ASSIGNED ({N} tickets):
{for each auto-assignable ticket}
  [{priority}] TICKET-{N}: {title} → {assigned_to}

✅ COMPLETED SINCE YESTERDAY ({N}):
{count only, no detail}

📊 SWARM HEALTH:
  PM2: {running_processes}/{total}
  Last sprint: {sprint_id} | {status}
  ACP alerts: {count}

Reply /briefing-help for command list.
```

**Gate:** Message received in Telegram at 8:30am, all ticket links resolve to correct Notion URLs.

---

### Task 3 — Telegram Command Handlers
**Owner:** MacGyver
**Adds to:** existing Telegram bot handler

Commands:
- `/approve-ticket-{N}` → Updates TICKET-N status to "Approved" in Notion + assigns to owner + sends confirmation
- `/defer-ticket-{N}` → Updates status to "Deferred" + logs to `logs/briefings/deferred.jsonl`
- `/modify-ticket-{N} {instruction}` → Creates a new Notion comment on TICKET-N with Godman's modification note + status stays "Open"
- `/briefing-help` → Returns command list
- `/ticket-status` → Returns count of Open / Auto-assigned / Deferred tickets

**Constitutional alert path:** If any P0 ticket has been Open for > 24 hours without Godman action → sends `🚨 [CONSTITUTIONAL] TICKET-N has been open >24h without decision. Autonomous operation at risk.`

**Gate:** All 5 commands functional. /approve-ticket updates Notion status. Constitutional alert fires in test mode.

---

### Task 4 — Triage Rules Engine
**Owner:** Harvey (defines rules) + MacGyver (implements)
**File:** `scripts/lib/harvey-triage-rules.ts`

Triage rules applied during briefing generation:
1. P0 + Auto-assignable → Auto-assign immediately, include in briefing as FYI only
2. P0 + NOT auto-assignable → Surface to Godman with `[CONSTITUTIONAL]` flag
3. P1 + Auto-assignable + owner defined → Auto-assign, no Godman action needed
4. P1 + NOT auto-assignable → Surface in "DECISIONS REQUIRED" section
5. P2/P3 + Auto-assignable → Batch process, weekly digest only (not daily briefing)
6. Ticket open > 7 days without action → Escalate one priority level in display

Output: `logs/briefings/triage-YYYY-MM-DD.json` with triage decisions logged

**Gate:** Triage rules produce correct classification for all 28 existing tickets (TICKET-001 through TICKET-028) in test mode.

---

### Task 5 — PM2 Process Registration
**Owner:** MacGyver

Add to `ecosystem.config.js`:
```javascript
{
  name: 'harvey-briefing-cron',
  script: 'scripts/harvey-morning-briefing.ts',
  interpreter: 'ts-node',
  cron_restart: '30 8 * * *',
  watch: false,
  autorestart: false,  // cron-only, not a daemon
}
```

**Gate:** `pm2 list` shows `harvey-briefing-cron` with status `stopped` (between runs). Fires correctly on next cron tick.

---

## Sprint Gate Criteria (ALL must pass)

- [ ] Harvey briefing cron fires at 8:30am
- [ ] Telegram message received with correct format
- [ ] All 5 commands functional and tested
- [ ] Notion status updates confirmed for /approve and /defer
- [ ] Constitutional 24h alert fires in test mode
- [ ] Triage rules classify TICKET-001 through TICKET-028 correctly
- [ ] PM2 shows harvey-briefing-cron registered
- [ ] `logs/briefings/YYYY-MM-DD.json` written after each run

---

## Hard Dependency

**BUGFIX-TELEGRAM-CRASH must be resolved first.**
Current state: Telegram bot in crash loop (67+ restarts). This sprint cannot execute until the bot is stable. The briefing cron itself (Task 1) can be built in parallel but Tasks 2-3 require a live bot.

Sequence: BUGFIX-TELEGRAM-CRASH → SPRINT-HARVEY-BRIEFING-01

---

*SPRINT-HARVEY-BRIEFING-01 · GAP-01 / TICKET-028 · Approved 2026-03-29*
