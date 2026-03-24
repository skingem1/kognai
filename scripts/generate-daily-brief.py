#!/usr/bin/env python3
"""
KOGNAI Daily Brief Generator
Runs every morning before the swarm starts.
Extracts today's tasks from KOGNAI_DAILY_TIMELINE.md and creates a focused brief.

Output: ~/kognai/docs/daily-brief.md (read by all agents at session start)

Usage:
  python3 scripts/generate-daily-brief.py                    # today
  python3 scripts/generate-daily-brief.py 2026-03-10         # specific date
  python3 scripts/generate-daily-brief.py --week             # full week view

Cron: 06:55 every weekday (before your 07:00 AM block)
"""

import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

# --- Config ---
TIMELINE_PATH = Path.home() / "Documents" / "Kognai" / "KOGNAI_DAILY_TIMELINE.md"
DEV_PLAN_PATH = Path.home() / "Documents" / "Kognai" / "KOGNAI_FULL_DEVELOPMENT_PLAN.md"
BRIEF_OUTPUT = Path.home() / "kognai" / "docs" / "daily-brief.md"
STRATEGIC_OUTPUT = Path.home() / "kognai" / "docs" / "strategic-context.md"
GATE_TRACKER_OUTPUT = Path.home() / "kognai" / "docs" / "gate-tracker.md"

# Day name mapping for timeline parsing
DAY_NAMES = {
    0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday",
    4: "Friday", 5: "Saturday", 6: "Sunday"
}

MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December"
}


def load_timeline():
    """Load the full timeline file."""
    if not TIMELINE_PATH.exists():
        print(f"ERROR: Timeline not found at {TIMELINE_PATH}")
        sys.exit(1)
    return TIMELINE_PATH.read_text()


def find_today_section(content: str, target_date: datetime) -> str:
    """Extract today's section from the timeline."""
    day_name = DAY_NAMES[target_date.weekday()]
    month_name = MONTH_NAMES[target_date.month]
    day_num = target_date.day

    # Try multiple patterns — timeline may have mismatched day names
    # Priority: date-specific patterns first, then any-day patterns
    any_day = r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)"
    patterns = [
        # Exact: "### Monday, March 10, 2026"
        rf"### {day_name}, {month_name} {day_num}, {target_date.year}",
        # Exact without year: "### Monday, March 10"
        rf"### {day_name}, {month_name} {day_num}\b",
        # Any day name with correct date+year: "### Tuesday, March 10, 2026"
        rf"### {any_day}, {month_name} {day_num}, {target_date.year}",
        # Any day name with correct date: "### Tuesday, March 10"
        rf"### {any_day}, {month_name} {day_num}\b",
        # Just the date in a header: "### March 10"
        rf"### .*{month_name} {day_num}\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, content)
        if match:
            start = match.start()
            # Find next section delimiter: "---" or next "###"
            next_section = re.search(r"\n---\n|\n### ", content[match.end():])
            if next_section:
                end = match.end() + next_section.start()
            else:
                end = min(start + 3000, len(content))
            return content[start:end].strip()

    return None


def find_week_section(content: str, target_date: datetime) -> str:
    """Extract the full week section containing the target date."""
    # Find "## Week N:" sections
    week_pattern = r"## Week \d+:.*?\n"
    matches = list(re.finditer(week_pattern, content))

    for i, match in enumerate(matches):
        # Get the date range from the week header
        week_text_start = match.start()
        if i + 1 < len(matches):
            week_text_end = matches[i + 1].start()
        else:
            week_text_end = len(content)

        week_content = content[week_text_start:week_text_end]

        # Check if today's date appears in this week's content
        day_name = DAY_NAMES[target_date.weekday()]
        month_name = MONTH_NAMES[target_date.month]
        day_num = target_date.day

        if f"{month_name} {day_num}" in week_content or f"{day_name}, {month_name} {day_num}" in week_content:
            return week_content.strip()

    return None


def find_current_phase(content: str, target_date: datetime) -> str:
    """Determine which phase we're in based on date."""
    phase_markers = [
        ("PHASE 0", "March 9", "March 14"),
        ("PHASE 1", "March 17", "April 11"),
        ("PHASE 2A", "April 14", "May 16"),
        ("PHASE 2B", "June 1", "June 27"),
        ("PHASE 3", "June 29", "September 26"),
        ("PHASE 4", "September 29", "December 19"),
    ]

    # Extract phase headers from content
    phase_pattern = r"# (PHASE \d[A-B]?) — (.+?)$"
    phases = re.findall(phase_pattern, content, re.MULTILINE)

    for phase_name, phase_desc in phases:
        return f"{phase_name} — {phase_desc}"

    return "Unknown Phase"


def extract_active_sprint(content: str, target_date: datetime) -> str:
    """Find the active sprint from git log (most recent Sprint N commit)."""
    import subprocess, os
    repo_root = Path(__file__).parent.parent
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-20"],
            cwd=repo_root, capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            m = re.search(r"Sprint (\d{3,4})", line)
            if m:
                return f"sprint-{m.group(1)}"
    except Exception:
        pass
    # Fallback: scan workspace/sprints/ for highest sprint number
    sprints_dir = repo_root / "workspace" / "sprints"
    if sprints_dir.exists():
        nums = []
        for f in sprints_dir.glob("sprint-*.json"):
            m = re.search(r"sprint-(\d+)", f.name)
            if m:
                nums.append(int(m.group(1)))
        if nums:
            return f"sprint-{max(nums)}"
    # Legacy fallback: parse timeline document
    today_section = find_today_section(content, target_date)
    if today_section:
        sprint_match = re.search(r"[Ss]print[ -]?(\d{3,4})", today_section)
        if sprint_match:
            return sprint_match.group(0)
    return "Unknown"


def extract_gate_tracker(content: str) -> str:
    """Extract the gate tracker table from the timeline."""
    gate_start = content.find("# GATE TRACKER")
    if gate_start == -1:
        return "No gate tracker found."

    gate_section = content[gate_start:]
    gate_end = gate_section.find("\n---\n", 100)
    if gate_end != -1:
        gate_section = gate_section[:gate_end]

    return gate_section.strip()


def extract_strategic_summary(dev_plan_content: str) -> str:
    """Extract a concise strategic summary from the dev plan."""
    lines = dev_plan_content.split("\n")
    summary_lines = []
    in_section = False
    sections_to_extract = [
        "CRITICAL PATH",
        "PRIORITY CLASSIFICATION",
        "CURRENT SPRINT",
        "PHASE OVERVIEW",
    ]

    # Extract key sections (first 20 lines of each)
    for i, line in enumerate(lines):
        for section_name in sections_to_extract:
            if section_name.lower() in line.lower() and line.startswith("#"):
                in_section = True
                section_lines = 0
                summary_lines.append(f"\n{line}")
                continue

        if in_section:
            if line.startswith("# ") and section_lines > 2:
                in_section = False
                continue
            summary_lines.append(line)
            section_lines = section_lines + 1 if 'section_lines' in dir() else 1
            if section_lines > 25:
                in_section = False
                summary_lines.append("...(truncated)")

    return "\n".join(summary_lines[:100])


def generate_brief(target_date: datetime, week_mode: bool = False, force_strategic: bool = False):
    """Generate the daily brief file."""
    content = load_timeline()

    day_name = DAY_NAMES[target_date.weekday()]
    month_name = MONTH_NAMES[target_date.month]
    date_str = target_date.strftime("%Y-%m-%d")

    # Weekend check
    if target_date.weekday() >= 5:
        brief = f"""# KOGNAI DAILY BRIEF — {date_str}
## {day_name}, {month_name} {target_date.day}, {target_date.year}

**STATUS: WEEKEND — NO WORK SCHEDULED**

Next working day: Monday, {month_name} {target_date.day + (7 - target_date.weekday())}

Swarm is idle. Rest.
"""
        BRIEF_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        BRIEF_OUTPUT.write_text(brief)
        print(f"Weekend brief written to {BRIEF_OUTPUT}")
        return

    # Get today's section
    today_section = find_today_section(content, target_date)
    week_section = find_week_section(content, target_date) if week_mode else None
    active_sprint = extract_active_sprint(content, target_date)

    # Determine time blocks
    has_midday = target_date.weekday() in [0, 2, 4]  # Mon, Wed, Fri
    hours_today = "6h" if has_midday else "4h"
    midday_status = "YES (12:00-14:00)" if has_midday else "NO (Tuesday/Thursday)"

    # Build brief
    brief = f"""# KOGNAI DAILY BRIEF — {date_str}
## {day_name}, {month_name} {target_date.day}, {target_date.year}

**Generated:** {datetime.now().strftime("%Y-%m-%d %H:%M")}
**Active Sprint:** {active_sprint}
**Hours Today:** {hours_today}
**Midday Block:** {midday_status}

---

## SCHEDULE

| Block | Time | Available |
|-------|------|-----------|
| AM | 07:00–09:30 | YES |
| MID | 12:00–14:00 | {"YES" if has_midday else "NO"} |
| PM | 18:00–19:30 | YES |

---

## TODAY'S TASKS

"""

    if today_section:
        brief += today_section + "\n"
    else:
        brief += f"*No specific daily tasks found for {date_str}. Check weekly schedule below.*\n"

    if week_section and week_mode:
        brief += f"\n---\n\n## FULL WEEK CONTEXT\n\n{week_section}\n"

    # Add tomorrow preview
    tomorrow = target_date + timedelta(days=1)
    if tomorrow.weekday() < 5:  # Not weekend
        tomorrow_section = find_today_section(content, tomorrow)
        if tomorrow_section:
            # Just first 5 lines
            preview_lines = tomorrow_section.split("\n")[:8]
            brief += f"\n---\n\n## TOMORROW PREVIEW\n\n" + "\n".join(preview_lines) + "\n"

    brief += f"""
---

## STANDING ORDERS

1. **Every sprint output** must be reviewed before the next sprint starts
2. **Session logs** written at end of every PM block
3. **TikTok maintenance** = 15 min max (after Phase 1 launch)
4. **Gate decisions** require explicit rationale written to session log
5. **If blocked:** document blocker, skip to next task, revisit in next block

---

*Source: KOGNAI_DAILY_TIMELINE.md | Dev Plan: KOGNAI_FULL_DEVELOPMENT_PLAN.md*
*Auto-generated by generate-daily-brief.py*
"""

    # Write brief
    BRIEF_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    BRIEF_OUTPUT.write_text(brief)
    print(f"Daily brief written to {BRIEF_OUTPUT}")
    print(f"  Date: {day_name}, {month_name} {target_date.day}")
    print(f"  Sprint: {active_sprint}")
    print(f"  Hours: {hours_today}")

    # Write gate tracker
    gate_content = extract_gate_tracker(content)
    GATE_TRACKER_OUTPUT.write_text(f"# GATE TRACKER\n*Updated: {date_str}*\n\n{gate_content}\n")
    print(f"Gate tracker written to {GATE_TRACKER_OUTPUT}")

    # Write strategic context (from dev plan, if available)
    # Skip if file already exists and --force-strategic not passed (prevents overwriting curated content)
    if DEV_PLAN_PATH.exists() and (force_strategic or not STRATEGIC_OUTPUT.exists()):
        dev_plan = DEV_PLAN_PATH.read_text()
        strategic = f"""# KOGNAI STRATEGIC CONTEXT
*Extracted from KOGNAI_FULL_DEVELOPMENT_PLAN.md on {date_str}*

## KEY PRINCIPLES
- TikTok = cashflow engine (must never break)
- Achiri = product differentiator (voice before memory)
- Kognai Runtime = infrastructure layer (abstracted last)
- ~95% agent work runs local ($0.00), cloud only on escalation
- Gate-driven: never proceed past a phase without passing the gate

## PHASE SEQUENCE
| Phase | Dates | Focus |
|-------|-------|-------|
| P0 | Mar 9-14 | Foundation hardening (TASK_TARGET + event bus) |
| P1 | Mar 17 - Apr 11 | TikTok content pipeline (revenue) |
| P1.5 | Apr 7 | Decision gate: TikTok stable enough for Achiri? |
| P2A | Apr 14 - May 16 | Achiri lite alpha → full alpha |
| P2B | Jun 1-27 | Runtime extraction + auditor |
| P3 | Jun 29 - Sep 26 | Plumber agents, QLoRA, ACP, scale |
| P4 | Sep 29 - Dec 19 | SDK, survey agent, marketplace |

## COST GUARDRAILS
- Local models: qwen3:0.6b/4b/14b, deepseek-r1:14b ($0.00)
- Cloud escalation: Claude Sonnet ($0.003/1k), Opus ($0.015/1k)
- Budget guard: any task estimated >$0.10 falls back to POWER tier
- Target: <$5/day cloud spend

## SPRINT NUMBERING
- Invoica legacy: 001-062e (completed)
- Kognai starts: 063+
- Current: {active_sprint}

## FOUNDER SCHEDULE
- AM (07:00-09:30): Review + kick off
- MID (12:00-14:00, M/W/F only): Deep work
- PM (18:00-19:30): Check progress + session log
- Weekends: OFF
- Total: 26h/week

*Full plan: ~/Documents/Kognai/KOGNAI_FULL_DEVELOPMENT_PLAN.md*
*Full timeline: ~/Documents/Kognai/KOGNAI_DAILY_TIMELINE.md*
"""
        STRATEGIC_OUTPUT.write_text(strategic)
        print(f"Strategic context written to {STRATEGIC_OUTPUT}")
    elif STRATEGIC_OUTPUT.exists() and not force_strategic:
        print(f"Strategic context already exists — skipping (use --force-strategic to overwrite)")


if __name__ == "__main__":
    force_strategic = "--force-strategic" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--force-strategic"]

    if args:
        if args[0] == "--week":
            target = datetime.now()
            generate_brief(target, week_mode=True, force_strategic=force_strategic)
        else:
            try:
                target = datetime.strptime(args[0], "%Y-%m-%d")
            except ValueError:
                print(f"Invalid date format. Use YYYY-MM-DD")
                sys.exit(1)
            generate_brief(target, force_strategic=force_strategic)
    else:
        generate_brief(datetime.now(), force_strategic=force_strategic)
