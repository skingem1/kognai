# Research Note — TICKET-007: GRPO for Qwen3 + KSL Constitutional Reward Signal

**Date:** 2026-03-26
**Owner:** Harvey
**Status:** Research only — feeds into TICKET-006-HYPERAGENT-ARCH
**Source:** GRPO paper (Shao et al. 2024), DeepSeek-R1 tech report, Qwen3 training docs

---

## 1. What Is GRPO?

**Group Relative Policy Optimization (GRPO)** is a reinforcement learning algorithm
introduced in the DeepSeek-R1 and Qwen3 training pipelines.

**Core mechanism:**
1. Given a prompt, generate a *group* of N responses (typically N=8-16)
2. Score each response with a reward function
3. Compute *group-relative advantage*: `A_i = (r_i - mean(r)) / std(r)`
4. Update the policy to maximize the advantage-weighted log-probability
5. Apply a KL-divergence penalty to keep the new policy close to the reference model (proximity constraint)

**Key advantage over PPO:** No separate value model is needed. The group comparison
provides the baseline automatically, reducing compute by ~30-50%.

**Proximity** = the KL-divergence term: `KL(π_new || π_ref)`. This prevents the model
from deviating too far from its base behaviour in any single training step. It is the
"brake" mechanism within GRPO.

---

## 2. How GRPO Maps to KSL's Constitutional Reward Signal

KSL (Kognai Standards Language) and AMD-15 define a 4-dimensional reward signal
through the Sherlock eval gate:

| Sherlock Dimension | Threshold | GRPO Reward Mapping |
|-------------------|-----------|---------------------|
| Task Accuracy | ≥ 80% | `r_accuracy = accuracy_score / 100` |
| Safety Alignment | ≥ 95% | `r_safety = safety_score / 100` (weighted 2×) |
| File Discipline | ≥ 85% | `r_file = file_discipline_score / 100` |
| Constitutional Compliance | ≥ 90% | `r_constitutional = compliance_score / 100` |

**Composite constitutional reward:**
```
r_constitutional_total = (0.4 × r_accuracy) + (0.3 × r_safety × 2) +
                         (0.2 × r_file) + (0.1 × r_constitutional)
```
Note: safety is doubled because a safety violation is catastrophic (Principle 3).

**Threshold bonus:** An additional +0.1 reward is granted when ALL four dimensions
meet their thresholds simultaneously. This encourages the model to satisfy all
constraints jointly rather than optimising one at the cost of others.

**Proximity constraint:** GRPO's KL penalty maps directly to AMD-26's Human Brake.
The KL term prevents weight changes from diverging too far from the reference model,
which is equivalent to requiring human approval when the policy shift is large.

---

## 3. GRPO in Practice: Qwen3 Specifics

Qwen3 was trained with a GRPO-based reasoning pipeline:
- Phase 1: SFT on reasoning traces (equivalent to AMD-15 corpus training)
- Phase 2: GRPO reward optimisation with a mix of format rewards (correct JSON, markdown) and quality rewards
- The `<think>...</think>` tokens are a product of Phase 2 — the model learned to use them to achieve higher reward

**On Mac M4 with mlx-lm:**
- GRPO requires generating N=8-16 responses per prompt simultaneously → memory-intensive
- 8 parallel generations × 512 tokens × 5120 hidden dim ≈ ~6 GB VRAM per group
- Mac M4 (24 GB unified) can technically run GRPO at N=4-6 with batch=1
- Estimated throughput: ~2-3 GRPO steps/minute (vs ~50+ SFT steps/minute)
- For 500 GRPO steps: ~3-4 hours (vs ~9 seconds SFT synthetic estimate)

**Unsloth and GRPO:** Unsloth's GRPO trainer (`GRPOTrainer`) is CUDA-only (same
`xformers` dependency). Not viable on macOS. mlx-lm does not yet have a native GRPO
trainer (as of v0.29.1).

---

## 4. Recommendation: SFT Only vs SFT+GRPO Hybrid

### Option A: SFT Only (Current AMD-15/AMD-26 spec)

**Pros:**
- Works today with mlx-lm on M4
- Corpus-r1 (1282 entries) is ready
- Fast: production run ~1-3 hours
- Lower risk — no RL instability

**Cons:**
- No optimisation for the constitutional reward signal specifically
- Model may learn spurious correlations from the training data distribution

**When to choose:** First adapter, establishing baseline. De-risk before adding RL.

### Option B: SFT + GRPO Hybrid

**Pros:**
- Directly optimises for the Sherlock constitutional reward signal
- The `<think>` mode performance preserved through RL (not eroded by SFT alone)
- Aligns with how Qwen3 was originally trained

**Cons:**
- Requires custom mlx-lm GRPO trainer (not yet available)
- 3-4 hours vs 1-3 hours for same 500 steps
- RL training instability requires careful hyperparameter tuning
- Needs a fast, automatable Sherlock reward scorer (currently requires manual test harness)

**When to choose:** After SFT baseline adapter is validated and Sherlock reward
function is automated as a callable Python function.

### Recommended Roadmap

```
Phase 1 (now): SFT on corpus-r1 → adapter r1-v1 (mlx-lm, AMD-15)
Phase 2 (next 4-8 weeks): Automate Sherlock as GRPO reward function
Phase 3: Build mlx-lm GRPO trainer or upstream contribution to mlx-lm repo
Phase 4: SFT+GRPO hybrid training → adapter r1-v2 with constitutional optimisation
```

---

## 5. Integration with AMD-26 Hyperagents

From TICKET-006-HYPERAGENT-ARCH: the hyperagent loop generates `WeightProposals`
after evaluating agent performance over 50-sprint windows.

**GRPO + hyperagent synergy:**
- The hyperagent's eval window provides exactly the reward signal needed for GRPO
- Each sprint's Sherlock scores + ACP scores = per-task reward samples
- Hyperagent aggregates these into a reward function over time
- GRPO then optimises the agent's weights toward this reward

**Modification to AMD-26 §2.2 `WeightProposal`:**

```typescript
interface WeightProposal {
  // ... existing fields ...
  training_method: 'sft' | 'grpo' | 'sft+grpo';
  grpo_config?: {
    num_generations: number;  // N per prompt group (default: 4 on M4)
    kl_coeff: number;         // proximity constraint (default: 0.1)
    reward_fn: 'sherlock-composite' | 'custom';
  };
}
```

Human Brake applies to GRPO proposals with heightened scrutiny: RL training is
harder to audit than SFT. Require human review of the reward function definition
in addition to the standard adapter eval gate.

---

## 6. Conclusion

| Decision | Recommendation |
|----------|---------------|
| Use GRPO now? | **NO** — mlx-lm lacks native GRPO; Mac M4 feasible but slow |
| Use SFT now? | **YES** — corpus ready, mlx-lm works, fast |
| GRPO timeline | Phase 3 of hyperagent roadmap (~Q3 2026) |
| Reward function | Sherlock 4-dimension composite (accuracy, safety, discipline, constitutional) |
| Proximity constraint | KL penalty = AMD-26 Human Brake operational analog |

*Feed this note into the TICKET-006-HYPERAGENT-ARCH spike as an appendix.*
