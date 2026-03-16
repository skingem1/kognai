"""Parse SCS-001 publish ledger (workspace/scs001/publish-ledger.jsonl)."""
import json
from pathlib import Path

KOGNAI_ROOT = Path.home() / "kognai"
LEDGER_PATH = KOGNAI_ROOT / "workspace" / "scs001" / "publish-ledger.jsonl"


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


def get_publish_history(limit: int = 50) -> list:
    """Return last N published videos, sorted by published_at descending."""
    entries = _read_entries()
    entries.sort(key=lambda e: e.get("published_at", ""), reverse=True)
    return entries[:limit]


def get_publish_stats() -> dict:
    """Return summary stats for the publish ledger."""
    entries = _read_entries()
    if not entries:
        return {
            "total_published": 0,
            "runs_count": 0,
            "latest_run_id": None,
            "latest_published_at": None,
        }
    run_ids = list(dict.fromkeys(e.get("run_id", "") for e in entries))
    sorted_entries = sorted(entries, key=lambda e: e.get("published_at", ""), reverse=True)
    return {
        "total_published": len(entries),
        "runs_count": len(run_ids),
        "latest_run_id": sorted_entries[0].get("run_id") if sorted_entries else None,
        "latest_published_at": sorted_entries[0].get("published_at") if sorted_entries else None,
    }
