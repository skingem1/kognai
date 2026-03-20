---
name: sophie-optimizer
version: 1.0.0
description: Prompt optimization skill for Kognai agents. Analyzes prompts for token efficiency, clarity, and model-specific optimization. Reduces prompt size while preserving intent.
---

# Sophie Optimizer

Prompt optimization skill that reduces token usage while maintaining output quality.

## When to Use

- Before sending long prompts to cloud models (Tier 3/4)
- When context window is filling up
- To optimize system prompts for agent configs
- When routing detects prompt could use a cheaper model with optimization

## Capabilities

### 1. Token Reduction
- Remove redundant instructions
- Compress verbose examples into minimal patterns
- Deduplicate repeated context
- Strip unnecessary formatting

### 2. Model-Specific Optimization
- Adjust prompt style for target model (qwen3 vs claude)
- Add chain-of-thought markers for reasoning models
- Remove COT for simple extraction tasks
- Match prompt format to model strengths

### 3. Clarity Enhancement
- Restructure ambiguous instructions
- Add explicit output format specifications
- Separate system/user/assistant roles clearly
- Flag conflicting instructions

## Usage

```bash
# Optimize a prompt file
npx tsx skills/sophie-optimizer/optimize.ts --file prompt.txt

# Optimize inline text
npx tsx skills/sophie-optimizer/optimize.ts --text "Your long prompt here..."

# Optimize for specific model
npx tsx skills/sophie-optimizer/optimize.ts --file prompt.txt --model qwen3:4b

# Report only (no modification)
npx tsx skills/sophie-optimizer/optimize.ts --file prompt.txt --report
```

## Output

Returns optimized prompt + metrics:
- Original tokens (estimated)
- Optimized tokens (estimated)
- Reduction percentage
- Optimization actions taken

## Integration

Sophie integrates with ClawRouter: when a prompt exceeds the target model's sweet spot, Sophie optimizes before routing. This can downgrade a Tier 3 call to Tier 2, saving cost.
