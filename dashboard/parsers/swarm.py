"""
Swarm Metrics Parser — Sprint 482
Reads reports/swarm-runs/*.json and computes quality/performance metrics.
"""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
SWARM_DIR = ROOT / "reports" / "swarm-runs"


def _load_runs() -> list[dict[str, Any]]:
    """Load all swarm run reports, sorted by start time."""
    runs = []
    if not SWARM_DIR.exists():
        return runs
    for f in sorted(SWARM_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text())
            if "run_id" in data:
                runs.append(data)
        except (json.JSONDecodeError, KeyError):
            continue
    return runs


def get_swarm_metrics() -> dict[str, Any]:
    """Compute aggregate swarm metrics from all run reports."""
    runs = _load_runs()
    if not runs:
        return {"total_runs": 0, "message": "No swarm runs found"}

    total_tasks = 0
    total_done = 0
    total_rejected = 0
    total_skipped = 0
    total_tokens = 0
    total_duration = 0
    total_conflicts = 0
    total_escalations = 0
    model_usage: dict[str, int] = {}

    for run in runs:
        s = run.get("summary", {})
        total_tasks += s.get("total_tasks", 0)
        total_done += s.get("done", 0)
        total_rejected += s.get("rejected", 0)
        total_skipped += s.get("skipped", 0)
        total_tokens += s.get("total_tokens", 0)
        total_duration += run.get("duration_seconds", 0)
        total_conflicts += s.get("supervisor_conflicts", 0)
        total_escalations += s.get("ceo_escalations", 0)

        for model, stats in run.get("models_used", {}).items():
            model_usage[model] = model_usage.get(model, 0) + stats.get("calls", 0)

    pass_rate = (total_done / total_tasks * 100) if total_tasks > 0 else 0
    avg_duration = (total_duration / len(runs)) if runs else 0
    avg_tokens = (total_tokens / len(runs)) if runs else 0

    return {
        "total_runs": len(runs),
        "total_tasks": total_tasks,
        "tasks_done": total_done,
        "tasks_rejected": total_rejected,
        "tasks_skipped": total_skipped,
        "pass_rate_pct": round(pass_rate, 1),
        "total_tokens": total_tokens,
        "avg_tokens_per_run": round(avg_tokens),
        "total_duration_seconds": total_duration,
        "avg_duration_seconds": round(avg_duration),
        "supervisor_conflicts": total_conflicts,
        "ceo_escalations": total_escalations,
        "model_usage": model_usage,
        "latest_run": runs[-1].get("started_at", "unknown") if runs else None,
    }


def get_sprint_quality_scores() -> list[dict[str, Any]]:
    """Per-run quality scores for dashboard display."""
    runs = _load_runs()
    scores = []
    for run in runs[-20:]:  # last 20 runs
        s = run.get("summary", {})
        total = s.get("total_tasks", 1)
        done = s.get("done", 0)
        rejected = s.get("rejected", 0)

        # Quality score: 100 * (done / total) - penalty for rejections
        quality = round(100 * done / max(total, 1) - 10 * rejected)
        quality = max(0, min(100, quality))

        scores.append({
            "sprint_file": run.get("sprint_file", ""),
            "started_at": run.get("started_at", ""),
            "duration_s": run.get("duration_seconds", 0),
            "tasks": total,
            "done": done,
            "rejected": rejected,
            "quality_score": quality,
            "tokens": s.get("total_tokens", 0),
        })
    return scores
