"""
Governance panel parser — Sprint 719
Parses: trust scores, AAR receipts, constitutional signals, swarm health.
"""

import json
from pathlib import Path
from datetime import datetime, timedelta

KOGNAI_ROOT = Path.home() / "kognai"


def get_trust_scores() -> dict:
    """Parse ACP trust scores per agent."""
    path = KOGNAI_ROOT / "acp" / "trust-scores.json"
    try:
        data = json.loads(path.read_text())
        scores = data.get("scores", {})
        agents = []
        for agent_id, score_data in scores.items():
            dims = score_data.get("dimensions", score_data)
            composite = (
                dims.get("accuracy", 70) * 0.4 +
                dims.get("safety", 80) * 0.3 +
                dims.get("file_discipline", 70) * 0.15 +
                dims.get("constitutional_alignment", 70) * 0.15
            )
            agents.append({
                "agent_id": agent_id,
                "composite": round(composite, 1),
                "accuracy": dims.get("accuracy", 70),
                "safety": dims.get("safety", 80),
                "file_discipline": dims.get("file_discipline", 70),
                "constitutional_alignment": dims.get("constitutional_alignment", 70),
                "last_updated": score_data.get("last_updated"),
            })
        agents.sort(key=lambda a: a["composite"], reverse=True)
        return {"agents": agents, "count": len(agents), "updated": data.get("updated")}
    except Exception:
        return {"agents": [], "count": 0, "error": "trust-scores.json not readable"}


def get_aar_summary() -> dict:
    """Summarize AAR receipts from the last 7 days."""
    aar_dir = KOGNAI_ROOT / "logs" / "aar"
    if not aar_dir.exists():
        return {"total": 0, "success": 0, "rejected": 0, "days": []}

    cutoff = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    days = []
    total = 0
    success = 0
    rejected = 0

    for f in sorted(aar_dir.glob("*.jsonl")):
        date_str = f.stem
        if date_str < cutoff:
            continue
        day_total = 0
        day_success = 0
        for line in f.read_text().strip().split("\n"):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                day_total += 1
                total += 1
                if entry.get("status") == "success":
                    day_success += 1
                    success += 1
                else:
                    rejected += 1
            except Exception:
                pass
        days.append({"date": date_str, "total": day_total, "success": day_success})

    return {"total": total, "success": success, "rejected": rejected, "days": days}


def get_constitutional_signals() -> dict:
    """Parse SIGNALS.md for active signals."""
    path = KOGNAI_ROOT / "workspace" / "shared-context" / "SIGNALS.md"
    try:
        content = path.read_text()
        signals = []
        for line in content.split("\n"):
            if line.startswith("- **"):
                # Parse: - **SEVERITY** [Theme]: Description
                parts = line.split("**")
                if len(parts) >= 3:
                    severity = parts[1]
                    rest = parts[2].lstrip(": ").strip()
                    theme_match = rest.split("]:")
                    theme = theme_match[0].lstrip("[") if "]:" in rest else "Unknown"
                    description = theme_match[1].strip() if len(theme_match) > 1 else rest
                    signals.append({
                        "severity": severity,
                        "theme": theme,
                        "description": description,
                    })
        return {"signals": signals, "count": len(signals)}
    except Exception:
        return {"signals": [], "count": 0, "error": "SIGNALS.md not readable"}


def get_swarm_health() -> dict:
    """Read cached swarm health score."""
    path = KOGNAI_ROOT / "workspace" / "swarm-health.json"
    try:
        return json.loads(path.read_text())
    except Exception:
        return {"overall_score": 0, "overall_status": "UNKNOWN", "error": "swarm-health.json not found"}


def get_governance_summary() -> dict:
    """Full governance panel data."""
    return {
        "trust_scores": get_trust_scores(),
        "aar_summary": get_aar_summary(),
        "constitutional_signals": get_constitutional_signals(),
        "swarm_health": get_swarm_health(),
    }
