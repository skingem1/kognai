"""Parse Invoica sprint files and agent configs.

Invoica sprint files use different naming conventions:
- week-N.json (weekly sprints, numbered 1-74+)
- auto-YYYY-MM-DDTHH-MM-SS.json (auto-generated sprints)
- bugfix-*.json (bugfix sprints)
- current.json (symlink/copy of active sprint)

Task format is similar to Kognai but:
- No top-level sprint metadata (no sprint_id, title, phase)
- deliverables can be object {code:[], tests:[], docs:[]} or array ["file.ts"]
- Status values: done, rejected, skipped, pending, in_progress
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional


INVOICA_ROOT = Path.home() / "Documents" / "Invoica"
INVOICA_SPRINTS = INVOICA_ROOT / "sprints"
INVOICA_AGENTS = INVOICA_ROOT / "agents"


def _extract_sprint_number(filename: str) -> tuple:
    """Extract sortable key from sprint filename.
    Returns (type_priority, sort_key) for sorting.
    week-74 -> (0, 74)
    auto-2026-03-05T06-00-27 -> (1, '2026-03-05T06-00-27')
    bugfix-* -> (2, filename)
    current -> (3, 'current')
    """
    if filename.startswith("week-"):
        try:
            num = int(filename.replace("week-", "").replace(".json", ""))
            return (0, num)
        except ValueError:
            return (0, 0)
    elif filename.startswith("auto-"):
        ts = filename.replace("auto-", "").replace(".json", "")
        return (1, ts)
    elif filename.startswith("bugfix-"):
        return (2, filename)
    elif filename == "current":
        return (3, "current")
    else:
        return (4, filename)


def _sprint_label(filename: str) -> str:
    """Human-readable label for a sprint file."""
    name = filename.replace(".json", "")
    if name.startswith("week-"):
        return f"Week {name.replace('week-', '')}"
    elif name.startswith("auto-"):
        ts = name.replace("auto-", "")
        try:
            dt = datetime.strptime(ts, "%Y-%m-%dT%H-%M-%S")
            return f"Auto {dt.strftime('%b %d %H:%M')}"
        except ValueError:
            return f"Auto {ts[:10]}"
    elif name.startswith("bugfix-"):
        return f"Bugfix {name.replace('bugfix-', '')[:20]}"
    elif name == "current":
        return "Current"
    return name


def parse_invoica_sprint(path: Path) -> dict:
    """Parse a single Invoica sprint JSON file."""
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return {"id": path.stem, "error": "Failed to parse"}

    if isinstance(data, list):
        tasks = data
    else:
        tasks = data.get("tasks", [])

    total = len(tasks)
    status_counts = {}
    priority_counts = {}

    for t in tasks:
        s = t.get("status", "unknown")
        p = t.get("priority", "medium")
        status_counts[s] = status_counts.get(s, 0) + 1
        priority_counts[p] = priority_counts.get(p, 0) + 1

    completed = sum(status_counts.get(s, 0) for s in
                    ["done", "completed", "approved"])
    rejected = status_counts.get("rejected", 0)
    skipped = status_counts.get("skipped", 0)

    label = _sprint_label(path.name)

    return {
        "id": path.stem,
        "number": path.stem,
        "title": label,
        "project": "invoica",
        "phase": "",
        "status": "completed" if completed == total and total > 0 else "active",
        "goal": "",
        "created_at": "",
        "total_tasks": total,
        "completed_tasks": completed,
        "rejected_tasks": rejected,
        "skipped_tasks": skipped,
        "completion_pct": round(completed / total * 100, 1) if total else 0,
        "approval_rate": round(completed / (completed + rejected) * 100, 1)
                         if (completed + rejected) > 0 else 0,
        "status_counts": status_counts,
        "priority_counts": priority_counts,
        "tasks": [
            {
                "id": t.get("id", f"task-{i}"),
                "title": t.get("description", t.get("title", "Untitled"))[:80],
                "agent": t.get("agent", "unassigned"),
                "type": t.get("type", "feature"),
                "priority": t.get("priority", "medium"),
                "status": t.get("status", "pending"),
                "task_target": "",
            }
            for i, t in enumerate(tasks)
        ],
    }


def get_current_invoica_sprint(sprints_dir: Path = INVOICA_SPRINTS) -> Optional[dict]:
    """Get the most recent Invoica sprint.
    Priority: current.json > latest auto > highest week number.
    """
    if not sprints_dir.exists():
        return None

    # Check current.json first
    current = sprints_dir / "current.json"
    if current.exists():
        result = parse_invoica_sprint(current)
        result["id"] = "current"
        result["title"] = "Current Sprint"
        return result

    # Find latest by modification time
    all_files = list(sprints_dir.glob("*.json"))
    if not all_files:
        return None

    # Filter to only week/auto/bugfix files
    valid = [f for f in all_files if f.name != "test-v2.json"]
    if not valid:
        return None

    # Sort by modification time, get newest
    latest = max(valid, key=lambda f: f.stat().st_mtime)
    return parse_invoica_sprint(latest)


def list_invoica_sprints(sprints_dir: Path = INVOICA_SPRINTS, limit: int = 20) -> list:
    """List recent Invoica sprints with summary info."""
    if not sprints_dir.exists():
        return []

    all_files = list(sprints_dir.glob("*.json"))
    # Filter out test files
    valid = [f for f in all_files
             if f.name not in ("test-v2.json", "current.json")]

    # Sort by modification time (newest first), take recent
    valid.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    recent = valid[:limit]

    results = []
    for f in recent:
        s = parse_invoica_sprint(f)
        results.append({
            "id": s["id"],
            "number": s["number"],
            "title": s["title"],
            "project": "invoica",
            "total_tasks": s["total_tasks"],
            "completed_tasks": s["completed_tasks"],
            "completion_pct": s["completion_pct"],
            "approval_rate": s.get("approval_rate", 0),
        })

    return results


def get_invoica_sprint_by_id(sprints_dir: Path, sprint_id: str) -> Optional[dict]:
    """Get a specific Invoica sprint by filename stem."""
    path = sprints_dir / f"{sprint_id}.json"
    if not path.exists():
        # Try with week- prefix
        path = sprints_dir / f"week-{sprint_id}.json"
    if not path.exists():
        return None
    return parse_invoica_sprint(path)


def list_invoica_agents(agents_dir: Path = INVOICA_AGENTS) -> list:
    """List all Invoica agent configs."""
    if not agents_dir.exists():
        return []

    agents = []
    try:
        import yaml
    except ImportError:
        yaml = None

    for agent_dir in sorted(agents_dir.iterdir()):
        if not agent_dir.is_dir():
            continue
        yaml_path = agent_dir / "agent.yaml"
        if not yaml_path.exists():
            continue

        try:
            content = yaml_path.read_text()
            if yaml:
                data = yaml.safe_load(content)
                if not isinstance(data, dict):
                    continue
                agent = {
                    "name": data.get("name", agent_dir.name),
                    "role": data.get("role", ""),
                    "llm": data.get("llm", "unknown"),
                    "fallback_llm": data.get("fallback_llm", ""),
                }
            else:
                name_m = re.search(r'^name:\s*(.+)', content, re.MULTILINE)
                role_m = re.search(r'^role:\s*(.+)', content, re.MULTILINE)
                llm_m = re.search(r'^llm:\s*(.+)', content, re.MULTILINE)
                agent = {
                    "name": name_m.group(1).strip() if name_m else agent_dir.name,
                    "role": role_m.group(1).strip() if role_m else "",
                    "llm": llm_m.group(1).strip() if llm_m else "unknown",
                    "fallback_llm": "",
                }

            # Categorize tier
            llm = agent.get("llm", "").lower()
            if "claude" in llm or "anthropic" in llm:
                tier = "cloud"
            elif "minimax" in llm or "blockrun" in llm:
                tier = "cloud"
            elif "qwen" in llm or "ollama" in llm or "deepseek" in llm:
                tier = "local"
            else:
                tier = "auto"

            agent["tier"] = tier
            agent["dir"] = agent_dir.name
            agents.append(agent)
        except Exception:
            continue

    return agents


def get_invoica_stats(sprints_dir: Path = INVOICA_SPRINTS) -> dict:
    """Get aggregate Invoica build stats."""
    if not sprints_dir.exists():
        return {"total_sprints": 0, "total_tasks": 0, "total_completed": 0}

    all_files = [f for f in sprints_dir.glob("*.json")
                 if f.name not in ("test-v2.json", "current.json")]

    total_tasks = 0
    total_completed = 0
    total_rejected = 0
    total_sprints = len(all_files)

    # Only aggregate week-* files for historical stats (avoid double-counting)
    week_files = [f for f in all_files if f.name.startswith("week-")]
    for f in week_files:
        try:
            data = json.loads(f.read_text())
            # Handle both {tasks: [...]} and raw list formats
            if isinstance(data, list):
                tasks = data
            elif isinstance(data, dict):
                tasks = data.get("tasks", [])
            else:
                continue
            total_tasks += len(tasks)
            for t in tasks:
                if not isinstance(t, dict):
                    continue
                s = t.get("status", "")
                if s in ("done", "completed", "approved"):
                    total_completed += 1
                elif s == "rejected":
                    total_rejected += 1
        except (json.JSONDecodeError, OSError):
            continue

    approval_rate = round(total_completed / (total_completed + total_rejected) * 100, 1) \
        if (total_completed + total_rejected) > 0 else 0

    return {
        "total_sprints": len(week_files),
        "total_files": total_sprints,
        "total_tasks": total_tasks,
        "total_completed": total_completed,
        "total_rejected": total_rejected,
        "approval_rate": approval_rate,
    }
