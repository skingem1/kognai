"""Go-live readiness checker — env vars, pipeline health, kill switch proximity."""
import json, os, glob
from pathlib import Path

KOGNAI_ROOT = Path.home() / "kognai"
REPORTS_DIR = KOGNAI_ROOT / "reports" / "pipeline-runs"

REQUIRED_ENV_VARS = [
    "TIKTOK_ACCESS_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "YOUTUBE_API_KEY",
    "SCS_EDITING_MODE",
]

BLOCKER_MESSAGES = {
    "TIKTOK_ACCESS_TOKEN": "TIKTOK_ACCESS_TOKEN not set — live posting blocked",
    "SUPABASE_URL": "SUPABASE_URL not set — video hosting blocked",
    "SUPABASE_SERVICE_KEY": "SUPABASE_SERVICE_KEY not set — video hosting blocked",
    "YOUTUBE_API_KEY": "YOUTUBE_API_KEY not set — live trends/real video search blocked",
    "SCS_EDITING_MODE": "SCS_EDITING_MODE not set — production video quality not active",
}


def get_readiness() -> dict:
    # Check env vars
    env_status = {var: bool(os.environ.get(var)) for var in REQUIRED_ENV_VARS}
    env_ready_count = sum(env_status.values())
    env_total = len(REQUIRED_ENV_VARS)

    # Check pipeline runs
    pipeline_runs_exist = (
        REPORTS_DIR.exists()
        and len(glob.glob(str(REPORTS_DIR / "scs001-*.json"))) > 0
    )

    # Check latest run health
    latest_run_ok = False
    if pipeline_runs_exist:
        latest = REPORTS_DIR / "latest.json"
        if latest.exists():
            try:
                with open(latest) as f:
                    data = json.load(f)
                errors = [s for s in data.get("stages", []) if s.get("status") == "error"]
                latest_run_ok = len(errors) == 0
            except Exception:
                pass

    # Kill switch targets (actuals require TikTok Analytics API when available)
    kill_switch_proximity = {
        "views_target": 500,
        "posts_target": 30,
        "retention_target": 20,
        "qc_pass_target": 80,
        # TODO: read current actuals from TikTok Analytics API when available
        "current_views": 0,
        "current_posts": 0,
        "current_retention": 0,
        "current_qc_pass": 0,
    }

    # Build blocker list
    blockers = [
        BLOCKER_MESSAGES[var]
        for var in REQUIRED_ENV_VARS
        if not env_status[var]
    ]
    if not pipeline_runs_exist:
        blockers.append("No pipeline runs yet — pipeline has not run in live mode")

    # Readiness score: 60% from env vars + 20% from runs existing + 20% from latest run ok
    readiness_pct = min(100, int(
        (env_ready_count / env_total * 60)
        + (20 if pipeline_runs_exist else 0)
        + (20 if latest_run_ok else 0)
    ))

    return {
        "env_status": env_status,
        "env_ready_count": env_ready_count,
        "env_total": env_total,
        "pipeline_runs_exist": pipeline_runs_exist,
        "latest_run_ok": latest_run_ok,
        "kill_switch_proximity": kill_switch_proximity,
        "blockers": blockers,
        "readiness_pct": readiness_pct,
    }
