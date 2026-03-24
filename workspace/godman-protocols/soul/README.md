# SOUL — Constitutional Constraints and Safety


[![npm version](https://img.shields.io/npm/v/@godman-protocols/soul.svg)](https://www.npmjs.com/package/@godman-protocols/soul)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

> **v0.2.0** · Apache 2.0 · `@godman-protocols/soul` · Node 20+ / Deno 1.40+

SOUL is the **lowest protocol layer** of the Godman stack — a constitutional engine that encodes an operator's safety constraints and kill switches into a signed, verifiable document that every agent in the swarm evaluates before taking any action.

```bash
npx skills add https://github.com/godman-protocols/soul
# or
npm install @godman-protocols/soul
```

---

## The Problem

AI agent safety constraints are usually implemented as system prompt instructions — text that can be lost during context compaction, overridden by a jailbreak, or simply forgotten after a session restart.

This creates two critical failure modes:
- **Constraint drift** — after enough context, agents stop honouring the rules they were given
- **No auditability** — there is no verifiable record of which constraints were in force when an action was taken

SOUL solves both problems by encoding constraints as a signed, immutable constitutional document that survives context compaction (because it lives in code, not chat) and produces an append-only audit trail for every evaluation.

---

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Constitution** | The root document — operator identity, constraints, kill switches, HMAC signature |
| **Constraint** | A named allow/deny/require rule scoped to a resource or action pattern |
| **KillSwitch** | A non-negotiable halt trigger — fires when a runtime metric crosses a threshold |
| **EvaluationResult** | The outcome of evaluating an action against the constitution |
| **AuditEntry** | An append-only record of every evaluation (who, what, allowed/denied, why) |
| **EnforcementLevel** | `hard` (abort), `soft` (warn + log), or `advisory` (log only) |

---

## Quickstart

```typescript
import {
  createConstitution, signConstitution,
  evaluateAction, checkKillSwitches, createAudit,
} from '@godman-protocols/soul';

const OPERATOR_SECRET = 'operator-hmac-secret';

// 1. Define the constitution
const draft = createConstitution(
  'did:kognai:tarek',   // operator
  [
    {
      name: 'Allow SCS-001 workspace access',
      description: 'Agents may read and write the SCS-001 workspace',
      action: 'allow',
      enforcementLevel: 'hard',
      scope: 'write:workspace/scs001/*',
      bootstrapped: true,
    },
    {
      name: 'Block production database writes',
      description: 'No agent may write to the production database directly',
      action: 'deny',
      enforcementLevel: 'hard',
      scope: 'write:db/prod/*',
      bootstrapped: true,
    },
  ],
  [
    {
      name: 'Low-engagement kill switch',
      triggerCondition: 'views_per_30_posts < 500',
      action: 'halt',
    },
    {
      name: 'Memory ceiling',
      triggerCondition: 'memory_gb > 22',
      action: 'halt',
    },
  ]
);

// 2. Sign it (prevents tampering)
const constitution = signConstitution(draft, OPERATOR_SECRET);

// 3. Evaluate every action before execution
const result = evaluateAction(constitution, 'did:kognai:messi', 'write:workspace/scs001/script.json');
console.log(result.allowed);  // true
console.log(result.reason);   // "Allowed by constraint 'Allow SCS-001 workspace access'"

// 4. Audit every evaluation
const audit = createAudit('did:kognai:messi', 'write:workspace/scs001/script.json', result);
// → append to your audit store

// 5. Check kill switches on each monitoring cycle
const triggered = checkKillSwitches(constitution, {
  views_per_30_posts: 320,  // below threshold
  memory_gb: 14.5,
});
if (triggered) {
  console.error(`KILL SWITCH: ${triggered.name}`);
  process.exit(1);
}
```

---

## Evaluation Order

`evaluateAction` uses a strict constitutional precedence:

1. **Deny constraints first** — a matching `deny` rule wins regardless of any `allow` rules
2. **Allow constraints** — the first matching `allow` rule grants access
3. **Default deny** — if no rule matches, the action is denied (constitutional principle)

This means: to permit an action, there must be an explicit `allow` constraint. The absence of a rule is a denial.

---

## Kill Switches

Kill switches are **non-negotiable** — they cannot be delegated away or overridden by any other protocol:

```typescript
const switched = checkKillSwitches(constitution, {
  views_per_30_posts: 280,  // < 500 → triggers halt
  memory_gb: 18,
  daily_oversight_hours: 7, // > 6 → triggers halt
});

if (switched) {
  // switched.action === 'halt' | 'pause' | 'alert'
  // Immediately stop the agent — no protocol override is valid
}
```

**Supported operators in `triggerCondition`:** `>` · `<` · `>=` · `<=` · `==` · `!=`

**Format:** `"metric_name operator threshold"` — e.g. `"memory_gb > 22"`, `"retention_pct < 20"`

---

## Scope Patterns

Constraint scopes support wildcard matching:

| Pattern | Matches |
|---------|---------|
| `*` | Any action |
| `write:*` | Any write action |
| `write:workspace/*` | Any write to workspace |
| `write:workspace/scs001/*` | Any write to scs001 workspace |
| `write:workspace/scs001/script.json` | Exact match only |

---

## Summer Yu Rule

SOUL implements the "Summer Yu Rule" from the Kognai safety specification: **safety constraints must live in bootstrap files (SOUL constitutions, AGENTS.md, SOUL.md), never in chat context alone.** A constitution's `bootstrapped: true` flag marks constraints that must survive context compaction.

---

## Integration with Godman Protocols

SOUL is **always the first check** in any protocol chain:

| Layer | Check |
|-------|-------|
| **SOUL** (this) | Is the action constitutionally permitted? Are kill switches triggered? |
| **PACT** | Does the requesting agent have a valid mandate for this action? |
| **AMF** | Wrap the request in a verifiable envelope |
| **LAX** | Route to the best runtime |
| **DRS** | Allocate compute resources |
| **SIGNAL** | Emit domain events |
| **SCORE** | Evaluate outcome and update reputation |

No other protocol overrides SOUL.

---

## API Reference

See [`docs/api.md`](./docs/api.md) for the full API reference.

---

## Compatibility

| Runtime | Status |
|---------|--------|
| Node.js 20+ | ✅ Tested |
| Deno 1.40+ | ✅ Compatible |
| Bun 1.0+ | ✅ Compatible |
| Browser (ESM) | ⚠️ Requires `node:crypto` polyfill for HMAC |
| OpenClaw v2026.3+ | ✅ ClaWHub listed |
| Claude Code plugin | ✅ `.claude-plugin` included |

---

## Security Model

- Constitution signing uses **HMAC-SHA256** over a canonical subset of fields — it proves the document was issued by the operator and has not been tampered with.
- **Signature does not authenticate actions** — SOUL evaluates constitutions, not individual messages. Use AMF for message-level authentication.
- Kill switches are evaluated in-process. For guaranteed enforcement in adversarial settings, run SOUL evaluations in a separate trusted process or use the kill switch `action: 'halt'` to trigger a hard process exit.

---

## Roadmap

- [x] Core types and protocol spec
- [x] Reference implementation (TypeScript)
- [x] Constitutional evaluation (deny > allow > default-deny)
- [x] Kill switch engine (numeric threshold operators)
- [x] Audit log creation
- [x] Smoke tests (11/11 PASS)
- [ ] Python SDK
- [ ] Constitution persistence (Supabase backend)
- [ ] Multi-operator constitution merging
- [ ] Kill switch webhook delivery
- [ ] ClaWHub marketplace listing

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE)
