"""Parse autonomous Claude session logs + git history for live monitoring."""
import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

KOGNAI_ROOT = Path.home() / "kognai"
INVOICA_ROOT = Path.home() / "Documents" / "Invoica"

KOGNAI_SESSIONS_DIR = KOGNAI_ROOT / "logs" / "autonomous"
INVOICA_SESSIONS_DIR = INVOICA_ROOT / "logs" / "autonomous"


def _time_ago(dt: datetime) -> str:
    """Human-readable relative time."""
    now = datetime.now()
    diff = now - dt
    secs = int(diff.total_seconds())
    if secs < 60:
        return f"{secs}s ago"
    mins = secs // 60
    if mins < 60:
        return f"{mins}m ago"
    hrs = mins // 60
    if hrs < 24:
        return f"{hrs}h ago"
    return f"{diff.days}d ago"


def _parse_session_file(path: Path) -> dict:
    """Parse a session log file to extract metadata."""
    name = path.name  # e.g. session-3-2026-03-16_15-54-47.log
    m = re.match(r"session-(\d+)-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.log", name)
    session_num = int(m.group(1)) if m else 0
    started_at = ""
    if m:
        started_at = f"{m.group(2)} {m.group(3)}:{m.group(4)}:{m.group(5)}"

    stat = path.stat()
    size = stat.st_size
    mtime = datetime.fromtimestamp(stat.st_mtime)

    # Check if session ended (look for end marker in last 500 bytes)
    ended = False
    end_code = None
    last_sprint = ""
    if size > 0:
        try:
            with open(path, "r", errors="replace") as f:
                # Read last 2KB to find end marker and sprint info
                f.seek(max(0, size - 2048))
                tail = f.read()

                # Check for end marker
                end_m = re.search(r"Session #\d+ ended \(exit code: (\d+)\)", tail)
                if end_m:
                    ended = True
                    end_code = int(end_m.group(1))

                # Find latest sprint reference
                sprint_matches = re.findall(r"Sprint (\d{3}(?::\s+[^\n]+)?)", tail)
                if sprint_matches:
                    last_sprint = f"Sprint {sprint_matches[-1]}"

                # Find sprint shipped messages
                shipped = re.findall(r"Sprint (\d{3}) shipped", tail)
                if shipped:
                    last_sprint = f"Sprint {shipped[-1]} shipped"
        except Exception:
            pass

    return {
        "file": name,
        "session_num": session_num,
        "started_at": started_at,
        "size": size,
        "mtime": mtime.isoformat(),
        "mtime_ago": _time_ago(mtime),
        "ended": ended,
        "exit_code": end_code,
        "last_sprint": last_sprint,
    }


def _get_active_session_pids() -> dict:
    """Return dict mapping log file paths to PIDs for running script processes."""
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True, text=True, timeout=5
        )
        pids = {}
        for line in result.stdout.splitlines():
            if "script" in line and "autonomous" in line and "grep" not in line:
                # Extract PID and log path
                parts = line.split()
                pid = int(parts[1]) if len(parts) > 1 else 0
                # Find the log path
                m = re.search(r"((?:/\S+)?logs/autonomous/session-[^\s]+\.log)", line)
                if m and pid:
                    pids[m.group(1)] = pid
        return pids
    except Exception:
        return {}


def _get_git_commits(repo_path: Path, limit: int = 12) -> list:
    """Get recent git commits from a repo."""
    try:
        result = subprocess.run(
            ["git", "log", f"--oneline", f"-{limit}", "--format=%H|%h|%s|%ar|%ai"],
            capture_output=True, text=True, timeout=5,
            cwd=str(repo_path)
        )
        commits = []
        for line in result.stdout.strip().splitlines():
            parts = line.split("|", 4)
            if len(parts) >= 5:
                commits.append({
                    "hash": parts[0][:8],
                    "short_hash": parts[1],
                    "message": parts[2],
                    "time_ago": parts[3],
                    "timestamp": parts[4],
                })
        return commits
    except Exception:
        return []


def _get_session_files(sessions_dir: Path) -> list:
    """Get session files sorted by mtime (most recent first)."""
    if not sessions_dir.exists():
        return []
    files = sorted(sessions_dir.glob("session-*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    return files


def get_sessions_live() -> dict:
    """Get live autonomous session data for both projects."""
    active_pids = _get_active_session_pids()

    # Kognai sessions
    kognai_sessions = []
    kognai_files = _get_session_files(KOGNAI_SESSIONS_DIR)
    for f in kognai_files[:8]:  # Last 8 session files
        info = _parse_session_file(f)
        # Check if this session is currently active
        is_active = any(str(f) in k for k in active_pids)
        info["active"] = is_active
        kognai_sessions.append(info)

    # Invoica sessions
    invoica_sessions = []
    invoica_files = _get_session_files(INVOICA_SESSIONS_DIR)
    for f in invoica_files[:8]:
        info = _parse_session_file(f)
        is_active = any(str(f) in k for k in active_pids)
        info["active"] = is_active
        invoica_sessions.append(info)

    # Git commits from both repos
    kognai_commits = _get_git_commits(KOGNAI_ROOT)
    invoica_commits = _get_git_commits(INVOICA_ROOT)

    # Overall status: are any sessions active?
    kognai_active = any(s["active"] for s in kognai_sessions)
    invoica_active = any(s["active"] for s in invoica_sessions)

    # Count total runs today
    today = datetime.now().strftime("%Y-%m-%d")
    kognai_runs_today = sum(1 for f in kognai_files if today in f.name)
    invoica_runs_today = sum(1 for f in invoica_files if today in f.name)

    # Latest active session info
    kognai_latest = kognai_sessions[0] if kognai_sessions else None
    invoica_latest = invoica_sessions[0] if invoica_sessions else None

    return {
        "kognai": {
            "active": kognai_active,
            "sessions": kognai_sessions,
            "latest": kognai_latest,
            "commits": kognai_commits,
            "runs_today": kognai_runs_today,
            "total_sessions": len(kognai_files),
        },
        "invoica": {
            "active": invoica_active,
            "sessions": invoica_sessions,
            "latest": invoica_latest,
            "commits": invoica_commits,
            "runs_today": invoica_runs_today,
            "total_sessions": len(invoica_files),
        },
        "any_active": kognai_active or invoica_active,
    }
