"""Parse docs/daily-brief.md for today's tasks."""

import re
from pathlib import Path
from typing import Optional


def parse_daily_brief(path: Path) -> dict:
    """Extract structured data from the daily brief markdown."""
    if not path.exists():
        return {"error": "Daily brief not found. Run: python3 scripts/generate-daily-brief.py"}

    content = path.read_text()
    lines = content.splitlines()

    # Extract metadata
    date_match = re.search(r'# KOGNAI DAILY BRIEF . (\d{4}-\d{2}-\d{2})', content)
    sprint_match = re.search(r'\*\*Active Sprint:\*\* (.+)', content)
    hours_match = re.search(r'\*\*Hours Today:\*\* (.+)', content)
    midday_match = re.search(r'\*\*Midday Block:\*\* (.+)', content)

    # Extract checkboxes grouped by time block
    blocks = {"AM": [], "MID": [], "PM": [], "other": []}
    current_block = "other"
    in_tomorrow = False

    for line in lines:
        # Detect time block headers
        if "TOMORROW" in line.upper():
            in_tomorrow = True
            continue

        if in_tomorrow:
            continue

        if re.search(r'\*\*AM\s', line) or "07:00" in line:
            current_block = "AM"
            continue
        elif re.search(r'\*\*MID\s', line) or "12:00" in line:
            current_block = "MID"
            continue
        elif re.search(r'\*\*PM\s', line) or "18:00" in line:
            current_block = "PM"
            continue
        elif "NOT AVAILABLE" in line or "NO MIDDAY" in line:
            current_block = "MID"
            blocks["MID"] = [{"done": False, "text": "Not available (Tue/Thu)", "disabled": True}]
            continue

        # Extract checkboxes (space=todo, x/X=done, >=deferred)
        checkbox = re.match(r'\s*- \[([ xX>])\] (.+)', line)
        if checkbox:
            marker = checkbox.group(1)
            done = marker.lower() == "x"
            deferred = marker == ">"
            text = checkbox.group(2).strip()
            blocks[current_block].append({
                "done": done,
                "deferred": deferred,
                "text": text,
                "disabled": False,
            })

    # Count totals
    all_tasks = []
    for block_tasks in blocks.values():
        all_tasks.extend([t for t in block_tasks if not t.get("disabled")])

    total = len(all_tasks)
    done = sum(1 for t in all_tasks if t["done"])

    return {
        "date": date_match.group(1) if date_match else "",
        "sprint": sprint_match.group(1) if sprint_match else "Unknown",
        "hours": hours_match.group(1) if hours_match else "",
        "midday": midday_match.group(1) if midday_match else "",
        "blocks": blocks,
        "total_tasks": total,
        "done_tasks": done,
        "completion_pct": round(done / total * 100, 1) if total > 0 else 0,
    }


def toggle_task(path: Path, block: str, index: int) -> Optional[dict]:
    """Toggle a checkbox in the daily brief markdown file.

    Args:
        path: Path to daily-brief.md
        block: Time block ("AM", "MID", "PM")
        index: 0-based index of the task within that block

    Returns:
        Updated brief data, or None on failure.
    """
    if not path.exists():
        return None

    content = path.read_text()
    lines = content.splitlines()

    current_block = "other"
    in_tomorrow = False
    block_checkbox_count = 0
    toggled = False

    for i, line in enumerate(lines):
        if "TOMORROW" in line.upper():
            in_tomorrow = True
            continue
        if in_tomorrow:
            continue

        # Detect block headers
        if re.search(r'\*\*AM\s', line) or "07:00" in line:
            current_block = "AM"
            block_checkbox_count = 0
            continue
        elif re.search(r'\*\*MID\s', line) or "12:00" in line:
            current_block = "MID"
            block_checkbox_count = 0
            continue
        elif re.search(r'\*\*PM\s', line) or "18:00" in line:
            current_block = "PM"
            block_checkbox_count = 0
            continue

        # Match checkboxes
        checkbox = re.match(r'^(\s*- \[)([ xX])(\] .+)', line)
        if checkbox and current_block == block:
            if block_checkbox_count == index:
                # Toggle the checkbox
                current_state = checkbox.group(2)
                new_state = " " if current_state.lower() == "x" else "x"
                lines[i] = f"{checkbox.group(1)}{new_state}{checkbox.group(3)}"
                toggled = True
                break
            block_checkbox_count += 1

    if not toggled:
        return None

    # Write back
    path.write_text("\n".join(lines) + "\n")

    # Return updated data
    return parse_daily_brief(path)


def defer_task(path: Path, block: str, index: int) -> Optional[dict]:
    """Defer a task: mark it as deferred in today's section and append to TOMORROW PREVIEW.

    Args:
        path: Path to daily-brief.md
        block: Time block ("AM", "MID", "PM")
        index: 0-based index of the task within that block

    Returns:
        Updated brief data, or None on failure.
    """
    if not path.exists():
        return None

    content = path.read_text()
    lines = content.splitlines()

    current_block = "other"
    in_tomorrow = False
    block_checkbox_count = 0
    deferred = False
    task_text = ""
    tomorrow_insert_line = None

    # Find TOMORROW PREVIEW section to know where to append
    for i, line in enumerate(lines):
        if "## TOMORROW PREVIEW" in line:
            # Find the end of TOMORROW section (next --- or end of file)
            for j in range(i + 1, len(lines)):
                if lines[j].strip() == "---":
                    tomorrow_insert_line = j
                    break
            if tomorrow_insert_line is None:
                tomorrow_insert_line = len(lines)
            break

    # Now find and defer the task
    current_block = "other"
    in_tomorrow = False
    block_checkbox_count = 0

    for i, line in enumerate(lines):
        if "TOMORROW" in line.upper():
            in_tomorrow = True
            continue
        if in_tomorrow:
            continue

        if re.search(r'\*\*AM\s', line) or "07:00" in line:
            current_block = "AM"
            block_checkbox_count = 0
            continue
        elif re.search(r'\*\*MID\s', line) or "12:00" in line:
            current_block = "MID"
            block_checkbox_count = 0
            continue
        elif re.search(r'\*\*PM\s', line) or "18:00" in line:
            current_block = "PM"
            block_checkbox_count = 0
            continue

        checkbox = re.match(r'^(\s*- \[)([ xX])(\] )(.+)', line)
        if checkbox and current_block == block:
            if block_checkbox_count == index:
                task_text = checkbox.group(4).strip()
                # Mark as deferred with > marker
                lines[i] = f"{checkbox.group(1)}>{checkbox.group(3)}{task_text}"
                deferred = True
                break
            block_checkbox_count += 1

    if not deferred or not task_text:
        return None

    # Append to TOMORROW PREVIEW section
    if tomorrow_insert_line is not None:
        lines.insert(tomorrow_insert_line, f"- [ ] {task_text} *(deferred)*")
    else:
        # No TOMORROW section — create one
        lines.append("")
        lines.append("## TOMORROW PREVIEW")
        lines.append("")
        lines.append(f"- [ ] {task_text} *(deferred)*")
        lines.append("")
        lines.append("---")

    # Write back
    path.write_text("\n".join(lines) + "\n")

    return parse_daily_brief(path)
