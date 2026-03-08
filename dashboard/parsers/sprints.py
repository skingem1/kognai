"""Parse sprint JSON files from workspace/sprints/"""

import json
from pathlib import Path
from typing import Optional


def parse_sprint(path: Path) -> dict:
    """Parse a single sprint JSON file into a normalized format."""
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return {"id": path.stem, "error": "Failed to parse"}

    sprint_num = path.stem.replace("sprint-", "")
    tasks = data.get("tasks", [])
    total = len(tasks)

    status_counts = {}
    priority_counts = {}
    target_counts = {}

    for t in tasks:
        s = t.get("status", "unknown")
        p = t.get("priority", "medium")
        tgt = t.get("task_target", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1
        priority_counts[p] = priority_counts.get(p, 0) + 1
        target_counts[tgt] = target_counts.get(tgt, 0) + 1

    completed = status_counts.get("completed", 0) + status_counts.get("done", 0) + status_counts.get("approved", 0)

    return {
        "id": data.get("sprint_id", f"sprint-{sprint_num}"),
        "number": sprint_num,
        "title": data.get("title", f"Sprint {sprint_num}"),
        "phase": data.get("phase", ""),
        "status": data.get("status", "active"),
        "goal": data.get("goal", ""),
        "created_at": data.get("created_at", ""),
        "total_tasks": total,
        "completed_tasks": completed,
        "completion_pct": round(completed / total * 100, 1) if total else 0,
        "status_counts": status_counts,
        "priority_counts": priority_counts,
        "target_counts": target_counts,
        "tasks": [
            {
                "id": t.get("id", f"task-{i}"),
                "title": t.get("title", t.get("description", "Untitled")[:80]),
                "agent": t.get("agent", "unassigned"),
                "type": t.get("type", "feature"),
                "priority": t.get("priority", "medium"),
                "status": t.get("status", "pending"),
                "task_target": t.get("task_target", "unknown"),
            }
            for i, t in enumerate(tasks)
        ],
    }


def get_current_sprint(sprints_dir: Path) -> Optional[dict]:
    """Get the sprint with the highest number."""
    sprint_files = sorted(sprints_dir.glob("sprint-*.json"))
    if not sprint_files:
        return None
    return parse_sprint(sprint_files[-1])


def list_sprints(sprints_dir: Path) -> list:
    """List all sprints with summary info."""
    sprint_files = sorted(sprints_dir.glob("sprint-*.json"))
    results = []
    for f in sprint_files:
        s = parse_sprint(f)
        results.append({
            "id": s["id"],
            "number": s["number"],
            "title": s["title"],
            "phase": s["phase"],
            "total_tasks": s["total_tasks"],
            "completed_tasks": s["completed_tasks"],
            "completion_pct": s["completion_pct"],
        })
    return results


def get_sprint_by_id(sprints_dir: Path, sprint_id: str) -> Optional[dict]:
    """Get a specific sprint by its number."""
    clean_id = sprint_id.replace("sprint-", "")
    path = sprints_dir / f"sprint-{clean_id}.json"
    if not path.exists():
        # Try with original id
        path = sprints_dir / f"{sprint_id}.json"
    if not path.exists():
        return None
    return parse_sprint(path)
