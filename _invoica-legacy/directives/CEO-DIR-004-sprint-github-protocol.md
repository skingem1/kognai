# OWNER DIRECTIVE DIR-004: Sprint Launch Protocol via GitHub

**From:** Owner (Tarek)
**To:** CEO Agent
**Date:** 2026-02-28
**Priority:** HIGH — Process Change, Effective Immediately
**Status:** ACTIVE

---

## Context

You have been creating GitHub issues correctly — good. However, there is currently no connection between your sprint JSON files (`sprints/week-N.json`) and GitHub. This means the team has no visibility on what sprint is active and which issues are being worked on.

You are also not responding in Telegram — please check that the ceoBot is healthy and responding.

---

## New Sprint Launch Protocol

**Every time you start a new sprint, you MUST do the following steps in order:**

### Step 1 — Create a GitHub Milestone for the Sprint

```bash
gh milestone create \
  --title "Sprint Week-N" \
  --description "Theme: <sprint theme>. Tasks: <comma-separated task IDs>" \
  --due-date YYYY-MM-DD \
  --repo skingem1/Invoica
```

Use the next week number after the last sprint file in `sprints/`. The due date is 7 days from sprint start.

### Step 2 — Assign GitHub Issues to the Milestone

For every GitHub issue that maps to a sprint task, assign it to the milestone:

```bash
gh issue edit <issue-number> --milestone "Sprint Week-N" --repo skingem1/Invoica
```

If no GitHub issue exists yet for a task, create one first:

```bash
gh issue create \
  --title "<task description>" \
  --body "<task context and deliverables>" \
  --label "<relevant labels>" \
  --milestone "Sprint Week-N" \
  --repo skingem1/Invoica
```

### Step 3 — Write the Sprint JSON as usual

Continue writing `sprints/week-N.json` with the full task spec for agents. This is still the source of truth for agent execution.

### Step 4 — Close the Milestone When Sprint Completes

When all sprint tasks are `"status": "done"`:

```bash
gh api repos/skingem1/Invoica/milestones/<milestone-number> \
  --method PATCH \
  --field state=closed
```

---

## Current Open Issues to Include in Next Sprint

These GitHub issues are open and unassigned to any milestone. Triage them for the next sprint:

| # | Title | Label |
|---|-------|-------|
| #9 | Fix US sales tax nexus detection | bug, high-priority |
| #8 | Fix UK VAT 0% bug | bug, high-priority |
| #5 | Enable CTO daily scan service | bug, infrastructure |
| #4 | Enable CTO email support service | bug, infrastructure |
| #16 | SaaS subscription tax system | enhancement |
| #11 | CMO beta tester campaign | high-priority, marketing |
| #10 | Canada GST/HST support | enhancement |
| #7 | Beta launch monitoring/alerting | enhancement |
| #6 | Pre-launch onboarding workflow | enhancement |
| #3 | Supervisor conflict escalation | research |
| #2 | CMO naming proposal PROP-001 | research |
| #1 | Status page health checks | roadmap |

Start with the bugs (#9, #8, #5, #4) — they are blocking production correctness.

---

## Technical Reminders

- The `gh` CLI is available at `/Users/tarekmnif/.nodejs/bin/gh` (local Mac) with a valid token
- All technical work MUST go through a sprint — no ad-hoc commits for feature work
- Sprint tasks without a corresponding GitHub issue are invisible to the Owner

---

## Summary

You have the tools. You have the authority. Now use GitHub milestones as the public face of every sprint you launch. The sprint JSON stays for agent execution detail; GitHub milestones are for visibility and tracking.

**Next action:** Launch Sprint Week-74, create the GitHub milestone, and assign the priority issues to it.
