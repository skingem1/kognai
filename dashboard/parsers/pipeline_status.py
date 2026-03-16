"""Pipeline status from workspace/scs001/run-* directories."""
import os, glob
from pathlib import Path
from datetime import datetime, timezone

KOGNAI_ROOT = Path.home() / "kognai"
WORKSPACE_SCS001 = KOGNAI_ROOT / "workspace" / "scs001"


def get_pipeline_status() -> dict:
    pattern = str(WORKSPACE_SCS001 / "run-*")
    run_dirs = sorted(glob.glob(pattern), reverse=True)

    if not run_dirs:
        return {
            "runs_found": 0,
            "last_run_timestamp": None,
            "runs_today": 0,
            "run_dirs": [],
            "has_outputs": {},
            "pipeline_active": False,
        }

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    last_run_ts = None
    runs_today = 0
    parsed_dirs = []

    for d in run_dirs:
        dirname = os.path.basename(d)
        parts = dirname.split("-")
        if len(parts) >= 2:
            try:
                ts_ms = int(parts[1])
                dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
                iso = dt.isoformat()
                parsed_dirs.append({"name": dirname, "timestamp": iso})
                if last_run_ts is None:
                    last_run_ts = iso
                if dt.strftime("%Y-%m-%d") == today_str:
                    runs_today += 1
            except (ValueError, OSError):
                parsed_dirs.append({"name": dirname, "timestamp": None})

    # Check outputs in the latest run
    has_outputs = {}
    if run_dirs:
        latest_dir = Path(run_dirs[0])
        try:
            subdirs = [
                x.name for x in latest_dir.iterdir()
                if x.is_dir()
            ]
            has_outputs = {s: True for s in subdirs}
        except Exception:
            pass

    # Active if runs exist and last run was within 24h
    pipeline_active = False
    if last_run_ts:
        try:
            last_dt = datetime.fromisoformat(last_run_ts)
            diff_hours = (now - last_dt).total_seconds() / 3600
            pipeline_active = diff_hours < 24
        except Exception:
            pass

    return {
        "runs_found": len(run_dirs),
        "last_run_timestamp": last_run_ts,
        "runs_today": runs_today,
        "run_dirs": [d["name"] for d in parsed_dirs[:5]],
        "has_outputs": has_outputs,
        "pipeline_active": pipeline_active,
    }
