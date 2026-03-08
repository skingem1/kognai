"""Parse routing JSONL logs for cost tracking."""

import json
from datetime import date
from pathlib import Path

# Cost per 1k tokens by tier (from router.py)
TIER_COSTS = {
    "NANO": 0.0,
    "LOCAL": 0.0,
    "POWER": 0.0,
    "CLOUD": 0.003,
    "APEX": 0.015,
}

# Provider to tier mapping
PROVIDER_TIER = {
    "ollama": "LOCAL",
    "anthropic": "CLOUD",
    "minimax": "CLOUD",
}


def parse_routing_log(path: Path) -> list:
    """Parse a single routing JSONL file."""
    entries = []
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    except OSError:
        pass
    return entries


def get_costs(routing_dir: Path, date_filter: str = None) -> dict:
    """Aggregate routing costs from JSONL logs."""
    if date_filter is None:
        date_filter = date.today().isoformat()

    by_tier = {"NANO": 0, "LOCAL": 0, "POWER": 0, "CLOUD": 0, "APEX": 0}
    by_provider = {}
    total_cost = 0.0
    task_count = 0

    # Try specific date file first
    specific_file = routing_dir / f"{date_filter}.jsonl"
    files_to_read = []

    if specific_file.exists():
        files_to_read = [specific_file]
    else:
        # Read all files if no specific date match
        files_to_read = sorted(routing_dir.glob("*.jsonl"))

    for f in files_to_read:
        entries = parse_routing_log(f)
        for entry in entries:
            task_count += 1
            provider = entry.get("provider", "unknown")
            tier = entry.get("tier", PROVIDER_TIER.get(provider, "CLOUD"))
            cost = entry.get("cost_usd", TIER_COSTS.get(tier, 0.0))

            by_tier[tier] = by_tier.get(tier, 0) + 1
            by_provider[provider] = by_provider.get(provider, 0) + 1
            total_cost += cost

    total_tasks = sum(by_tier.values())
    local_tasks = by_tier.get("NANO", 0) + by_tier.get("LOCAL", 0) + by_tier.get("POWER", 0)
    local_pct = round(local_tasks / total_tasks * 100, 1) if total_tasks > 0 else 0

    return {
        "date": date_filter,
        "total_usd": round(total_cost, 6),
        "task_count": task_count,
        "by_tier": by_tier,
        "by_provider": by_provider,
        "local_pct": local_pct,
        "cloud_pct": round(100 - local_pct, 1),
        "avg_cost_per_task": round(total_cost / task_count, 6) if task_count > 0 else 0,
        "daily_budget": 5.00,
        "budget_remaining": round(5.00 - total_cost, 2),
    }


def get_cost_summary(routing_dir: Path) -> dict:
    """Aggregate costs across all routing logs."""
    all_entries = []
    for f in sorted(routing_dir.glob("*.jsonl")):
        all_entries.extend(parse_routing_log(f))

    if not all_entries:
        return {
            "total_usd": 0.0,
            "total_tasks": 0,
            "days_tracked": 0,
            "avg_daily_cost": 0.0,
            "by_tier": {},
            "local_pct": 0,
        }

    by_tier = {}
    total_cost = 0.0
    days = set()

    for entry in all_entries:
        tier = entry.get("tier", "unknown")
        cost = entry.get("cost_usd", 0.0)
        by_tier[tier] = by_tier.get(tier, 0) + 1
        total_cost += cost
        dt = entry.get("executed_at", entry.get("queued_at", ""))
        if dt:
            days.add(dt[:10])

    total_tasks = len(all_entries)
    local_tasks = sum(by_tier.get(t, 0) for t in ["NANO", "LOCAL", "POWER"])

    return {
        "total_usd": round(total_cost, 4),
        "total_tasks": total_tasks,
        "days_tracked": len(days),
        "avg_daily_cost": round(total_cost / len(days), 4) if days else 0,
        "by_tier": by_tier,
        "local_pct": round(local_tasks / total_tasks * 100, 1) if total_tasks > 0 else 0,
    }


def get_model_stats(routing_dir: Path) -> dict:
    """Aggregate routing decisions by model and sprint_id across all logs."""
    all_entries = []
    for f in sorted(routing_dir.glob("*.jsonl")):
        all_entries.extend(parse_routing_log(f))

    by_model = {}
    by_sprint = {}
    recent = []

    for entry in all_entries:
        model = entry.get("model", "unknown")
        sprint = entry.get("sprint_id", "unknown")
        by_model[model] = by_model.get(model, 0) + 1
        by_sprint[sprint] = by_sprint.get(sprint, 0) + 1

    # Most recent 5 entries (last lines in most recent file)
    if all_entries:
        recent = [
            {
                "task_id": e.get("task_id", ""),
                "sprint_id": e.get("sprint_id", ""),
                "model": e.get("model", ""),
                "routingReason": e.get("routingReason", ""),
                "logged_at": e.get("logged_at", ""),
            }
            for e in all_entries[-5:]
        ]

    return {
        "total": len(all_entries),
        "by_model": by_model,
        "by_sprint": by_sprint,
        "recent": recent,
    }
