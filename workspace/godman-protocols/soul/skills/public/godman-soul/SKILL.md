---
name: godman-soul
description: "Use SOUL to enforce constitutional constraints on agents — non-negotiable safety rules, kill switches, and action evaluation. SOUL is the lowest protocol layer; no other protocol overrides it."
tags: ["safety", "constitutional", "kill-switch", "constraints", "godman-protocols"]
version: "0.2.0"
---

# SOUL — Constitutional Constraints and Safety

Use this skill to evaluate agent actions against a constitutional mandate, enforce kill switches, and block unsafe operations before they execute.

## Key Operations

```typescript
import { ConstitutionEngine, evaluateAction, registerKillSwitch } from '@godman-protocols/soul';
import type { Constitution, KillSwitch, Constraint } from '@godman-protocols/soul';

const engine = new ConstitutionEngine(constitution);

// Evaluate before acting
const result = engine.evaluate({ action: 'delete_file', context });
if (result.blocked) { throw new Error(result.reason); }

// Register a kill switch
registerKillSwitch({
  trigger: () => memory_usage_mb > 22_000,
  action: 'halt_all_agents',
  description: 'Memory kill switch',
});
```

## When to Use
- Before any agent action that could affect production systems
- Implementing content safety filters (self-harm, violence, explicit)
- Enforcing operator-defined kill switches (account banned, <500 views/30 posts)
- Validating PACT mandates don't grant illegal scope

## Critical Rules
- SOUL constraints are bootstrap-level — they MUST survive context compaction
- Never place safety rules in chat-only prompts (Summer Yu rule)
- Kill switches are non-negotiable and cannot be delegated via PACT
