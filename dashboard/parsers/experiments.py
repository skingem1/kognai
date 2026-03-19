"""Parse SCS-001 experiment ledger (workspace/scs001/experiments.jsonl)."""
import json
from pathlib import Path
from collections import defaultdict

KOGNAI_ROOT = Path.home() / "kognai"
LEDGER_PATH = KOGNAI_ROOT / "workspace" / "scs001" / "experiments.jsonl"


def _read_entries() -> list:
    if not LEDGER_PATH.exists():
        return []
    entries = []
    with open(LEDGER_PATH) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except Exception:
                pass
    return entries


def get_experiment_stats() -> dict:
    """Return aggregated experiment stats: formula pass rates, top speakers."""
    entries = _read_entries()
    if not entries:
        return {
            "total_logged": 0,
            "unique_formulas": 0,
            "top_formulas": [],
            "top_speakers": [],
        }

    formulas: dict = defaultdict(lambda: {"count": 0, "passed": 0})
    speakers: dict = defaultdict(lambda: {"count": 0, "passed": 0})

    for e in entries:
        f = e.get("hook_formula", "unknown")
        s = e.get("speaker", "unknown")
        p = bool(e.get("qc_passed", False))
        formulas[f]["count"] += 1
        speakers[s]["count"] += 1
        if p:
            formulas[f]["passed"] += 1
            speakers[s]["passed"] += 1

    top_formulas = sorted(
        [{"formula": k, "count": v["count"], "passed": v["passed"],
          "pass_rate": round(v["passed"] / v["count"], 2) if v["count"] else 0}
         for k, v in formulas.items()],
        key=lambda x: x["pass_rate"], reverse=True
    )
    top_speakers = sorted(
        [{"speaker": k, "count": v["count"], "passed": v["passed"],
          "pass_rate": round(v["passed"] / v["count"], 2) if v["count"] else 0}
         for k, v in speakers.items()],
        key=lambda x: x["pass_rate"], reverse=True
    )[:5]

    # Viral score stats (Sprint 191)
    viral_scores = [e.get("partial_viral_score") for e in entries if e.get("partial_viral_score") is not None]
    viral_stats = {}
    if viral_scores:
        viral_stats = {
            "scored_count": len(viral_scores),
            "avg_viral": round(sum(viral_scores) / len(viral_scores), 3),
            "max_viral": round(max(viral_scores), 3),
            "min_viral": round(min(viral_scores), 3),
            "above_07": sum(1 for v in viral_scores if v >= 0.7),
        }

    return {
        "total_logged": len(entries),
        "unique_formulas": len(formulas),
        "top_formulas": top_formulas,
        "top_speakers": top_speakers,
        "viral_stats": viral_stats,
    }


def get_experiment_history(limit: int = 50) -> list:
    """Return last N experiment entries, most recent first."""
    entries = _read_entries()
    entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return entries[:limit]
