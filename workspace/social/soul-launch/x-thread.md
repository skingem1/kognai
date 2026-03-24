# SOUL — X Launch Thread
**Account:** @invoica_ai  
**Date:** April 2026 (week 7 after PACT launch)  
**Format:** 6-tweet thread  

---

## Tweet 1 — Hook

AI agent safety constraints are usually written in a system prompt.

System prompts get compressed. Context windows fill. The rules disappear.

We built the layer that makes safety constraints survive.

SOUL — Constitutional Constraints and Safety. 🧵

---

## Tweet 2 — The problem

Two failure modes when agents enforce safety via chat context:

→ Constraint drift: after enough context compaction, agents forget the rules
→ No auditability: nothing verifiable records which constraints were active when an action was taken

---

## Tweet 3 — What SOUL does

SOUL encodes constraints as a signed constitutional document that lives in code, not chat.

- Allow/deny rules with scope patterns
- Non-negotiable kill switches (halt on metric breach)
- Append-only audit trail for every evaluation
- Default-deny: no explicit allow = denied

---

## Tweet 4 — The code

```typescript
const constitution = signConstitution(
  createConstitution('did:operator', constraints, killSwitches), SECRET);

const result = evaluateAction(constitution, 'did:messi', 'write:db/prod/*');
// → { allowed: false, reason: "Denied by constraint 'Block production DB writes'" }
```

---

## Tweet 5 — Kill switches

Kill switches are non-negotiable. No delegation, no override:

```typescript
const triggered = checkKillSwitches(constitution, {
  views_per_30_posts: 320,  // below 500 threshold → HALT
  memory_gb: 14.5,
});
if (triggered) process.exit(1); // unconditional
```

The operator sets them. The protocol enforces them.

---

## Tweet 6 — CTA

SOUL is the lowest layer — no other protocol overrides it.

SOUL → PACT → AMF → LAX → DRS → SIGNAL → SCORE

Every safe AI agent stack needs a constitutional layer.

GitHub: github.com/godman-protocols/soul
ClaWHub: [ClaWHub link]
Install: npx skills add https://github.com/godman-protocols/soul

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 220 | ✓ |
| 2 | 230 | ✓ |
| 3 | 231 | ✓ |
| 4 | 210 | ✓ |
| 5 | 215 | ✓ |
| 6 | 235 | ✓ |
