"""Parse SCS-001 script validation errors (workspace/scs001/validation-errors.jsonl)."""
import json
from pathlib import Path
from collections import Counter

KOGNAI_ROOT = Path.home() / "kognai"
LEDGER_PATH = KOGNAI_ROOT / "workspace" / "scs001" / "validation-errors.jsonl"


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


def get_validation_errors(limit: int = 50) -> list:
    """Return last N validation error entries, most recent first."""
    entries = _read_entries()
    entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return entries[:limit]


def get_validation_summary() -> dict:
    """Return aggregated validation error stats."""
    entries = _read_entries()
    if not entries:
        return {
            "total_errors": 0,
            "top_reasons": [],
            "latest_timestamp": None,
        }

    # Flatten all error strings and count
    all_errors = []
    for e in entries:
        all_errors.extend(e.get("errors", []))

    # Categorize by first keyword
    def categorize(err: str) -> str:
        err_lower = err.lower()
        if "hook" in err_lower:
            return "Hook too short"
        if "segment" in err_lower:
            return "Segment count"
        if "interrupt" in err_lower:
            return "Insufficient interrupts"
        if "duration" in err_lower:
            return "Duration out of range"
        return err[:40]

    counts = Counter(categorize(e) for e in all_errors)
    top_reasons = [{"reason": r, "count": c} for r, c in counts.most_common(5)]

    sorted_entries = sorted(entries, key=lambda e: e.get("timestamp", ""), reverse=True)
    return {
        "total_errors": len(entries),
        "top_reasons": top_reasons,
        "latest_timestamp": sorted_entries[0].get("timestamp") if sorted_entries else None,
    }
