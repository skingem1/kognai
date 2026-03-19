"""Go-live readiness checker — env vars, pipeline health, kill switch proximity."""
import json, os, glob
from pathlib import Path
from datetime import datetime, timezone

KOGNAI_ROOT = Path.home() / "kognai"
RUNS_DIR = KOGNAI_ROOT / "workspace" / "scs001"
SMOKE_TEST_PATH = KOGNAI_ROOT / "reports" / "smoke-test-latest.json"
EXPERIMENTS_PATH = KOGNAI_ROOT / "workspace" / "scs001" / "experiments.jsonl"

LEDGER_PATH = KOGNAI_ROOT / "workspace" / "scs001" / "publish-ledger.jsonl"
MANUAL_POSTS_PATH = KOGNAI_ROOT / "workspace" / "scs001" / "manual-posts.jsonl"
PHASE_1_5_GATE_DATE = "2026-04-07"
POSTS_TARGET = 30

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

    # Check pipeline runs (workspace/scs001/run-*/ directories)
    run_dirs = [d for d in RUNS_DIR.iterdir() if d.is_dir() and d.name.startswith("run-")] if RUNS_DIR.exists() else []
    pipeline_runs_exist = len(run_dirs) > 0

    # Check latest run health via smoke-test-latest.json
    latest_run_ok = False
    if SMOKE_TEST_PATH.exists():
        try:
            with open(SMOKE_TEST_PATH) as f:
                data = json.load(f)
            latest_run_ok = data.get("passed", False) and data.get("error_count", 1) == 0
        except Exception:
            pass

    # Current actuals from publish-ledger + manual-posts + experiments
    current_generated = _count_ledger_entries()
    current_manual_posts = _count_manual_posts()
    current_manual_views = _count_manual_views()
    current_qc_pass = _calc_qc_pass_rate()

    kill_switch_proximity = {
        "views_target": 500,
        "posts_target": 30,
        "retention_target": 20,
        "qc_pass_target": 80,
        "current_views": current_manual_views,
        "current_posts": current_manual_posts,  # actual TikTok posts, not pipeline-generated
        "current_generated": current_generated,  # pipeline-generated videos (posting queue)
        "current_retention": 0,  # requires TikTok Analytics API (live mode only)
        "current_qc_pass": current_qc_pass,
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

    # Phase 1.5 projection (based on publish ledger)
    phase_1_5_projection = _get_phase_1_5_projection()

    return {
        "env_status": env_status,
        "env_ready_count": env_ready_count,
        "env_total": env_total,
        "pipeline_runs_exist": pipeline_runs_exist,
        "latest_run_ok": latest_run_ok,
        "kill_switch_proximity": kill_switch_proximity,
        "blockers": blockers,
        "readiness_pct": readiness_pct,
        "phase_1_5_projection": phase_1_5_projection,
    }


def _count_ledger_entries() -> int:
    """Count total entries in publish-ledger.jsonl (pipeline-generated videos)."""
    if not LEDGER_PATH.exists():
        return 0
    count = 0
    try:
        with open(LEDGER_PATH) as f:
            for line in f:
                if line.strip():
                    count += 1
    except Exception:
        pass
    return count


def _count_manual_posts() -> int:
    """Count manually posted TikTok videos (the gate metric)."""
    if not MANUAL_POSTS_PATH.exists():
        return 0
    count = 0
    try:
        with open(MANUAL_POSTS_PATH) as f:
            for line in f:
                if line.strip():
                    count += 1
    except Exception:
        pass
    return count


def _count_manual_views() -> int:
    """Sum views across manually posted TikTok videos."""
    if not MANUAL_POSTS_PATH.exists():
        return 0
    total = 0
    try:
        with open(MANUAL_POSTS_PATH) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    total += json.loads(line).get("views", 0)
                except Exception:
                    pass
    except Exception:
        pass
    return total


def _calc_qc_pass_rate() -> int:
    """Calculate QC pass rate (%) from experiments.jsonl."""
    if not EXPERIMENTS_PATH.exists():
        return 0
    total, passed = 0, 0
    try:
        with open(EXPERIMENTS_PATH) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    total += 1
                    if entry.get("qc_passed"):
                        passed += 1
                except Exception:
                    pass
    except Exception:
        pass
    return round(passed / total * 100) if total > 0 else 0


def _get_phase_1_5_projection() -> dict:
    """Calculate days-to-30-posts projection for Phase 1.5 kill switch.
    Uses manual-posts.jsonl (actual TikTok posts), not publish-ledger (generated videos)."""
    source_path = MANUAL_POSTS_PATH if MANUAL_POSTS_PATH.exists() else LEDGER_PATH
    if not source_path.exists():
        return {
            "posts_so_far": 0,
            "posts_target": POSTS_TARGET,
            "avg_posts_per_day": 0,
            "days_to_target": None,
            "projected_date": None,
            "gate_date": PHASE_1_5_GATE_DATE,
        }
    entries = []
    with open(source_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except Exception:
                pass

    posts_so_far = len(entries)
    if posts_so_far == 0:
        return {
            "posts_so_far": 0,
            "posts_target": POSTS_TARGET,
            "avg_posts_per_day": 0,
            "days_to_target": None,
            "projected_date": None,
            "gate_date": PHASE_1_5_GATE_DATE,
        }

    # Calculate avg posts per day from ledger date range
    timestamps = sorted(e.get("published_at", "") for e in entries if e.get("published_at"))
    avg_posts_per_day = 0.0
    days_to_target = None
    projected_date = None
    if len(timestamps) >= 2:
        try:
            first = datetime.fromisoformat(timestamps[0].replace("Z", "+00:00"))
            last = datetime.fromisoformat(timestamps[-1].replace("Z", "+00:00"))
            span_days = max((last - first).total_seconds() / 86400, 0.001)
            avg_posts_per_day = round(posts_so_far / span_days, 1)
        except Exception:
            avg_posts_per_day = posts_so_far  # assume 1 day if can't parse

    remaining = max(0, POSTS_TARGET - posts_so_far)
    if avg_posts_per_day > 0 and remaining > 0:
        days_to_target = round(remaining / avg_posts_per_day, 1)
        try:
            now = datetime.now(timezone.utc)
            from datetime import timedelta
            projected_dt = now + timedelta(days=days_to_target)
            projected_date = projected_dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    elif remaining == 0:
        days_to_target = 0
        projected_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    return {
        "posts_so_far": posts_so_far,
        "posts_target": POSTS_TARGET,
        "avg_posts_per_day": avg_posts_per_day,
        "days_to_target": days_to_target,
        "projected_date": projected_date,
        "gate_date": PHASE_1_5_GATE_DATE,
    }
