"""Parse docs/gate-tracker.md for decision gates."""

import re
from datetime import datetime
from pathlib import Path


def parse_gates(path: Path) -> list:
    """Extract gate entries from the markdown table."""
    if not path.exists():
        return []

    gates = []
    for line in path.read_text().splitlines():
        # Skip header and separator rows
        if not line.strip().startswith("|"):
            continue
        cols = [c.strip() for c in line.split("|")]
        cols = [c for c in cols if c]  # Remove empty strings from split

        if len(cols) < 3:
            continue
        if cols[0] in ("Gate", "---") or cols[0].startswith("---"):
            continue

        gate_name = cols[0]
        target_date = cols[1] if len(cols) > 1 else ""
        status_raw = cols[2] if len(cols) > 2 else ""
        result = cols[3] if len(cols) > 3 else ""
        notes = cols[4] if len(cols) > 4 else ""

        # Determine status
        if "[x]" in status_raw.lower() or "passed" in status_raw.lower():
            status = "passed"
        elif "failed" in status_raw.lower():
            status = "failed"
        else:
            status = "pending"

        # Calculate days until gate
        days_until = None
        try:
            # Parse "Mar 13" style dates (assume 2026)
            date_str = target_date.strip()
            if date_str:
                parsed = datetime.strptime(f"{date_str} 2026", "%b %d %Y")
                delta = (parsed - datetime.now()).days
                days_until = delta
        except ValueError:
            pass

        gates.append({
            "gate": gate_name,
            "target_date": target_date,
            "status": status,
            "result": result,
            "notes": notes,
            "days_until": days_until,
            "overdue": days_until is not None and days_until < 0 and status == "pending",
        })

    return gates


def parse_phases(path: Path) -> list:
    """Extract phase timeline from strategic-context.md."""
    if not path.exists():
        return []

    content = path.read_text()
    phases = []

    # Look for the phase table
    table_started = False
    for line in content.splitlines():
        if "Phase" in line and "Dates" in line and "Focus" in line:
            table_started = True
            continue
        if table_started and line.strip().startswith("|---"):
            continue
        if table_started and line.strip().startswith("|"):
            cols = [c.strip() for c in line.split("|")]
            cols = [c for c in cols if c]
            if len(cols) >= 3:
                phases.append({
                    "phase": cols[0],
                    "dates": cols[1],
                    "focus": cols[2],
                })
        elif table_started and not line.strip().startswith("|"):
            break

    # Determine current phase based on date
    now = datetime.now()
    for p in phases:
        p["current"] = False
        dates = p.get("dates", "")
        # Very rough matching — sufficient for display
        if "Mar 9-14" in dates and now.month == 3 and now.day <= 14:
            p["current"] = True
        elif "Mar 17" in dates and now.month == 3 and now.day >= 17:
            p["current"] = True
        elif "Apr" in dates and now.month == 4:
            p["current"] = True
        elif "May" in dates and now.month == 5:
            p["current"] = True
        elif "Jun" in dates and now.month == 6:
            p["current"] = True
        elif "Sep" in dates and now.month >= 7 and now.month <= 9:
            p["current"] = True
        elif "Dec" in dates and now.month >= 10:
            p["current"] = True

    return phases
