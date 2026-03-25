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
    """Extract the gate tracker table from the timeline (legacy fallback)."""
    gate_start = content.find("# GATE TRACKER")
    if gate_start == -1:
        return "No gate tracker found."

    gate_section = content[gate_start:]
    gate_end = gate_section.find("\n---\n", 100)
    if gate_end != -1:
        gate_section = gate_section[:gate_end]

    return gate_section.strip()


def _build_live_gate_tracker(repo_root: Path) -> str:
    """Build a live gate tracker from workspace/gates/phase1-5-gate.json.

    Sprint 1299: replaces static KOGNAI_DAILY_TIMELINE.md gate section with
    dynamic content showing real post counts, urgency, and days remaining.
    """
    import json as _json
    from datetime import date as _date

    today = _date.today()
    lines = ["# GATE TRACKER", f"*Updated: {today.isoformat()} (live)*", ""]

    # Phase 1.5 gate (primary active gate)
    gate_path = repo_root / "workspace" / "gates" / "phase1-5-gate.json"
    if gate_path.exists():
        try:
            gate = _json.loads(gate_path.read_text())
            urgency = gate.get("urgency", "?")
            days = gate.get("days_remaining", "?")
            deadline = gate.get("deadline", "2026-04-07")
            posts_done = gate.get("raw", {}).get("posts_count", 0)
            posts_remaining = gate.get("raw", {}).get("posts_remaining", "?")
            total_views = gate.get("raw", {}).get("total_views", 0)
            overall_pass = gate.get("overall_pass", False)
            recommendation = gate.get("recommendation", "")
            pass_icon = "✅" if overall_pass else ("🔴" if urgency == "CRITICAL" else ("🟠" if urgency == "BEHIND" else "🟡"))

            lines.append("## Phase 1.5 Gate — TikTok Kill Switch")
            lines.append(f"**Deadline:** {deadline}  |  **Days remaining:** {days}  |  **Status:** {pass_icon} {urgency}")
            lines.append("")
            lines.append("| Criterion | Target | Actual | Pass |")
            lines.append("|-----------|--------|--------|------|")

            for c in gate.get("criteria", []):
                c_pass = "✅" if c.get("pass") else "❌"
                details = c.get("details", "?").replace("|", "·")
                lines.append(f"| {c.get('name','?')} | — | {details} | {c_pass} |")

            lines.append("")
            if recommendation:
                lines.append(f"**Recommendation:** {recommendation}")
            lines.append("")
        except Exception as e:
            lines.append(f"*Could not read phase1-5-gate.json: {e}*")
            lines.append("")
    else:
        lines.append("*phase1-5-gate.json not found — run /gate to generate*")
        lines.append("")

    # Upcoming gate schedule
    upcoming_gates = [
        ("Phase 0 → Phase 1", "2026-03-13"),
        ("Phase 1.5 Decision", "2026-04-07"),
        ("Phase 1 → Phase 2A", "2026-04-11"),
        ("Achiri Lite Alpha Launch", "2026-04-25"),
        ("Lite Alpha Gate (voice works?)", "2026-05-01"),
        ("Full Alpha Gate (memory works?)", "2026-05-14"),
        ("Phase 2A → Phase 2B", "2026-05-30"),
        ("Phase 2B Gate", "2026-06-27"),
        ("Phase 3 Gate", "2026-09-26"),
        ("Year-End Review", "2026-12-19"),
    ]

    lines.append("## Upcoming Gates")
    lines.append("")
    lines.append("| Gate | Target Date | Days | Status |")
    lines.append("|------|-------------|------|--------|")
    for gate_name, gate_date_str in upcoming_gates:
        gate_date = _date.fromisoformat(gate_date_str)
        days_to = (gate_date - today).days
        if days_to < 0:
            status = "⬜ Past"
        elif days_to == 0:
            status = "🔴 TODAY"
        elif days_to <= 7:
            status = f"🔴 {days_to}d"
        elif days_to <= 21:
            status = f"🟠 {days_to}d"
        else:
            status = f"🟢 {days_to}d"
        lines.append(f"| {gate_name} | {gate_date_str} | {days_to} | {status} |")

    return "\n".join(lines)


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


def _build_live_focus(repo_root: Path) -> str:
    """Build a live focus section from gate JSON and sprint queue."""
    import json as _json
    import re as _re
    lines = ["## LIVE STATUS (auto-generated)"]

    # Gate status
    gate_path = repo_root / "workspace" / "gates" / "phase1-5-gate.json"
    urgency = "?"
    if gate_path.exists():
        try:
            gate = _json.loads(gate_path.read_text())
            urgency = gate.get("urgency", "?")
            days = gate.get("days_remaining", "?")
            posts_remaining = gate.get("raw", {}).get("posts_remaining", "?")
            posts_done = gate.get("raw", {}).get("posts_count", "?")
            if urgency == "DONE":
                urgency_icon = "✅"
            elif urgency in ("CRITICAL", "BEHIND"):
                urgency_icon = "🔴" if urgency == "CRITICAL" else "🟠"
            elif urgency == "WARNING":
                urgency_icon = "⚠️"
            else:
                urgency_icon = "🟢"
            lines.append(f"**Gate:** {urgency_icon} {urgency} — {posts_done}/30 posts · {posts_remaining} needed · {days}d to Apr 7")
        except Exception:
            lines.append("**Gate:** could not read phase1-5-gate.json")
    else:
        lines.append("**Gate:** phase1-5-gate.json not found — run /gate to regenerate")

    # Godman + Achiri countdowns
    from datetime import date as _date
    today = _date.today()
    godman_days = ((_date(2026, 4, 14)) - today).days
    achiri_days = ((_date(2026, 4, 25)) - today).days
    lines.append(f"**Godman launch:** {godman_days}d — April 14  |  **Achiri alpha:** {achiri_days}d — April 25")

    # Next sprint from queue (first pending item)
    queue_path = repo_root / "workspace" / "sprint-queue.json"
    if queue_path.exists():
        try:
            queue = _json.loads(queue_path.read_text())
            pending = [i for i in queue.get("queue", []) if i.get("status") not in ("done", "skipped")]
            if pending:
                nxt = pending[0]
                lines.append(f"**Next queued sprint:** Sprint {nxt['sprint']} — {nxt['title'][:80]}")
            else:
                lines.append("**Next sprint:** queue empty — run /replenish or pick manually")
        except Exception:
            pass

    # Open blocker detection
    blockers = []
    env_path = repo_root / ".env"
    if env_path.exists():
        try:
            env_text = env_path.read_text()
            if not _re.search(r"^TIKTOK_ACCESS_TOKEN=\S+", env_text, _re.MULTILINE):
                blockers.append("🔴 **TIKTOK_ACCESS_TOKEN** not set — live TikTok posting blocked (set in .env)")
        except Exception:
            pass
    else:
        blockers.append("⚠️ **.env file not found** — check environment setup")

    if urgency not in ("?", "DONE", "ON_TRACK"):
        blockers.append(f"🟠 **Gate urgency: {urgency}** — posting pace needs attention")

    if blockers:
        lines.append("")
        lines.append("**Blockers:**")
        for b in blockers:
            lines.append(f"- {b}")

    return "\n".join(lines)


def _build_dynamic_tasks(repo_root: Path, target_date: datetime, has_midday: bool) -> str:
    """Build a dynamic TODAY'S TASKS section from live system state.

    Sprint 1055: replaces stale KOGNAI_DAILY_TIMELINE.md task blocks with actionable
    items derived from gate JSON, sprint queue, blockers, and launch countdown.
    """
    import json as _json
    from datetime import date as _date

    today = _date.today()
    lines = []

    # Determine AM/PM blocks + optional midday
    blocks = [("AM", "07:00–09:30")]
    if has_midday:
        blocks.append(("MID", "12:00–14:00"))
    blocks.append(("PM", "18:00–19:30"))

    # --- Gather live data ---
    gate_data: dict = {}
    gate_path = repo_root / "workspace" / "gates" / "phase1-5-gate.json"
    if gate_path.exists():
        try:
            gate_data = _json.loads(gate_path.read_text())
        except Exception:
            pass

    posts_done = gate_data.get("raw", {}).get("posts_count", 0)
    posts_remaining = gate_data.get("raw", {}).get("posts_remaining", 28)
    days_left = gate_data.get("days_remaining", 14)
    daily_obligation = max(1, -(-posts_remaining // max(1, days_left)))  # ceil div
    urgency = gate_data.get("urgency", "")

    godman_days = ((_date(2026, 4, 14)) - today).days
    achiri_days = ((_date(2026, 4, 25)) - today).days

    # Check blockers
    env_path = repo_root / ".env"
    has_achiri_token = False
    if env_path.exists():
        env_text = env_path.read_text()
        has_achiri_token = bool(
            __import__("re").search(r"^ACHIRI_TELEGRAM_BOT_TOKEN=.+", env_text, __import__("re").MULTILINE)
        )

    # Next sprint from queue
    next_sprint_title = ""
    queue_path = repo_root / "workspace" / "sprint-queue.json"
    if queue_path.exists():
        try:
            queue = _json.loads(queue_path.read_text())
            pending = [i for i in queue.get("queue", []) if i.get("status") not in ("done", "skipped")]
            if pending:
                nxt = pending[0]
                t = nxt['title']
                next_sprint_title = f"Sprint {nxt['sprint']}: {t[:70]}{'…' if len(t) > 70 else ''}"
        except Exception:
            pass

    # --- Build task blocks ---
    day_name = DAY_NAMES[target_date.weekday()]
    lines.append(f"### {day_name}, {target_date.strftime('%B')} {target_date.day}")

    # AM block: gate + sprint
    am_tasks = []

    if urgency not in ("DONE", ""):
        gate_emoji = "🔴" if urgency == "CRITICAL" else ("🟠" if urgency == "BEHIND" else "⚠️")
        am_tasks.append(
            f"- [ ] {gate_emoji} **Post {daily_obligation} TikTok video(s) today** "
            f"({posts_done}/30 · {days_left}d left · /today for top picks)"
        )
    elif posts_done >= 30:
        am_tasks.append("- [x] ✅ Phase 1.5 gate target reached (30/30 posts)")

    if next_sprint_title:
        am_tasks.append(f"- [ ] 🛠️ **{next_sprint_title}** — /sprint to view queue")
    else:
        am_tasks.append("- [ ] 🔄 Queue empty — run /replenish to generate next sprint")

    am_tasks.append("- [ ] /errors — check for overnight process errors")
    am_tasks.append("- [ ] /status — confirm gate pace and cron health")

    lines.append(f"\n**AM 07:00–09:30**")
    lines.extend(am_tasks)

    # MID block (Mon/Wed/Fri only)
    if has_midday:
        mid_tasks = []
        if posts_done < 30:
            mid_tasks.append(
                f"- [ ] 📱 **[YOU] Post today's video(s)** — /pickup then /caption-next for text"
            )
        if godman_days <= 21:
            mid_tasks.append(
                f"- [ ] 🚀 Godman: {godman_days}d to launch — /godman for readiness checklist"
            )
            if godman_days <= 14:
                mid_tasks.append("- [ ] npm login check — /blockers shows npm whoami status")
        if not has_achiri_token:
            mid_tasks.append(
                "- [ ] 🤖 Achiri: set ACHIRI_TELEGRAM_BOT_TOKEN in .env → ./scripts/achiri/start-bot.sh"
            )
        if not mid_tasks:
            mid_tasks.append("- [ ] Review sprint output from AM block")
        lines.append(f"\n**MID 12:00–14:00**")
        lines.extend(mid_tasks)

    # PM block: review + log
    pm_tasks = []
    pm_tasks.append("- [ ] Review AM sprint output — /changelog to see what shipped")
    if posts_done < 30:
        pm_tasks.append(
            f"- [ ] Check today's post count: /gate (need {daily_obligation}/day to stay on track)"
        )
    if achiri_days <= 32:
        pm_tasks.append(
            f"- [ ] Achiri: {achiri_days}d to alpha — /achiri for readiness summary"
        )
    pm_tasks.append("- [ ] Write session log to workspace/agents/memory/")

    lines.append(f"\n**PM 18:00–19:30**")
    lines.extend(pm_tasks)

    return "\n".join(lines)


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

    # Get today's section from timeline (may be stale)
    today_section = find_today_section(content, target_date)
    week_section = find_week_section(content, target_date) if week_mode else None
    active_sprint = extract_active_sprint(content, target_date)

    # Determine time blocks
    has_midday = target_date.weekday() in [0, 2, 4]  # Mon, Wed, Fri
    hours_today = "6h" if has_midday else "4h"

    midday_status = "YES (12:00-14:00)" if has_midday else "NO (Tuesday/Thursday)"

    # Inject live gate and sprint queue status
    repo_root = Path(__file__).parent.parent
    live_focus = _build_live_focus(repo_root)

    # Sprint 1055: always use dynamic task generator — KOGNAI_DAILY_TIMELINE.md is months
    # old and its task blocks are stale (reference sprint-067, subscription-bot, etc.).
    # Dynamic tasks are derived from live gate state, sprint queue, and launch countdowns.
    # The timeline section is kept only as optional WEEK CONTEXT in --week mode.
    today_section = _build_dynamic_tasks(repo_root, target_date, has_midday)

    # Build brief
    brief = f"""# KOGNAI DAILY BRIEF — {date_str}
## {day_name}, {month_name} {target_date.day}, {target_date.year}

**Generated:** {datetime.now().strftime("%Y-%m-%d %H:%M")}
**Active Sprint:** {active_sprint}
**Hours Today:** {hours_today}
**Midday Block:** {midday_status}

---

{live_focus}

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

*Source: live gate state + sprint queue | Dev Plan: KOGNAI_FULL_DEVELOPMENT_PLAN.md*
*Auto-generated by generate-daily-brief.py (Sprint 1299: fully dynamic)*
"""

    # Write brief
    BRIEF_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    BRIEF_OUTPUT.write_text(brief)
    print(f"Daily brief written to {BRIEF_OUTPUT}")
    print(f"  Date: {day_name}, {month_name} {target_date.day}")
    print(f"  Sprint: {active_sprint}")
    print(f"  Hours: {hours_today}")

    # Write gate tracker (Sprint 1299: live from gate JSON, not static timeline)
    gate_content = _build_live_gate_tracker(repo_root)
    GATE_TRACKER_OUTPUT.write_text(gate_content + "\n")
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
