# SCORE — Scoring and Reputation for Agent Outputs

> **v0.2.0** · Apache 2.0 · `@godman-protocols/score` · Node 20+ / Deno 1.40+

SCORE is an open protocol for evaluating AI agent outputs against weighted rubrics, calculating time-decayed reputation, and maintaining a signed audit trail — so multi-agent systems can objectively measure who does good work.

```bash
npx skills add https://github.com/godman-protocols/score
# or
npm install @godman-protocols/score
```

---

## The Problem

In a multi-agent swarm, how do you know which agents produce quality output? Without a scoring protocol:

- **No accountability** — bad outputs circulate with no feedback signal
- **No improvement** — agents can't learn what worked and what didn't
- **No trust basis** — new agents have no reputation, established agents coast on past performance

SCORE provides the missing quality layer: define what "good" means (rubrics), measure it (evaluations), track it over time (reputation), and prove it (audit trail).

---

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Rubric** | A named set of weighted criteria that define "quality" for a task type |
| **Criterion** | A single dimension of quality (e.g. accuracy, clarity) with a weight |
| **Evaluation** | A scored assessment of one agent output against a rubric |
| **Reputation** | A time-decayed aggregate score across all evaluations for an agent |
| **AuditEntry** | A signed, append-only record linking evaluation to agent and score |

---

## Quickstart

```typescript
import {
  createRubric, evaluate, calculateReputation, createAuditEntry,
} from '@godman-protocols/score';

// 1. Define a rubric for content quality
const rubric = createRubric('Content Quality', [
  { name: 'accuracy',    description: 'Factual correctness',  weight: 0.4 },
  { name: 'clarity',     description: 'Easy to understand',   weight: 0.3 },
  { name: 'engagement',  description: 'Holds attention',      weight: 0.3 },
]);

// 2. Evaluate an agent's output
const SECRET = process.env.EVALUATOR_SECRET!;
const scores: Record<string, number> = {};
rubric.criteria.forEach((c, i) => {
  scores[c.id] = [0.9, 0.85, 0.75][i]; // accuracy=0.9, clarity=0.85, engagement=0.75
});

const ev = evaluate(rubric, 'did:kognai:messi', 'vlog-mn3abc', scores, 'did:kognai:sherlock', SECRET);
// → { compositeScore: 0.845, ... }

// 3. Build reputation over time
const reputation = calculateReputation('did:kognai:messi', [ev]);
// → { score: 0.845, evaluationCount: 1 }

// 4. Create audit trail
const audit = createAuditEntry(ev, SECRET);
// → { evaluationId: '...', signature: '...' }
```

---

## API Summary

### Rubric & Evaluation (`src/core.ts`)

| Function | Description |
|----------|-------------|
| `createRubric(name, criteria, options?)` | Create a weighted scoring rubric |
| `evaluate(rubric, agentId, outputRef, scores, evaluatedBy, secret, options?)` | Score an output against a rubric |

### Reputation (`src/core.ts`)

| Function | Description |
|----------|-------------|
| `calculateReputation(agentId, evaluations, decayRate?, asOf?)` | Time-decayed reputation from evaluations |

### Audit (`src/core.ts`)

| Function | Description |
|----------|-------------|
| `createAuditEntry(evaluation, secret)` | Create a signed audit trail entry |

---

## Reputation Decay

SCORE uses exponential time decay to weight recent performance more heavily:

```
weight = exp(-decayRate × ageDays)
```

Default decay rate: `0.01` (half-life ~69 days). An evaluation from 69 days ago counts half as much as today's. This prevents agents from coasting on old reputation while their recent output degrades.

---

## Security Model

SCORE v0.2 uses HMAC-SHA256 for evaluation signing. The signature covers: evaluation ID, agent ID, output reference, composite score, and timestamp.

**Production upgrade path:**
- Replace HMAC with Ed25519 for evaluator identity verification
- Store audit entries on-chain for cross-organisation reputation portability
- Add ZK proofs for privacy-preserving reputation queries

---

## Compatibility

| System | How it connects |
|--------|----------------|
| **Kognai** (QC Gate) | SCORE rubrics formalise what the SCS-001 Quality Control Gate already checks |
| **PACT** (mandates) | Mandate execution outcomes feed into SCORE evaluations |
| **SIGNAL** (events) | Evaluations published as `score.evaluation.completed` events |
| **SOUL** (constitution) | Constitutional violations auto-score 0.0 on relevant criteria |

---

## Related Protocols

| Protocol | Purpose |
|----------|---------|
| **PACT** | Agent coordination and trust |
| **LAX** | Latency-aware execution scheduling |
| **SCORE** (this repo) | Scoring and reputation for agent outputs |
| **AMF** | Agent Message Format |
| **DRS** | Dynamic Resource Scheduling |
| **SOUL** | Constitutional constraints and safety |
| **SIGNAL** | Event bus and pub/sub for agent swarms |

---

## Roadmap

- [x] Rubric creation with weight validation (v0.2)
- [x] Signed evaluations with composite scoring (v0.2)
- [x] Time-decayed reputation calculation (v0.2)
- [x] Signed audit trail entries (v0.2)
- [ ] Ed25519 evaluation signing (v0.3)
- [ ] Persistent evaluation store (Supabase / SQLite) (v0.3)
- [ ] Rubric versioning + migration (v0.4)
- [ ] Python SDK (v0.5)
- [ ] Cross-organisation reputation federation (v0.5)

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE)

Part of the [Godman Protocols](https://github.com/godman-protocols) portfolio.
