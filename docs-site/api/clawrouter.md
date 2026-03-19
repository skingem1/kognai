# ClawRouter API Reference

The ClawRouter is Kognai's 5-tier model routing engine. It classifies tasks, selects the optimal model tier, enforces ACP trust scores, and manages cost budgets.

**Source**: `runtime/router.py`

## Task Classification

The router classifies prompts into task types using keyword signal matching:

| Task Type | Signals | Default Tier |
|-----------|---------|-------------|
| `classify` | classify, label, tag, categorize, detect | Nano (0) |
| `format` | format, convert, transform, parse, extract | Nano (0) |
| `summarize` | summarize, summary, tldr, condense | Local (1) |
| `draft` | draft, write, compose, email, template | Local (1) |
| `analyze` | analyze, compare, evaluate, review | Power (2) |
| `code` | code, function, script, debug, implement | Power (2) |
| `reason` | why, how does, explain, step by step | Power (2) |
| `lang` | translate, arabic, derja, localize | Power (2) |
| `content` | tiktok, caption, post, clip, trending | Power (2) |
| `data` | dataframe, csv, json data, etl, aggregate | Power (2) |
| `audit` | audit, quality check, red team, score | Cloud (3) |
| `orchestrate` | orchestrate, coordinate, agent, workflow | Cloud (3) |
| `architect` | architecture, design system, strategy | Apex (4) |

## Router Configuration

```python
from runtime.router import KognaiRouter, Tier

router = KognaiRouter(
    force_local=False,       # Cap at Tier 2 when True (sovereign mode)
    cost_budget_usd=0.10,    # Per-task budget — exceeding falls back to Power
    min_tier=Tier.NANO,      # Floor tier
    max_tier=Tier.APEX,      # Ceiling tier
    acp_enabled=True,        # Enable ACP trust score enforcement
)
```

## Routing a Task

```python
decision = router.route(
    prompt="Analyze the architectural tradeoffs of event-driven vs polling",
    context_tokens=0,
    agent_id="cto",          # Optional — enables ACP enforcement
)

print(decision.tier)          # Tier.POWER
print(decision.model.name)    # "qwen3:14b"
print(decision.task_type)     # TaskType.ANALYZE
print(decision.estimated_cost) # 0.0
print(decision.reasoning)     # "base tier for analyze"
```

### `RoutingDecision` Fields

| Field | Type | Description |
|-------|------|-------------|
| `task_type` | `TaskType` | Classified task type |
| `tier` | `Tier` | Selected model tier |
| `model` | `ModelConfig` | Full model configuration |
| `think_mode` | `bool` | Whether extended thinking is enabled |
| `reasoning` | `str` | Human-readable routing explanation |
| `estimated_cost` | `float` | Estimated cost in USD |
| `fallback_tier` | `Tier \| None` | Set if budget forced a downgrade |
| `acp_blocked` | `bool` | Whether ACP blocked the request |

## Escalation Rules

1. **Long prompts** (>500 words): tier bumped +1
2. **Sovereign mode** (`force_local=True`): capped at Power (Tier 2)
3. **Budget exceeded**: Cloud/Apex tasks fall back to Power
4. **ACP block**: agents below safety floor (70) or composite minimum (50) are rejected

## ACP Enforcement

The Agent Constitutional Protocol gates every routing decision:

```python
# Trust scores loaded from acp/trust-scores.json
# Dimensions: safety, competence, reliability, alignment
# Thresholds:
#   safety_hard_floor: 70   — agents below are blocked entirely
#   minimum_route: 50       — composite minimum to route any task
#   dimension_minimum: 60   — per-dimension minimum for sensitive tasks
```

## KognaiAgent — High-Level Interface

```python
from runtime.router import KognaiAgent

agent = KognaiAgent(
    system_prompt="You are a Kognai infrastructure agent.",
    anthropic_api_key="sk-...",
    force_local=False,
    cost_budget=0.05,
)

result = agent.run("Summarize the key findings in 3 bullet points.")
print(result["response"])     # Model output
print(result["model"])        # "qwen3:4b"
print(result["tier"])         # "LOCAL"
print(result["cost_usd"])     # 0.0
print(result["latency_s"])    # 1.23
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `response` | `str` | Model output text |
| `model` | `str` | Model name used |
| `tier` | `str` | Tier name (NANO, LOCAL, POWER, CLOUD, APEX) |
| `task_type` | `str` | Classified task type |
| `think_mode` | `bool` | Whether thinking was enabled |
| `cost_usd` | `float` | Estimated cost |
| `latency_s` | `float` | Wall-clock inference time |
| `routing_reason` | `str` | Why this tier was selected |

## Inference Adapters

- **Local (Tiers 0-2)**: Ollama at `http://localhost:11434/api/generate`
- **Cloud (Tiers 3-4)**: Anthropic API at `https://api.anthropic.com/v1/messages`

Fallback: if cloud inference fails, automatically retries on `qwen3:14b` (Power tier).

## Logging

All routing decisions are logged to `logs/routing/YYYY-MM-DD.jsonl` with:
- Timestamp, task type, tier, model, reasoning
- Prompt word count and estimated cost

Access aggregate stats via `router.stats()`:

```python
stats = router.stats()
print(stats["local_pct"])         # % of tasks handled locally
print(stats["avg_cost_per_task"]) # Average USD per task
print(stats["acp_blocks"])        # Number of ACP-blocked requests
```
