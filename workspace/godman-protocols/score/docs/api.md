# SCORE API Reference

> **v0.2.0** · Full API surface for `@godman-protocols/score`

---

## Types

### `AgentId`
```typescript
type AgentId = string;
```
A unique agent identifier — DID, x402 wallet address, or scoped handle.

### `Timestamp`
```typescript
type Timestamp = string;
```
ISO 8601 timestamp string.

### `Signature`
```typescript
type Signature = string;
```
Hex-encoded HMAC-SHA256 signature.

### `Criterion`
```typescript
interface Criterion {
  id: string;
  name: string;
  description: string;
  weight: number; // 0.0–1.0
}
```
A single dimension of quality. All weights in a rubric must sum to 1.0 (±0.001 tolerance).

### `Rubric`
```typescript
interface Rubric {
  id: string;
  name: string;
  version: string;
  criteria: Criterion[];
}
```

### `Evaluation`
```typescript
interface Evaluation {
  id: string;
  rubricId: string;
  agentId: AgentId;
  outputRef: string;
  scores: Record<string, number>;
  compositeScore: number;
  evaluatedBy: AgentId | 'human';
  evaluatedAt: Timestamp;
  signature: Signature;
  notes?: string;
}
```
`scores` maps criterion IDs to individual scores (0.0–1.0). `compositeScore` is the weighted sum.

### `Reputation`
```typescript
interface Reputation {
  agentId: AgentId;
  score: number;
  evaluationCount: number;
  lastEvaluatedAt: Timestamp;
  calculatedAt: Timestamp;
}
```
`score` is the time-decayed weighted average of composite scores.

### `AuditEntry`
```typescript
interface AuditEntry {
  evaluationId: string;
  agentId: AgentId;
  compositeScore: number;
  timestamp: Timestamp;
  signature: Signature;
}
```

---

## Rubric Creation (`src/core.ts`)

### `createRubric(name, criteria, options?)`

Create a scoring rubric. Weights must sum to 1.0.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | — | Human-readable rubric name |
| `criteria` | `Omit<Criterion, 'id'>[]` | — | Criteria (IDs auto-generated) |
| `options.id` | `string` | auto UUID | Override rubric ID |
| `options.version` | `string` | `'1.0'` | Rubric version |

**Returns:** `Rubric`

**Throws:** If criteria is empty or weights don't sum to 1.0 (±0.001).

---

## Evaluation (`src/core.ts`)

### `evaluate(rubric, agentId, outputRef, scores, evaluatedBy, secret, options?)`

Evaluate an agent output against a rubric.

| Param | Type | Description |
|-------|------|-------------|
| `rubric` | `Rubric` | The rubric to evaluate against |
| `agentId` | `AgentId` | Agent whose output is being evaluated |
| `outputRef` | `string` | Reference to the specific output (e.g. video ID, file path) |
| `scores` | `Record<string, number>` | Map of criterion ID → score (0.0–1.0) |
| `evaluatedBy` | `AgentId \| 'human'` | Who performed the evaluation |
| `secret` | `string` | Secret for HMAC-SHA256 signing |
| `options.notes` | `string` | Optional evaluation notes |

**Returns:** `Evaluation`

**Throws:**
- If any criterion in the rubric is missing from `scores`
- If any score is outside 0.0–1.0

**Signature covers:** `${id}:${agentId}:${outputRef}:${compositeScore}:${evaluatedAt}`

---

## Reputation (`src/core.ts`)

### `calculateReputation(agentId, evaluations, decayRate?, asOf?)`

Calculate time-decayed reputation from a list of evaluations.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `agentId` | `AgentId` | — | Agent to calculate reputation for |
| `evaluations` | `Evaluation[]` | — | All evaluations (filtered internally by agentId) |
| `decayRate` | `number` | `0.01` | Exponential decay rate per day |
| `asOf` | `Timestamp` | now | Calculate age relative to this timestamp |

**Returns:** `Reputation`

**Decay formula:** `weight = exp(-decayRate × ageDays)`

Default half-life: ~69 days (`ln(2) / 0.01`).

If no evaluations match the agent, returns `{ score: 0, evaluationCount: 0 }`.

---

## Audit Trail (`src/core.ts`)

### `createAuditEntry(evaluation, secret)`

Create a signed audit entry from an evaluation. Append to an append-only log.

| Param | Type | Description |
|-------|------|-------------|
| `evaluation` | `Evaluation` | The evaluation to audit |
| `secret` | `string` | Secret for HMAC-SHA256 signing |

**Returns:** `AuditEntry`

**Signature covers:** `audit:${evaluationId}:${agentId}:${compositeScore}:${evaluatedAt}`

---

## Constants

```typescript
const SCORE_VERSION: '0.2';
```
