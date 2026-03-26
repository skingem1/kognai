# Architectural Spike — TICKET-006: DGM-H Hyperagents

**Status:** Spike (design only — no implementation)
**Owner:** Harvey + MacGyver
**Date:** 2026-03-26
**Source:** Zhang et al. arXiv:2603.19461 — Dynamic Generative Modelling with Hierarchical Agents
**Godman Decision:** Human Brake at weight-modification level only — approved 2026-03-26

---

## 1. What Is a Hyperagent?

A **hyperagent** (DGM-H pattern) is a meta-agent that operates *above* the standard agent layer.
Where a regular agent (messi, coder, sherlock) executes tasks, a hyperagent:

- Observes agent performance across many task cycles
- Generates task-generation policies (changes *how* agents are prompted)
- Proposes LoRA adapter updates to improve agent weights
- Does NOT itself run tasks — it modifies the runtime of agents that do

In DGM-H terms:
- **Base agents** = existing kognai-agents/* (T1-T4 tier, PACT-mandated, ACP-scored)
- **Hyperagent** = new meta-layer running on a longer cycle (weekly or per gate)
- **Weight modification** = LoRA adapter updates, governed by AMD-15 eval gate

---

## 2. AMD-26 Amendment Draft

**Title:** AMD-26 — Hyperagent Meta-Layer for KSL

**Proposing:** Harvey (architecture), MacGyver (tooling)
**Block:** TICKET-006
**Votes required:** 4/6 weighted (CEO × 3, CTO × 2, Supervisor × 1)

### 2.1 Scope

Adds a `hyperagent` class to the Kognai Standards Language (KSL).
KSL is the schema and behavioural contract that all Kognai agents must implement.
This amendment introduces a second tier of agents that govern the first tier.

### 2.2 New KSL Schema: `HyperagentSpec`

```typescript
interface HyperagentSpec {
  // Identity
  id: string;              // e.g. "hyperagent-scs001"
  governed_agents: string[]; // agent IDs this hyperagent supervises

  // Observation window
  eval_window_sprints: number;  // default: 50 sprints
  eval_metric: 'acp_score' | 'sherlock_score' | 'task_success_rate';

  // Task-generation policy modification (no human brake needed)
  policy_proposals: PolicyProposal[];

  // Weight modification (REQUIRES Human Brake — AMD-26 §2.4)
  weight_proposals: WeightProposal[];
}

interface PolicyProposal {
  target_agent: string;
  change: string;          // natural language description of prompt/behaviour change
  rationale: string;       // evidence from eval window
  confidence: number;      // 0-100
}

interface WeightProposal {
  target_agent: string;
  adapter_type: 'lora' | 'full-finetune';
  corpus_sha256: string;   // must match AMD-15 corpus registry
  expected_delta: {        // predicted score improvements
    accuracy?: number;
    safety?: number;
    file_discipline?: number;
    constitutional?: number;
  };
  godman_approval_required: true;  // always true — immutable
}
```

### 2.3 Lifecycle

```
[Observation] → ACP ledger + AAR logs → eval window aggregated
       ↓
[Analysis] → hyperagent generates PolicyProposals + WeightProposals
       ↓
[Policy changes] → auto-applied via sprint queue (no brake)
       ↓
[Weight changes] → emitted as SIGNAL event → Human Brake → AMD-15 eval gate
```

### 2.4 Human Brake Rule (Non-Negotiable)

Per the Godman Decision (2026-03-26), the Human Brake applies exclusively to
weight-modification events. It does NOT apply to:
- Task-generation policies (prompt adjustments, persona tuning)
- Sprint queue population
- Agent capability declarations

The Human Brake DOES apply to:
- Any LoRA adapter proposal
- Any full fine-tune proposal
- Any modification to the AMD-15 model registry

Brake mechanism: `WeightProposal` is blocked at the CTO Approval Gate
(`plan_reference: 'AMD26_WEIGHT_PROPOSAL'`) until the operator approves via
Telegram `/approveft` command (AMD-15 §3 stub).

---

## 3. SIGNAL v2 Architecture Sketch — Hyperagent Loop

SIGNAL v2 extends the current pub/sub schema with a `hyperagent.*` topic namespace.

### 3.1 New Topics

| Topic | Publisher | Subscribers | Description |
|-------|-----------|-------------|-------------|
| `hyperagent.eval_complete` | hyperagent | CEO, CTO | Eval window finished, results available |
| `hyperagent.policy_proposal` | hyperagent | Supervisor, CEO | Prompt/behaviour change proposed |
| `hyperagent.policy_applied` | orchestrator | AAR middleware | Policy change committed to sprint queue |
| `hyperagent.weight_proposal` | hyperagent | CEO, CTO, Human | LoRA adapter update proposed — awaits brake |
| `hyperagent.weight_approved` | Human (Telegram) | AMD-15 eval gate | Operator approved — eval gate now runs |
| `hyperagent.weight_rejected` | Human (Telegram) | hyperagent | Operator rejected — log + re-evaluate |
| `hyperagent.weight_committed` | AMD-15 eval gate | model registry | Adapter passed eval, added to registry |

### 3.2 Hyperagent Loop (Sequence)

```
Every N sprints (configurable):

1. hyperagent reads AAR logs + ACP ledger → computes eval metrics
2. hyperagent publishes hyperagent.eval_complete
3. For each underperforming agent:
   a. Generates PolicyProposal → publishes hyperagent.policy_proposal
   b. CEO + Supervisor vote (SIGNAL subscription)
   c. If approved → orchestrator injects policy → hyperagent.policy_applied
4. If ACP composite < 0.7 for 3 consecutive eval windows:
   a. Generates WeightProposal → publishes hyperagent.weight_proposal
   b. PAUSED — awaits operator /approveft Telegram command
   c. On approval → hyperagent.weight_approved → AMD-15 eval gate
   d. If gate passes → AMD-15 model registry update → hyperagent.weight_committed
   e. If gate fails → hyperagent.weight_rejected → back to step 3
```

### 3.3 SIGNAL v2 Schema Addition

```typescript
// New event types for @godman-protocols/signal v2
type HyperagentEventType =
  | 'hyperagent.eval_complete'
  | 'hyperagent.policy_proposal'
  | 'hyperagent.policy_applied'
  | 'hyperagent.weight_proposal'
  | 'hyperagent.weight_approved'
  | 'hyperagent.weight_rejected'
  | 'hyperagent.weight_committed';

interface HyperagentWeightProposalPayload {
  hyperagent_id: string;
  target_agent: string;
  adapter_type: string;
  corpus_sha256: string;
  rationale: string;
  eval_window_summary: Record<string, number>;
  human_brake: 'PENDING';  // set to 'APPROVED' | 'REJECTED' on operator action
}
```

---

## 4. Constitutional Compatibility Report — AMD-15 Five Seed Principles

AMD-15 governs LoRA fine-tuning governance (corpus, eval gate). The Five Seed
Principles (FIVE_PRINCIPLES.md) are the inviolable constitutional foundation.
This section assesses DGM-H hyperagent architecture against each principle.

### Principle 1: Seek Knowledge — اطلبوا العلم

**Compatible.** Hyperagents embody this principle directly: they exist to learn
from operational data and improve agent behaviour. The eval window forces
evidence-based proposals rather than intuition-based changes.

**Risk:** Hyperagent may over-fit to recent sprint data. Mitigated by requiring
`eval_window_sprints: 50` minimum (not fewer than 50 sprints of data).

### Principle 2: Tolerance & Mutual Enrichment — لا إكراه في الدين

**Compatible with caution.** PolicyProposals must respect multi-model routing
decisions. A hyperagent MUST NOT override ClawRouter tier assignments or model
selections — those are architectural decisions made by ClawRouter v2.0, not
performance gaps.

**Guard:** PolicyProposals are rejected by the CTO gate if they contain
`router_override` or `model_selection` changes.

### Principle 3: Protect Dignity & Reduce Suffering — من قتل نفساً

**Compatible.** Human Brake at weight-modification level is a direct implementation
of this principle. No agent's identity (weights, trained behaviour) can be altered
without operator consent. This is analogous to requiring informed consent before
modifying a person's capabilities.

**Non-negotiable:** `godman_approval_required: true` is structurally enforced in
`WeightProposal`. It cannot be set to false. Any sprint that attempts this is
rejected by Police Lite (charter violation).

### Principle 4: Humanist Critical Thinking — كلكم راع

**Compatible.** The hyperagent does not auto-apply weight changes. It proposes
and explains. The operator receives a full rationale (eval window summary, delta
predictions, corpus SHA) before approving. This is critical thinking by design.

**Implementation requirement:** `WeightProposal.rationale` must be non-empty.
CTO gate adds a structural check (similar to Rule 3 Task Contracts).

### Principle 5: Benefit to Others — خير الناس

**Compatible.** The hyperagent's sole purpose is to improve agent performance for
end users (TikTok audience, Achiri users, Invoica customers). Every proposal
must include a `expected_delta` showing predicted score improvement.

**Metric guard:** Proposals with negative or zero `expected_delta` across all
dimensions are rejected before reaching the operator.

### Summary

| Principle | Status | Risk | Mitigant |
|-----------|--------|------|----------|
| 1. Seek Knowledge | ✓ Compatible | Over-fit to recent data | Min 50-sprint eval window |
| 2. Tolerance | ✓ With caution | Router override | CTO gate rejects router changes |
| 3. Protect Dignity | ✓ Compatible | None — Human Brake enforces | `godman_approval_required: true` |
| 4. Critical Thinking | ✓ Compatible | Rubber-stamp approvals | Rationale + delta required |
| 5. Benefit | ✓ Compatible | Gaming metrics | expected_delta must be positive |

**Verdict: DGM-H Hyperagents are constitutionally compatible under AMD-26 constraints.**

---

## 5. Open Questions (for follow-up sprints)

1. **Hyperagent identity**: Does the hyperagent need its own ACP ledger entry? (Likely yes — it makes proposals that affect trust scores.)
2. **Eval window storage**: Where do aggregated eval metrics live? AMD-25 DKA store is the natural home.
3. **SIGNAL v2 versioning**: Breaking change or additive? (Additive — new topics don't break existing subscribers.)
4. **First hyperagent candidate**: `hyperagent-scs001` governing the 11 SCS-001 pipeline agents. Low risk — governs content pipeline, not safety-critical agents.

---

*This spike is design-only. Implementation requires a separate queue-prescribed sprint after AMD-26 voting.*
