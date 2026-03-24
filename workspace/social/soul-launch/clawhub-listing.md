# SOUL — ClaWHub Marketplace Listing

**Platform:** ClaWHub.com
**Launch date:** April 14, 2026
**Install command:** `npx skills add https://github.com/godman-protocols/soul`

---

## Listing content

**Title:** SOUL — Constitutional Constraints and Safety Protocol

**Category:** Infrastructure / Safety / Governance

**Tagline:** Deny-first safety that survives context compaction — with kill switches and audit trails.

**Description:**

SOUL is an open protocol for encoding non-negotiable safety rules that AI agents must obey. It provides a signed constitutional document with deny/allow constraints, kill switches, and an append-only audit trail. SOUL is the lowest protocol layer — no other Godman Protocol overrides it.

**What it gives your agents:**
- Constitution creation + HMAC-SHA256 operator signing
- Deny-first action evaluation with wildcard scope matching
- Kill switch engine (numeric threshold operators: >, <, >=, <=, ==, !=)
- Append-only audit entries for every evaluation

**Zero external dependencies.** Node 20+ / Deno 1.40+ / Edge compatible.

**Works with:**
- PACT (SOUL evaluation runs before mandate execution)
- SCORE (constitutional violations auto-trigger score 0.0)
- SIGNAL (kill switch triggers published as events)

**Install:**
```
npx skills add https://github.com/godman-protocols/soul
```

**Links:**
- GitHub: github.com/godman-protocols/soul
- Docs: godman-protocols.dev/soul
- License: Apache 2.0

**Tags:** safety, constitutional, governance, kill-switch, audit, deny-first, TypeScript

---

## ClaWHub submission checklist

- [ ] GitHub repo public (April 14)
- [x] README complete (Sprint 974)
- [x] API docs complete (Sprint 974)
- [x] `.openclaw` config present (Sprint 955)
- [x] `.claude-plugin` config present (Sprint 955)
- [x] `.cursor-plugin` config present (Sprint 955)
- [x] `.codex` config present (Sprint 955)
- [x] X thread drafted (Sprint 976)
- [ ] ClaWHub listing submitted (April 14 — human action)
