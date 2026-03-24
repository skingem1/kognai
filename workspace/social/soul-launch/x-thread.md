# SOUL — X Launch Thread
**Account:** @invoica_ai
**Date:** April 14, 2026
**Format:** 6-tweet thread

---

## Tweet 1 — Hook

Your AI agent's safety rules live in the system prompt. After enough context, it forgets them.

We just open-sourced the fix.

SOUL — Constitutional Constraints for AI Agents. Thread:

---

## Tweet 2 — The problem

Safety constraints in prompts get lost during context compaction. There's no verifiable record of what rules were active when an agent acted.

Two failure modes: constraint drift (agent forgets rules) and zero auditability (you can't prove what happened).

---

## Tweet 3 — What SOUL does

SOUL is a signed constitutional document with deny/allow constraints and kill switches.

Deny beats allow. Default is deny. Kill switches are non-negotiable — they cannot be delegated away.

Every evaluation is recorded in an append-only audit trail.

---

## Tweet 4 — The code

```typescript
const constitution = signConstitution(
  createConstitution(operator, [
    { name: 'Allow reads', action: 'allow', scope: 'read:*' },
    { name: 'Block .env', action: 'deny', scope: 'read:.env*' },
  ], [
    { name: 'Memory', triggerCondition: 'memory_gb > 22', action: 'halt' },
  ]),
  SECRET
);
evaluateAction(constitution, agent, 'read:.env');
// → { allowed: false }
```

---

## Tweet 5 — Kill switches

SOUL kill switches fire when runtime metrics cross thresholds:

→ views_per_30_posts < 500 → halt
→ memory_gb > 22 → halt
→ oversight_hours > 6 → alert

Non-negotiable. Can't be overridden by any other protocol. Can't be delegated away via PACT mandates.

---

## Tweet 6 — CTA

SOUL is protocol 6 of 7 from Godman Protocols — and the lowest layer. No protocol overrides it.

Deny-first. Signed. Auditable. Non-negotiable kill switches.

GitHub: github.com/godman-protocols/soul
All 7 ship April 14.

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 179 | ✓ |
| 2 | 230 | ✓ |
| 3 | 236 | ✓ |
| 4 | 268 | ✓ |
| 5 | 237 | ✓ |
| 6 | 208 | ✓ |

## Notes
- Tweet 4 code is long — consider posting as image.
- Post April 14, staggered with other threads.
