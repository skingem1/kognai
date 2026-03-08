"""Parse sprint run logs (ANSI-stripped)."""

import re
from pathlib import Path
from typing import Optional

ANSI_RE = re.compile(r'\x1b\[[0-9;]*m')


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text."""
    return ANSI_RE.sub('', text)


def parse_sprint_log(path: Path, max_lines: int = 150) -> dict:
    """Parse a sprint run log file."""
    try:
        raw = path.read_text()
    except OSError:
        return {"lines": [], "errors": [], "summary": {"total_lines": 0}}

    cleaned = strip_ansi(raw)
    lines = cleaned.splitlines()

    errors = []
    events = []
    approved = 0
    rejected = 0

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        if "REJECTED" in stripped or "rejected" in stripped:
            errors.append({"type": "rejection", "line": stripped, "line_num": i + 1})
            rejected += 1
        elif "APPROVED" in stripped or "approved" in stripped:
            approved += 1
        elif any(kw in stripped.lower() for kw in ["error", "failed", "failure", "exception", "traceback", "timeout"]):
            errors.append({"type": "error", "line": stripped, "line_num": i + 1})

        if "Task:" in stripped and "Attempt:" in stripped:
            events.append({"type": "task_start", "line": stripped, "line_num": i + 1})
        elif "Written:" in stripped:
            events.append({"type": "file_written", "line": stripped, "line_num": i + 1})

    # Return last N lines for the live view
    tail_lines = lines[-max_lines:] if len(lines) > max_lines else lines

    return {
        "lines": [l.strip() for l in tail_lines if l.strip()],
        "errors": errors,
        "events": events,
        "summary": {
            "total_lines": len(lines),
            "error_count": len(errors),
            "approved": approved,
            "rejected": rejected,
            "approval_rate": round(approved / (approved + rejected) * 100, 1) if (approved + rejected) > 0 else 0,
        },
    }


def get_latest_log(logs_dir: Path) -> Optional[dict]:
    """Get the most recent sprint run log."""
    log_files = sorted(logs_dir.glob("sprint-*-run.log"))
    if not log_files:
        # Try any log file
        log_files = sorted(logs_dir.glob("sprint-*.log"))
    if not log_files:
        return None

    latest = log_files[-1]
    result = parse_sprint_log(latest)
    result["file"] = latest.name
    result["sprint"] = latest.stem.replace("-run", "").replace("sprint-", "")
    return result


def get_all_errors(logs_dir: Path, limit: int = 50) -> list:
    """Collect errors from all sprint logs."""
    all_errors = []
    for log_file in sorted(logs_dir.glob("sprint-*-run.log"), reverse=True):
        parsed = parse_sprint_log(log_file)
        sprint_id = log_file.stem.replace("-run", "")
        for err in parsed["errors"]:
            err["sprint"] = sprint_id
            err["file"] = log_file.name
            all_errors.append(err)
        if len(all_errors) >= limit:
            break
    return all_errors[:limit]
