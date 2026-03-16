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


def _parse_date_range(date_str: str) -> tuple:
    """Parse date range strings like 'Mar 9-16', 'Mar 17 - Apr 11', 'Jun 1-27', 'Apr 7'.
    Returns (start_date, end_date) as date objects, or (None, None) on failure.
    """
    year = datetime.now().year
    s = date_str.strip()

    # Single date: "Apr 7"
    m = re.match(r'^([A-Z][a-z]+)\s+(\d+)$', s)
    if m:
        try:
            d = datetime.strptime(f"{m.group(1)} {m.group(2)} {year}", "%b %d %Y").date()
            return (d, d)
        except ValueError:
            return (None, None)

    # Same-month range: "Mar 9-16", "Jun 1-27"
    m = re.match(r'^([A-Z][a-z]+)\s+(\d+)\s*-\s*(\d+)$', s)
    if m:
        try:
            start = datetime.strptime(f"{m.group(1)} {m.group(2)} {year}", "%b %d %Y").date()
            end = datetime.strptime(f"{m.group(1)} {m.group(3)} {year}", "%b %d %Y").date()
            return (start, end)
        except ValueError:
            return (None, None)

    # Cross-month range: "Mar 17 - Apr 11", "Sep 29 - Dec 19"
    m = re.match(r'^([A-Z][a-z]+)\s+(\d+)\s*-\s*([A-Z][a-z]+)\s+(\d+)$', s)
    if m:
        try:
            start = datetime.strptime(f"{m.group(1)} {m.group(2)} {year}", "%b %d %Y").date()
            end = datetime.strptime(f"{m.group(3)} {m.group(4)} {year}", "%b %d %Y").date()
            return (start, end)
        except ValueError:
            return (None, None)

    return (None, None)


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
                # Strip markdown bold markers
                phases.append({
                    "phase": cols[0].replace("**", "").strip(),
                    "dates": cols[1].replace("**", "").strip(),
                    "focus": cols[2].replace("**", "").strip(),
                })
        elif table_started and not line.strip().startswith("|"):
            break

    # Determine current phase and status using proper date parsing
    today = datetime.now().date()
    for p in phases:
        start, end = _parse_date_range(p.get("dates", ""))
        if start and end:
            if today > end:
                p["status"] = "done"
                p["current"] = False
            elif start <= today <= end:
                p["status"] = "active"
                p["current"] = True
            else:
                p["status"] = "future"
                p["current"] = False
        else:
            p["status"] = "unknown"
            p["current"] = False

    return phases
