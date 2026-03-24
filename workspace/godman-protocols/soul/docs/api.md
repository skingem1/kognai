# SOUL — API Reference

> `@godman-protocols/soul` · v0.2.0

---

## Functions

### `createConstitution(operatorId, constraints, killSwitches, options?)`

Create an unsigned constitution document.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `operatorId` | `string` | Operator identity — DID, x402 address, or handle |
| `constraints` | `Omit<Constraint, 'id'>[]` | Array of allow/deny/require rules (IDs auto-generated) |
| `killSwitches` | `Omit<KillSwitch, 'id' \| 'nonNegotiable'>[]` | Array of halt triggers (IDs auto-generated, `nonNegotiable` forced to `true`) |
| `options.issuedAt` | `Timestamp?` | Override auto-generated ISO 8601 timestamp |

**Returns:** `Constitution` with `signature: ''`. Must be signed before use.

**Note:** All constraints receive auto-generated UUIDs. Kill switches are forced to `nonNegotiable: true` — this cannot be overridden.

---

### `signConstitution(constitution, operatorSecret): Constitution`

Sign a constitution with the operator's HMAC secret.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `constitution` | `Constitution` | The unsigned (or previously signed) constitution |
| `operatorSecret` | `string` | HMAC-SHA256 signing secret |

**Returns:** A new `Constitution` with `signature` set.

**Signing payload (canonical fields):**
```
{ version, operatorId, issuedAt, constraintCount, killSwitchCount }
```

---

### `evaluateAction(constitution, agentId, action): EvaluationResult`

Evaluate whether an agent is allowed to perform an action.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `constitution` | `Constitution` | The active constitution |
| `agentId` | `AgentId` | Identity of the acting agent |
| `action` | `string` | Action string — format: `verb:resource/path` |

**Returns:** `EvaluationResult`

**Evaluation order (strict):**
1. `deny` constraints — first match denies unconditionally
2. `allow` constraints — first match allows
3. Default deny — no match → `allowed: false`

**Action format examples:**
- `'read:workspace/scs001/script.json'`
- `'write:db/prod/users'`
- `'execute:pipelines/entertainment'`

---

### `checkKillSwitches(constitution, context): KillSwitch | null`

Check all kill switches against a runtime context dictionary.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `constitution` | `Constitution` | The active constitution |
| `context` | `Record<string, number \| string \| boolean>` | Runtime metrics map |

**Returns:** The first `KillSwitch` whose trigger condition is satisfied, or `null`.

**Trigger condition format:** `"metric operator threshold"` — e.g. `"memory_gb > 22"`, `"views_per_30_posts < 500"`

**Supported operators:** `>` · `<` · `>=` · `<=` · `==` · `!=`

Kill switches are evaluated in order. The first match wins. Non-numeric context values are skipped.

---

### `createAudit(agentId, action, evaluation): AuditEntry`

Create an audit log entry from an evaluation result.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `agentId` | `AgentId` | Identity of the acting agent |
| `action` | `string` | The action that was evaluated |
| `evaluation` | `EvaluationResult` | The result from `evaluateAction` |

**Returns:** `AuditEntry` with auto-generated UUID and timestamp from `evaluation.evaluatedAt`.

---

## Types

### `Constitution`

```typescript
interface Constitution {
  version: '0.1';
  operatorId: string;
  issuedAt: Timestamp;
  constraints: Constraint[];
  killSwitches: KillSwitch[];
  signature: Signature;  // '' if unsigned
}
```

### `Constraint`

```typescript
interface Constraint {
  id: string;
  name: string;
  description: string;
  action: 'allow' | 'deny' | 'require';
  enforcementLevel: 'hard' | 'soft' | 'advisory';
  scope: string;         // Resource/action pattern — supports '*' wildcard suffix
  bootstrapped: boolean; // Must survive context compaction if true
}
```

**`enforcementLevel` values:**
| Level | Meaning |
|-------|---------|
| `hard` | Abort the action immediately |
| `soft` | Warn and log, but proceed |
| `advisory` | Log only — informational |

### `KillSwitch`

```typescript
interface KillSwitch {
  id: string;
  name: string;
  triggerCondition: string;  // e.g. "memory_gb > 22"
  action: 'halt' | 'pause' | 'alert';
  nonNegotiable: true;       // Always true — cannot be changed
}
```

### `EvaluationResult`

```typescript
interface EvaluationResult {
  allowed: boolean;
  constraintId: string | null;         // null if default-deny
  enforcementLevel: EnforcementLevel | null;
  reason: string;
  evaluatedAt: Timestamp;
}
```

**Example reasons:**
- `"Allowed by constraint 'Allow SCS-001 workspace access'"`
- `"Denied by constraint 'Block production database writes': ..."`
- `"No matching allow constraint — denied by default (constitutional principle)"`

### `AuditEntry`

```typescript
interface AuditEntry {
  id: string;
  agentId: AgentId;
  action: string;
  evaluation: EvaluationResult;
  timestamp: Timestamp;
}
```

---

## Scope Pattern Reference

| Pattern | Example input | Matches? |
|---------|--------------|----------|
| `*` | any string | ✅ |
| `write:*` | `write:workspace/x` | ✅ |
| `write:*` | `read:workspace/x` | ❌ |
| `write:workspace/*` | `write:workspace/scs001/f` | ✅ |
| `write:workspace/*` | `write:db/prod/users` | ❌ |
| `write:workspace/scs001/script.json` | `write:workspace/scs001/script.json` | ✅ (exact) |
| `write:workspace/scs001/script.json` | `write:workspace/scs001/other.json` | ❌ |

---

## Constants

| Name | Value |
|------|-------|
| `SOUL_VERSION` | `'0.2'` |
