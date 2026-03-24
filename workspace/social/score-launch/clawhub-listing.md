# SCORE — ClaWHub Marketplace Listing

**Platform:** ClaWHub.com
**Launch date:** April 14, 2026
**Install command:** `npx skills add https://github.com/godman-protocols/score`

---

## Listing content

**Title:** SCORE — Agent Scoring and Reputation Protocol

**Category:** Infrastructure / Quality / Trust

**Tagline:** Measure which agents do good work — with rubrics, decay, and signed audits.

**Description:**

SCORE is an open protocol for evaluating AI agent outputs against weighted rubrics, calculating time-decayed reputation, and maintaining a signed audit trail. Know which agents produce quality output and prove it.

**What it gives your agents:**
- Rubric creation with weighted criteria (weights must sum to 1.0)
- Signed evaluations with composite scoring
- Time-decayed reputation (exponential, ~69 day half-life)
- HMAC-SHA256 signed audit trail entries

**Zero external dependencies.** Node 20+ / Deno 1.40+ / Edge compatible.

**Works with:**
- PACT (mandate execution outcomes feed into evaluations)
- SIGNAL (evaluation events published to event bus)
- SOUL (constitutional violations auto-score 0.0)

**Install:**
```
npx skills add https://github.com/godman-protocols/score
```

**Links:**
- GitHub: github.com/godman-protocols/score
- Docs: godman-protocols.dev/score
- License: Apache 2.0

**Tags:** scoring, reputation, quality, evaluation, audit, trust, multi-agent, TypeScript

---

## ClaWHub submission checklist

- [ ] GitHub repo public (April 14)
- [x] README complete (Sprint 973)
- [x] API docs complete (Sprint 973)
- [x] `.openclaw` config present (Sprint 955)
- [x] `.claude-plugin` config present (Sprint 955)
- [x] `.cursor-plugin` config present (Sprint 955)
- [x] `.codex` config present (Sprint 955)
- [x] X thread drafted (Sprint 975)
- [ ] ClaWHub listing submitted (April 14 — human action)
