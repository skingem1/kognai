"""Parse SCS-001 pipeline run reports."""
import json, os, glob
from pathlib import Path

KOGNAI_ROOT = Path.home() / "kognai"
REPORTS_DIR = KOGNAI_ROOT / "reports" / "pipeline-runs"


def get_latest_pipeline_run():
    latest = REPORTS_DIR / "latest.json"
    if latest.exists():
        with open(latest) as f:
            return json.load(f)
    return None


def list_pipeline_runs(limit=10):
    if not REPORTS_DIR.exists():
        return []
    files = sorted(glob.glob(str(REPORTS_DIR / "scs001-*.json")), reverse=True)
    runs = []
    for f in files[:limit]:
        try:
            with open(f) as fh:
                data = json.load(fh)
            runs.append({
                "run_id": data.get("run_id", os.path.basename(f)),
                "mode": data.get("mode", "unknown"),
                "started_at": data.get("started_at", ""),
                "total_elapsed_ms": data.get("total_elapsed_ms", 0),
                "summary": data.get("summary", {}),
                "stage_count": len(data.get("stages", [])),
                "errors": len([s for s in data.get("stages", []) if s.get("status") == "error"]),
            })
        except Exception:
            pass
    return runs
