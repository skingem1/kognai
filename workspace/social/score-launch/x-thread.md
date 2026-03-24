# SCORE — X Launch Thread
**Account:** @invoica_ai
**Date:** April 14, 2026
**Format:** 6-tweet thread

---

## Tweet 1 — Hook

Your AI agents produce output. But you have no idea which agent does good work and which one doesn't.

We just open-sourced the missing quality layer.

SCORE — Scoring and Reputation for Agent Outputs. Thread:

---

## Tweet 2 — The problem

In a multi-agent swarm, bad outputs circulate with no feedback signal.

New agents have zero reputation. Good agents can't prove their track record. You're trusting blindly.

---

## Tweet 3 — What SCORE does

SCORE lets you define rubrics (weighted criteria), evaluate outputs against them, and build time-decayed reputation scores.

Recent performance matters more. Old reputation fades. Every evaluation is signed for audit.

---

## Tweet 4 — The code

```typescript
const rubric = createRubric('Quality', [
  { name: 'accuracy', weight: 0.4 },
  { name: 'clarity', weight: 0.3 },
  { name: 'engagement', weight: 0.3 },
]);
const ev = evaluate(rubric, agent, ref, scores, evaluator, SECRET);
// → { compositeScore: 0.845 }
```

---

## Tweet 5 — Reputation decay

SCORE uses exponential time decay:

weight = exp(-0.01 × ageDays)

Half-life: ~69 days. An evaluation from 2 months ago counts half as much as today's.

No more agents coasting on old reputation while recent output degrades.

---

## Tweet 6 — CTA

SCORE is protocol 3 of 7 from Godman Protocols.

Rubrics. Evaluations. Reputation. Audit trail. All signed.

GitHub: github.com/godman-protocols/score
ClaWHub: [ClaWHub link]

All 7 protocols ship April 14.

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 206 | ✓ |
| 2 | 164 | ✓ |
| 3 | 218 | ✓ |
| 4 | 216 | ✓ |
| 5 | 207 | ✓ |
| 6 | 168 | ✓ |

## Notes
- Tweet 4 code renders as plain text on X — consider image.
- Post April 14, staggered 4 hours after PACT thread.
