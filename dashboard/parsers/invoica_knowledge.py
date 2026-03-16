"""Extract knowledge assets from Invoica project data.

Invoica has no formal skill bank or failure library, but has rich data in:
- Sprint JSONs (153+ files): task outcomes, scores, reviews, rejection reasons
- Swarm-run reports: structured execution data with model routing info
- Post-sprint reports: retrospective learnings (markdown)
- CTO assessments: low-score patterns, agent health, proposals
- Agent catalog: 43 agents with YAML descriptors
"""
import json
import os
import re
import glob
from pathlib import Path
from datetime import datetime
from typing import Optional

INVOICA_ROOT = Path.home() / "Documents" / "Invoica"
SPRINTS_DIR = INVOICA_ROOT / "sprints"
AGENTS_DIR = INVOICA_ROOT / "agents"
REPORTS_DIR = INVOICA_ROOT / "reports"
LOGS_DIR = INVOICA_ROOT / "logs"
INVOICA_SKILL_BANK = INVOICA_ROOT / "skill-bank" / "invoica-owned"


# ── Virtual Skill Extraction ──────────────────────────────────────────────

def get_invoica_skills(limit: int = 50) -> dict:
    """Extract 'virtual skills' from approved sprint tasks.

    A virtual skill = any task that was completed (status=done or review=APPROVED)
    with enough metadata to be useful as a knowledge artifact.
    """
    skills = []

    if not SPRINTS_DIR.exists():
        return {"total_skills": 0, "skills": [], "source": "invoica-sprints"}

    # Sort sprint files by modification time (most recent first)
    sprint_files = sorted(
        SPRINTS_DIR.glob("*.json"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )

    for sprint_file in sprint_files:
        try:
            with open(sprint_file) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        tasks = data.get("tasks", [])
        sprint_id = sprint_file.stem

        for task in tasks:
            status = task.get("status", "")
            verdict = task.get("review", {}).get("verdict", "") if isinstance(task.get("review"), dict) else ""
            score = task.get("review", {}).get("score") if isinstance(task.get("review"), dict) else None

            # Accept done/approved tasks
            if status != "done" and verdict != "APPROVED":
                continue

            description = task.get("description", "")
            if not description:
                continue

            skill = {
                "title": description[:120],
                "task_id": task.get("id", ""),
                "agent": task.get("agent", "unknown"),
                "type": task.get("type", "unknown"),
                "score": score,
                "sprint": sprint_id,
                "deliverables": list(task.get("deliverables", {}).keys()) if isinstance(task.get("deliverables"), dict) else [],
                "source": "invoica",
            }
            skills.append(skill)

            if len(skills) >= limit:
                break

        if len(skills) >= limit:
            break

    return {
        "total_skills": len(skills),
        "skills": skills,
        "source": "invoica-sprints",
        "sprints_scanned": len(sprint_files),
    }


# ── Failure Library Extraction ────────────────────────────────────────────

def get_invoica_failures(limit: int = 50) -> dict:
    """Extract failures from sprint tasks and swarm reports.

    Captures: rejection reasons, error messages, destructive rewrites, timeouts.
    """
    failures = []

    # 1. Sprint JSON failures
    if SPRINTS_DIR.exists():
        sprint_files = sorted(
            SPRINTS_DIR.glob("*.json"),
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )

        for sprint_file in sprint_files[:30]:  # Scan 30 most recent
            try:
                with open(sprint_file) as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue

            tasks = data.get("tasks", [])
            sprint_id = sprint_file.stem

            for task in tasks:
                status = task.get("status", "")
                verdict = task.get("review", {}).get("verdict", "") if isinstance(task.get("review"), dict) else ""

                if status != "rejected" and verdict != "REJECTED":
                    continue

                reason = task.get("rejection_reason", "")
                review_summary = task.get("review", {}).get("summary", "") if isinstance(task.get("review"), dict) else ""
                error = task.get("error", "")
                score = task.get("review", {}).get("score") if isinstance(task.get("review"), dict) else None

                failures.append({
                    "task_id": task.get("id", task.get("task_id", "")),
                    "agent": task.get("agent", "unknown"),
                    "sprint": sprint_id,
                    "reason": reason or review_summary or error or "Unknown failure",
                    "score": score,
                    "attempts": task.get("attempts", 1),
                    "model": task.get("model_used", ""),
                    "type": _classify_failure(reason or review_summary or error),
                    "source": "invoica",
                })

                if len(failures) >= limit:
                    break
            if len(failures) >= limit:
                break

    # 2. Swarm-run report failures
    swarm_dir = REPORTS_DIR / "swarm-runs"
    if swarm_dir.exists() and len(failures) < limit:
        for report_file in sorted(swarm_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)[:10]:
            try:
                with open(report_file) as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue

            # Handle both array and object formats
            runs = data if isinstance(data, list) else [data]
            for run in runs:
                for task in run.get("tasks", []):
                    if task.get("status") != "rejected":
                        continue
                    reason = task.get("rejection_reason", "")
                    review_summary = task.get("review", {}).get("summary", "") if isinstance(task.get("review"), dict) else ""

                    # Deduplicate by task_id + sprint
                    task_key = f"{task.get('task_id', '')}"
                    if any(f["task_id"] == task_key for f in failures):
                        continue

                    failures.append({
                        "task_id": task.get("task_id", task.get("title", "")),
                        "agent": task.get("agent", "unknown"),
                        "sprint": run.get("sprint_file", report_file.stem),
                        "reason": reason or review_summary or "Unknown failure",
                        "score": task.get("review", {}).get("score") if isinstance(task.get("review"), dict) else None,
                        "attempts": task.get("attempts", 1),
                        "model": task.get("model_used", ""),
                        "type": _classify_failure(reason or review_summary),
                        "source": "invoica-swarm-report",
                    })
                    if len(failures) >= limit:
                        break

    return {
        "total_failures": len(failures),
        "failures": failures,
        "failure_types": _count_failure_types(failures),
    }


def _classify_failure(reason: str) -> str:
    """Classify failure reason into categories."""
    reason_lower = reason.lower()
    if "destructive rewrite" in reason_lower or "corrupted" in reason_lower:
        return "destructive-rewrite"
    elif "timeout" in reason_lower:
        return "timeout"
    elif "syntax" in reason_lower or "parse" in reason_lower:
        return "syntax-error"
    elif "test" in reason_lower and ("fail" in reason_lower or "broken" in reason_lower):
        return "test-failure"
    elif "not found" in reason_lower or "missing" in reason_lower:
        return "missing-dependency"
    elif "score" in reason_lower and ("0" in reason_lower or "low" in reason_lower):
        return "low-quality"
    elif reason_lower == "" or reason_lower == "unknown failure":
        return "unknown"
    else:
        return "logic-error"


def _count_failure_types(failures: list) -> dict:
    """Count failures by type."""
    counts = {}
    for f in failures:
        t = f.get("type", "unknown")
        counts[t] = counts.get(t, 0) + 1
    return counts


# ── CTO Patterns & Agent Health ───────────────────────────────────────────

def get_cto_insights() -> dict:
    """Parse CTO reports for actionable insights."""
    cto_dir = REPORTS_DIR / "cto"
    result = {
        "proposals": [],
        "low_score_patterns": [],
        "agent_health": None,
    }

    if not cto_dir.exists():
        return result

    # Approved proposals
    proposals_file = cto_dir / "approved-proposals.json"
    if proposals_file.exists():
        try:
            with open(proposals_file) as f:
                data = json.load(f)
            proposals = data if isinstance(data, list) else data.get("proposals", [])
            for p in proposals:
                result["proposals"].append({
                    "id": p.get("id", ""),
                    "title": p.get("title", p.get("name", "")),
                    "status": p.get("status", "unknown"),
                    "priority": p.get("priority", ""),
                })
        except (json.JSONDecodeError, OSError):
            pass

    # Low-score patterns
    for pattern_file in sorted(cto_dir.glob("low-score-patterns-*.json"), reverse=True)[:1]:
        try:
            with open(pattern_file) as f:
                data = json.load(f)
            result["low_score_patterns"] = data.get("agents", [])
        except (json.JSONDecodeError, OSError):
            pass

    return result


# ── Post-Sprint Learnings ─────────────────────────────────────────────────

def get_post_sprint_learnings(limit: int = 20) -> list:
    """Extract key learnings from post-sprint markdown reports."""
    learnings = []
    post_sprint_dir = REPORTS_DIR / "post-sprint"

    if not post_sprint_dir.exists():
        return learnings

    for report_file in sorted(post_sprint_dir.glob("*.md"), reverse=True)[:limit]:
        try:
            content = report_file.read_text()
        except OSError:
            continue

        # Extract sections that typically contain learnings
        learning_items = []
        in_learning_section = False
        for line in content.splitlines():
            stripped = line.strip()
            # Look for learning/improvement headers
            if re.match(r'^#{1,3}\s.*(learn|improve|takeaway|insight|retro|what went|action)', stripped, re.I):
                in_learning_section = True
                continue
            elif re.match(r'^#{1,3}\s', stripped):
                in_learning_section = False
            elif in_learning_section and stripped.startswith(("- ", "* ", "• ")):
                item = stripped.lstrip("-*• ").strip()
                if len(item) > 10:  # Skip trivial items
                    learning_items.append(item[:200])

        if learning_items:
            learnings.append({
                "file": report_file.name,
                "date": report_file.name[:10],
                "items": learning_items[:5],  # Max 5 per report
            })

    return learnings


# ── Invoica Logs ──────────────────────────────────────────────────────────

def get_invoica_latest_log(max_lines: int = 100) -> Optional[dict]:
    """Get the latest Invoica log from autonomous sessions or swarm runs.

    Skips empty files (0 bytes) — prefers the newest file that has content.
    Falls back to newest file overall if all are empty.
    """
    candidates = []

    # Autonomous session logs
    auto_dir = LOGS_DIR / "autonomous"
    if auto_dir.exists():
        candidates.extend(auto_dir.glob("*.log"))

    # Swarm run logs (raw)
    swarm_dir = LOGS_DIR / "swarm-runs"
    if swarm_dir.exists():
        candidates.extend(swarm_dir.glob("*.log"))

    if not candidates:
        return None

    # Prefer non-empty files (active sessions may have 0 bytes due to buffering)
    non_empty = [f for f in candidates if f.stat().st_size > 0]
    if non_empty:
        latest = max(non_empty, key=lambda f: f.stat().st_mtime)
    else:
        latest = max(candidates, key=lambda f: f.stat().st_mtime)

    try:
        raw = latest.read_text()
    except OSError:
        return None

    # Strip ANSI
    ansi_re = re.compile(r'\x1b\[[0-9;]*m')
    cleaned = ansi_re.sub('', raw)
    lines = cleaned.splitlines()

    errors = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if any(kw in stripped.lower() for kw in ["error", "failed", "failure", "exception", "rejected"]):
            errors.append({"line": stripped[:200], "line_num": i + 1})

    tail = lines[-max_lines:] if len(lines) > max_lines else lines

    return {
        "file": latest.name,
        "source": "autonomous" if "autonomous" in str(latest) else "swarm",
        "total_lines": len(lines),
        "lines": [l.strip() for l in tail if l.strip()],
        "errors": errors[:20],
        "project": "invoica",
    }


def get_invoica_log_errors(limit: int = 30) -> list:
    """Collect errors from all Invoica logs."""
    all_errors = []
    candidates = []

    auto_dir = LOGS_DIR / "autonomous"
    if auto_dir.exists():
        candidates.extend(auto_dir.glob("*.log"))

    swarm_dir = LOGS_DIR / "swarm-runs"
    if swarm_dir.exists():
        candidates.extend(swarm_dir.glob("*.log"))

    candidates.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    ansi_re = re.compile(r'\x1b\[[0-9;]*m')

    for log_file in candidates[:10]:
        try:
            raw = log_file.read_text()
        except OSError:
            continue

        cleaned = ansi_re.sub('', raw)
        for i, line in enumerate(cleaned.splitlines()):
            stripped = line.strip()
            if any(kw in stripped.lower() for kw in ["error", "failed", "failure", "exception", "traceback"]):
                all_errors.append({
                    "line": stripped[:200],
                    "line_num": i + 1,
                    "file": log_file.name,
                    "project": "invoica",
                })
                if len(all_errors) >= limit:
                    return all_errors

    return all_errors


# ── Aggregate Stats ───────────────────────────────────────────────────────

def get_invoica_knowledge_summary() -> dict:
    """Quick summary stats for the dashboard header."""
    total_skills = 0
    total_failures = 0
    total_sprints = 0
    total_agents = 0

    if SPRINTS_DIR.exists():
        sprint_files = list(SPRINTS_DIR.glob("*.json"))
        total_sprints = len(sprint_files)

        # Quick scan of last 20 sprints for skill/failure counts
        for sf in sorted(sprint_files, key=lambda f: f.stat().st_mtime, reverse=True)[:20]:
            try:
                with open(sf) as f:
                    data = json.load(f)
                for t in data.get("tasks", []):
                    if t.get("status") == "done" or (isinstance(t.get("review"), dict) and t["review"].get("verdict") == "APPROVED"):
                        total_skills += 1
                    elif t.get("status") == "rejected":
                        total_failures += 1
            except (json.JSONDecodeError, OSError):
                continue

    if AGENTS_DIR.exists():
        total_agents = len([d for d in AGENTS_DIR.iterdir() if d.is_dir() and (d / "agent.yaml").exists()])

    return {
        "total_skills": total_skills,
        "total_failures": total_failures,
        "total_sprints": total_sprints,
        "total_agents": total_agents,
    }


# ── Crystallised Skills (AMD-02 port from Kognai) ────────────────────────

def get_invoica_crystallised_skills() -> dict:
    """Read skill records from Invoica's skill bank (ported AMD-02 pipeline).

    These are REAL crystallised skills — approved tasks with score >= 75/100
    that were distilled into reusable skill records by the crystalliser.
    """
    skills = []
    if not INVOICA_SKILL_BANK.exists():
        return {"total": 0, "skills": [], "avg_score": 0}

    for f in sorted(INVOICA_SKILL_BANK.glob("*.json")):
        try:
            data = json.loads(f.read_text())
            avg_score = 0
            history = data.get("score_history", [])
            if history:
                avg_score = round(sum(e.get("score", 0) for e in history) / len(history), 1)

            skills.append({
                "skill_id": data.get("skill_id", f.stem),
                "name": data.get("name", f.stem),
                "description": data.get("description", ""),
                "agent": data.get("agent_id", "unknown"),
                "type": data.get("type", "invoica-owned"),
                "avg_score": avg_score,
                "execution_count": data.get("execution_count", 1),
                "access_tier": data.get("access_tier", "internal"),
                "model": data.get("optimal_settings", {}).get("model", "unknown"),
                "source_sprint": data.get("source_sprint", ""),
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
            })
        except (json.JSONDecodeError, OSError):
            skills.append({"skill_id": f.stem, "name": f.stem, "error": True})

    avg_all = 0
    scored = [s for s in skills if s.get("avg_score", 0) > 0]
    if scored:
        avg_all = round(sum(s["avg_score"] for s in scored) / len(scored), 1)

    return {
        "total": len(skills),
        "skills": skills,
        "avg_score": avg_all,
    }
