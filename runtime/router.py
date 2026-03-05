"""
Kognai Runtime — Model Router
Layer 1: Intelligent task routing across local and cloud inference tiers.

Architecture:
    Tier 0 (Nano)  → Qwen3-0.6B local — classification, tagging, formatting
    Tier 1 (Local) → Qwen3-4B local — summarization, simple Q&A, drafting
    Tier 2 (Power) → Qwen3-32B local — research, analysis, code, reasoning (Mac Mini M4 24GB)
    Tier 3 (Cloud) → Claude Sonnet — complex orchestration, tool use, critical path
    Tier 4 (Apex)  → Claude Opus — highest-stakes reasoning, architecture decisions
"""

import re
import time
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("kognai.router")

# ─────────────────────────────────────────────
# Enums & Config
# ─────────────────────────────────────────────

class Tier(Enum):
    NANO  = 0  # Qwen3-0.6B — local
    LOCAL = 1  # Qwen3-4B — local
    POWER = 2  # Qwen3-32B — local
    CLOUD = 3  # Claude Sonnet — API
    APEX  = 4  # Claude Opus — API

@dataclass
class ModelConfig:
    name: str
    tier: Tier
    endpoint: str              # Ollama URL or Anthropic model ID
    cost_per_1k_tokens: float  # USD (0.0 for local)
    max_context: int
    think_capable: bool = False
    avg_tps: int = 30

MODELS: dict[Tier, ModelConfig] = {
    Tier.NANO: ModelConfig(
        name="qwen3:0.6b",
        tier=Tier.NANO,
        endpoint="http://localhost:11434",
        cost_per_1k_tokens=0.0,
        max_context=32_000,
        think_capable=False,
        avg_tps=120,
    ),
    Tier.LOCAL: ModelConfig(
        name="qwen3:4b",
        tier=Tier.LOCAL,
        endpoint="http://localhost:11434",
        cost_per_1k_tokens=0.0,
        max_context=32_000,
        think_capable=True,
        avg_tps=60,
    ),
    Tier.POWER: ModelConfig(
        name="qwen3:14b",
        tier=Tier.POWER,
        endpoint="http://localhost:11434",
        cost_per_1k_tokens=0.0,
        max_context=40_000,
        think_capable=True,
        avg_tps=50,
    ),
    Tier.CLOUD: ModelConfig(
        name="claude-sonnet-4-20250514",
        tier=Tier.CLOUD,
        endpoint="https://api.anthropic.com/v1/messages",
        cost_per_1k_tokens=0.003,
        max_context=200_000,
        think_capable=True,
        avg_tps=80,
    ),
    Tier.APEX: ModelConfig(
        name="claude-opus-4-20250514",
        tier=Tier.APEX,
        endpoint="https://api.anthropic.com/v1/messages",
        cost_per_1k_tokens=0.015,
        max_context=200_000,
        think_capable=True,
        avg_tps=40,
    ),
}

# ─────────────────────────────────────────────
# Task Classification
# ─────────────────────────────────────────────

class TaskType(Enum):
    CLASSIFY   = "classify"
    FORMAT     = "format"
    SUMMARIZE  = "summarize"
    DRAFT      = "draft"
    ANALYZE    = "analyze"
    CODE       = "code"
    REASON     = "reason"
    ORCHESTRATE = "orchestrate"
    ARCHITECT  = "architect"

TASK_SIGNALS: dict[TaskType, list[str]] = {
    TaskType.CLASSIFY:    ["classify", "label", "tag", "categorize", "detect", "identify", "is this"],
    TaskType.FORMAT:      ["format", "convert", "transform", "restructure", "parse", "extract"],
    TaskType.SUMMARIZE:   ["summarize", "summary", "tldr", "condense", "shorten", "brief"],
    TaskType.DRAFT:       ["draft", "write", "compose", "email", "message", "template"],
    TaskType.ANALYZE:     ["analyze", "analyse", "compare", "evaluate", "review", "assess", "tradeoff"],
    TaskType.CODE:        ["code", "function", "script", "debug", "implement", "refactor", "build"],
    TaskType.REASON:      ["why", "how does", "explain", "reason", "think through", "step by step"],
    TaskType.ORCHESTRATE: ["orchestrate", "coordinate", "agent", "workflow", "pipeline", "swarm"],
    TaskType.ARCHITECT:   ["architecture", "design system", "strategy", "kognai", "infrastructure", "sovereign"],
}

TASK_TIER_MAP: dict[TaskType, Tier] = {
    TaskType.CLASSIFY:    Tier.NANO,
    TaskType.FORMAT:      Tier.NANO,
    TaskType.SUMMARIZE:   Tier.LOCAL,
    TaskType.DRAFT:       Tier.LOCAL,
    TaskType.ANALYZE:     Tier.POWER,
    TaskType.CODE:        Tier.POWER,
    TaskType.REASON:      Tier.POWER,
    TaskType.ORCHESTRATE: Tier.CLOUD,
    TaskType.ARCHITECT:   Tier.APEX,
}

@dataclass
class RoutingDecision:
    task_type: TaskType
    tier: Tier
    model: ModelConfig
    think_mode: bool
    reasoning: str
    estimated_cost: float = 0.0
    fallback_tier: Optional[Tier] = None

# ─────────────────────────────────────────────
# Router Core
# ─────────────────────────────────────────────

class KognaiRouter:
    def __init__(
        self,
        force_local: bool = False,
        cost_budget_usd: float = 0.10,
        min_tier: Tier = Tier.NANO,
        max_tier: Tier = Tier.APEX,
    ):
        self.force_local = force_local
        self.cost_budget = cost_budget_usd
        self.min_tier = min_tier
        self.max_tier = max_tier
        self._stats = {"total_tasks": 0, "total_cost": 0.0, "tier_counts": {t: 0 for t in Tier}}

    def classify_task(self, prompt: str) -> TaskType:
        prompt_lower = prompt.lower()
        scores: dict[TaskType, int] = {t: 0 for t in TaskType}
        for task_type, signals in TASK_SIGNALS.items():
            for signal in signals:
                if signal in prompt_lower:
                    scores[task_type] += 1
        best = max(scores, key=lambda t: scores[t])
        return best if scores[best] > 0 else TaskType.ANALYZE

    def should_think(self, task_type: TaskType, prompt: str) -> bool:
        # Only enable think mode for cloud tiers — too slow locally
        return False

    def select_tier(self, task_type: TaskType, prompt: str) -> tuple[Tier, str]:
        base_tier = TASK_TIER_MAP[task_type]
        word_count = len(prompt.split())
        if word_count > 500:
            base_tier = Tier(min(base_tier.value + 1, Tier.APEX.value))
            reason = f"escalated (long prompt: {word_count} words)"
        else:
            reason = f"base tier for {task_type.value}"
        if self.force_local and base_tier.value >= Tier.CLOUD.value:
            base_tier = Tier.POWER
            reason += " → capped at POWER (sovereign mode)"
        final_tier = Tier(max(self.min_tier.value, min(self.max_tier.value, base_tier.value)))
        return final_tier, reason

    def route(self, prompt: str, context_tokens: int = 0) -> RoutingDecision:
        task_type = self.classify_task(prompt)
        tier, reasoning = self.select_tier(task_type, prompt)
        model = MODELS[tier]
        think_mode = self.should_think(task_type, prompt) and model.think_capable
        estimated_tokens = (context_tokens + len(prompt.split()) * 1.3 + 500) / 1000
        estimated_cost = model.cost_per_1k_tokens * estimated_tokens
        if estimated_cost > self.cost_budget and tier.value >= Tier.CLOUD.value:
            fallback = Tier.POWER
            log.warning(f"Cost ${estimated_cost:.4f} exceeds budget ${self.cost_budget} → fallback to POWER")
        else:
            fallback = None
        decision = RoutingDecision(
            task_type=task_type,
            tier=fallback or tier,
            model=MODELS[fallback or tier],
            think_mode=think_mode,
            reasoning=reasoning,
            estimated_cost=estimated_cost if not fallback else 0.0,
            fallback_tier=fallback,
        )
        self._stats["total_tasks"] += 1
        self._stats["total_cost"] += decision.estimated_cost
        self._stats["tier_counts"][decision.tier] += 1
        log.info(
            f"[ROUTE] {task_type.value} → {decision.tier.name} ({decision.model.name}) "
            f"think={think_mode} cost=${decision.estimated_cost:.5f}"
        )
        return decision

    def stats(self) -> dict:
        total = self._stats["total_tasks"] or 1
        return {
            **self._stats,
            "local_pct": round(
                sum(self._stats["tier_counts"][t] for t in [Tier.NANO, Tier.LOCAL, Tier.POWER])
                / total * 100, 1
            ),
            "avg_cost_per_task": round(self._stats["total_cost"] / total, 6),
        }

# ─────────────────────────────────────────────
# Inference Adapters
# ─────────────────────────────────────────────

def run_ollama(model_name: str, prompt: str, think: bool = False, system: str = "") -> str:
    prefix = "/think\n" if think else "/no_think\n"
    payload = {
        "model": model_name,
        "prompt": prefix + prompt,
        "system": system,
        "stream": False,
    }
    resp = httpx.post("http://localhost:11434/api/generate", json=payload, timeout=600)
    resp.raise_for_status()
    return resp.json()["response"]

def run_claude(model_name: str, prompt: str, think: bool = False,
               system: str = "", api_key: str = "") -> str:
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    messages = [{"role": "user", "content": prompt}]
    payload = {
        "model": model_name,
        "max_tokens": 4096,
        "messages": messages,
    }
    if system:
        payload["system"] = system
    if think:
        payload["thinking"] = {"type": "enabled", "budget_tokens": 2048}
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers=headers,
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return " ".join(b["text"] for b in data["content"] if b["type"] == "text")

# ─────────────────────────────────────────────
# High-Level Agent Interface
# ─────────────────────────────────────────────

class KognaiAgent:
    """
    Drop-in agent wrapper. Takes a prompt, routes it, executes inference.
    Individual Kognai agents call this — they don't know which model runs underneath.
    """
    def __init__(
        self,
        system_prompt: str = "",
        anthropic_api_key: str = "",
        force_local: bool = False,
        cost_budget: float = 0.10,
    ):
        self.system = system_prompt
        self.api_key = anthropic_api_key
        self.router = KognaiRouter(force_local=force_local, cost_budget_usd=cost_budget)

    def run(self, prompt: str, context_tokens: int = 0) -> dict:
        start = time.time()
        decision = self.router.route(prompt, context_tokens)
        model = decision.model
        try:
            if model.tier.value <= Tier.POWER.value:
                response = run_ollama(
                    model.name, prompt,
                    think=decision.think_mode,
                    system=self.system,
                )
            else:
                response = run_claude(
                    model.name, prompt,
                    think=decision.think_mode,
                    system=self.system,
                    api_key=self.api_key,
                )
        except Exception as e:
            log.error(f"Inference failed on {model.name}: {e}")
            response = run_ollama("qwen3:14b", prompt, think=False, system=self.system)
            decision.tier = Tier.POWER
        elapsed = round(time.time() - start, 2)
        return {
            "response": response,
            "model": model.name,
            "tier": decision.tier.name,
            "task_type": decision.task_type.value,
            "think_mode": decision.think_mode,
            "cost_usd": decision.estimated_cost,
            "latency_s": elapsed,
            "routing_reason": decision.reasoning,
        }

    def stats(self) -> dict:
        return self.router.stats()

# ─────────────────────────────────────────────
# Example Usage
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import os

    agent = KognaiAgent(
        system_prompt="You are a Kognai infrastructure agent. Be concise and precise.",
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        force_local=False,  # Sovereign mode — local only for now
        cost_budget=0.05,
    )

    test_prompts = [
        "Classify this text as positive or negative: 'The study results were promising.'",
        "Summarize the key findings of the ASCVD study in 3 bullet points.",
        "Analyze the architectural tradeoffs between event-driven and polling agent communication.",
        "Design the sovereign hosting layer for a 9-layer agent infrastructure platform.",
    ]

    print("\n" + "="*60)
    print("KOGNAI ROUTER — Test Run")
    print("="*60)

    for prompt in test_prompts:
        print(f"\n  Prompt: {prompt[:70]}...")
        result = agent.run(prompt)
        print(f"  Tier:   {result['tier']} ({result['model']})")
        print(f"  Task:   {result['task_type']}")
        print(f"  Think:  {result['think_mode']}")
        print(f"  Cost:   ${result['cost_usd']:.5f}")
        print(f"  Time:   {result['latency_s']}s")

    print("\n" + "="*60)
    print("ROUTING STATS:", agent.stats())
    print("="*60)
