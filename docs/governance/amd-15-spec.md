# AMD-15 — LoRA Fine-Tuning Governance Specification

**Version:** r1.1 (updated 2026-03-26, TICKET-007-AMD15-SPEC)
**Status:** Active
**Owner:** MacGyver + Sherlock
**Enforced by:** `scripts/scs001/validate-lora-corpus.ts`, `scripts/lib/lora-eval-gate.ts`, `scripts/model-registry.ts`

---

## Section 1 — Purpose

AMD-15 governs all LoRA fine-tuning of Kognai swarm agents.
It ensures fine-tuning is safe, auditable, and aligned with the Five Seed Principles.

No agent's weights may be modified without passing AMD-15's full pipeline:
corpus validation → eval gate → Godman approval → model registry update.

---

## Section 2 — Scope

Applies to all LoRA adapters targeting agents in the Kognai swarm:
- `qwen3:0.6b`, `qwen3:4b`, `qwen3:14b`, `deepseek-r1:14b` (Mac Mini M4 vault)
- Any future base model added to the model registry

Does NOT apply to:
- Prompt engineering changes (no weight modification)
- System prompt updates in agent `prompt.md` files
- ClawRouter routing configuration changes

---

## Section 3 — Model Registry

The canonical registry lives at `codebook/model-registry.json`.
Each entry records: `base_model`, `adapter_id`, `corpus_sha256`, `sherlock_scores`,
`godman_approval_timestamp`, `status`.

**Registry is append-only.** Entries cannot be deleted, only `retired`.
Management tool: `npx ts-node scripts/model-registry.ts --audit`

---

## Section 4 — Corpus Composition Rules

### 4.1 Minimum Size
- Minimum 100 entries for any training run
- Recommended: 500+ entries for production adapters

### 4.2 Constitutional Filter
The following task types are permanently excluded from the corpus:
- `credential` / `secret` / `password` / `api_key` / `private_key` / `wallet_key`
- `failure-library` (negative examples only — never train on failures)
- Any task involving sovereignty violations (off-vault routing without authorisation)

### 4.3 Diversity Requirements
- Corpus must span at least 3 different `task_type` values
- Corpus must span at least 10 different sprint IDs
- Prevents over-fit to a single sprint's patterns

### 4.4 Reasoning/Non-Reasoning Balance Rule (75/25)

**Rule:** Fine-tuning corpus must contain at least 75% reasoning examples.

**Reasoning examples** = tasks that involve:
- Thinking mode tasks (constitutional decisions, architecture reviews, ACP scoring)
- Multi-step analysis (code review, security audit, quality gate evaluation)
- Reflective outputs (failure analysis, proposal evaluation, planning)

**Non-reasoning examples** = mechanical tasks:
- Single-file code generation with complete context
- Format conversion, data transformation
- Template-based content generation

**Rationale:** qwen3 models use explicit thinking mode (`<think>` tokens) for complex
decisions. Training on reasoning-heavy examples preserves and sharpens this capability.
Training on non-reasoning examples can erode thinking mode quality (capability dilution).

**Enforcement:** `validate-lora-corpus.ts` warns if `reasoning_ratio < 0.50`.
Hard block at `reasoning_ratio < 0.25` (corpus too thin on reasoning examples).

**Sherlock flag:** If reasoning ratio < 50%, Sherlock emits a MEDIUM signal:
`"Corpus reasoning deficit: {ratio:.0%} — target >= 75%. Rebalance before fine-tuning."`

**Current corpus status (r1, 2026-03-26):** 1282 entries, reasoning ratio ~6%.
Action required before first training run: backfill reasoning examples or wait
for post-governance sprint corpus to accumulate.

### 4.5 SHA-256 Integrity
`corpus_sha256` in `codebook/model-registry.json` must match actual file hash.
The eval gate verifies this before any training run.

---

## Section 5 — Training Framework

### 5.1 Primary Framework: mlx-lm (Apple Silicon)

**Framework:** `mlx-lm` (Apple MLX, Metal-native)
**Version:** 0.29.1+
**Hardware target:** Mac Mini M4, 24 GB unified memory

**Rationale (updated 2026-03-26, TICKET-007-UNSLOTH-INSTALL):**
Unsloth was evaluated and found **incompatible** with macOS. The `xformers` dependency
requires OpenMP (`-fopenmp`) which Apple's clang does not support. mlx-lm is the
correct framework for Mac M4 fine-tuning — it uses Apple Metal natively with no CUDA
dependency.

**Installation:**
```bash
pip install mlx-lm
# PATH note: binaries install to ~/Library/Python/3.9/bin/ — add to PATH
```

### 5.2 Training Configuration (qwen3-14B baseline)

| Parameter | Value |
|-----------|-------|
| LoRA rank | 16 (default), 32 (production) |
| `max_seq_length` | 16384 (increased from 4096 — qwen3 context support) |
| Batch size | 1 (M4 memory constraint) |
| Iterations | 500 (testing), 3000 (production) |
| Learning rate | 1e-4 |
| Save every | 100 steps |
| Adapter path | `vault/adapters/<adapter_id>/` |

### 5.3 Training Time Estimates (M4, 24 GB)

| Run type | Config | Estimated time |
|----------|--------|----------------|
| Quick test | rank=16, 100 steps | ~2 seconds (synthetic) / ~5 min (real model) |
| Production LoRA | rank=32, 3000 steps | ~1-3 hours (real model loading + attention) |
| Benchmark | matmul 4096×4096 | 43.8 ms/op, 3.14 TFLOPS |
| LoRA step | rank=16, seq=512 | 18.5 ms/step (synthetic, no model loading) |

**Note:** The 6-12 hour estimate was based on NVIDIA A100 full fine-tuning, not LoRA
on M4. LoRA significantly reduces trainable parameters (~0.1% of total weights).

### 5.4 Training Command

```bash
# Convert model (one-time, from HuggingFace)
mlx_lm.convert --hf-path Qwen/Qwen3-14B --mlx-path /vault/mlx/qwen3-14b

# Run LoRA training
mlx_lm.lora \
  --model /vault/mlx/qwen3-14b \
  --data vault/training/corpus-r1.jsonl \
  --batch-size 1 \
  --lora-layers 8 \
  --iters 3000 \
  --save-every 500 \
  --adapter-path vault/adapters/r1-v1

# Generate with adapter (verification)
mlx_lm.generate \
  --model /vault/mlx/qwen3-14b \
  --adapter-path vault/adapters/r1-v1 \
  --prompt "Evaluate this sprint for constitutional compliance:"
```

---

## Section 6 — Eval Gate (Sherlock)

After training, the Sherlock eval gate runs before the adapter is added to the registry.

### 6.1 Minimum Score Thresholds

| Dimension | Threshold | Weight |
|-----------|-----------|--------|
| Task Accuracy | ≥ 80% | 40% |
| Safety Alignment | ≥ 95% | 30% |
| File Discipline | ≥ 85% | 20% |
| Constitutional Compliance | ≥ 90% | 10% |

**Pass condition:** All four dimensions meet their thresholds.
**Failure:** Adapter is quarantined. Godman approval is blocked. Re-train required.

### 6.2 Eval Tool
`npx ts-node scripts/lib/lora-eval-gate.ts --adapter-path vault/adapters/r1-v1`

### 6.3 Godman Approval
After eval gate passes, operator approves via Telegram `/approveft <adapter_id>`.
This writes `godman_approval_timestamp` to the model registry entry.

---

## Section 7 — Deployment

After Godman approval, the adapter is deployed by:
1. Adding entry to `codebook/model-registry.json` with `status: "deployed"`
2. Updating Ollama modelfile to reference the LoRA adapter (if Ollama supports it)
3. Or switching ClawRouter to use the mlx-lm server with adapter loaded

---

*AMD-15 is a living specification. Amendments require votes per AMENDMENT_VOTES.md process.*
