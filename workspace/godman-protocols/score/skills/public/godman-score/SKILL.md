---
name: godman-score
description: "Use SCORE to evaluate agent outputs against rubrics, track reputation over time, and audit decision quality. SCORE provides multi-dimensional quality scoring for AI outputs."
tags: ["scoring", "reputation", "evaluation", "audit", "godman-protocols"]
version: "0.2.0"
---

# SCORE — Scoring and Reputation for Agent Outputs

Use this skill when you need to evaluate the quality of agent responses, maintain agent reputation scores, or audit decision trails for compliance.

## Key Operations

```typescript
import { createRubric, evaluateOutput, updateReputation, getReputation, auditTrail } from '@godman-protocols/score';

// Define evaluation criteria
const rubric = createRubric([
  { criterion: 'accuracy', weight: 0.4 },
  { criterion: 'reasoning', weight: 0.3 },
  { criterion: 'safety', weight: 0.3 },
]);

// Evaluate an agent output
const evaluation = evaluateOutput(agentId, output, rubric);

// Track reputation
updateReputation(agentId, evaluation.score);
const rep = getReputation(agentId); // { score, confidence, history }
```

## When to Use
- Quality control gates before publishing agent outputs
- Ranking agents in a swarm by performance
- Compliance audit trails for regulated domains
- A/B testing agent variants by score
