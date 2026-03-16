"""Parse daily plan markdown files for both Kognai and Invoica."""
import os, re
from datetime import date
from pathlib import Path

KOGNAI_PLANS = Path.home() / "Documents" / "Kognai" / "plans" / "daily"
INVOICA_PLANS = Path.home() / "Documents" / "Invoica" / "plans" / "daily"


def parse_daily_plan(file_path: str) -> dict | None:
    if not os.path.exists(file_path):
        return None
    with open(file_path, "r") as f:
        content = f.read()

    result = {
        "file": str(file_path),
        "date": None,
        "priorities": [],
        "targets": [],
        "human_actions": [],
        "state_table": [],
        "blockers": [],
        "risk_register": [],
    }

    # Date from title
    m = re.search(r"# .+ — (\d{4}-\d{2}-\d{2})", content)
    if m:
        result["date"] = m.group(1)

    # Priorities — ### PRIORITY N: Title
    for pm in re.finditer(
        r"### PRIORITY (\d+):\s*(.+?)(?=\n### PRIORITY |\n## |\Z)", content, re.DOTALL
    ):
        num = int(pm.group(1))
        block = pm.group(2).strip()
        title = block.split("\n")[0].strip()
        is_human = bool(re.search(r"[Hh]uman [Aa]ction|HUMAN", block))
        est = None
        em = re.search(r"\*\*Est\.?\*\*:?\s*(.+)", block)
        if em:
            est = em.group(1).strip()

        # Detect done (if title contains DONE or ✅)
        is_done = bool(re.search(r"✅|DONE|COMPLETE", title, re.IGNORECASE))

        result["priorities"].append({
            "number": num,
            "title": title,
            "is_human_action": is_human,
            "is_done": is_done,
            "estimate": est,
        })
        if is_human:
            result["human_actions"].append({
                "priority": num,
                "title": title,
                "estimate": est,
                "is_done": is_done,
            })

    # End-of-Day Targets
    tm = re.search(r"## End-of-Day Targets\s*\n(.*?)(?=\n## |\n---|\Z)", content, re.DOTALL)
    if tm:
        for line in tm.group(1).strip().split("\n"):
            cm = re.match(r"-\s*\[([ xX>])\]\s*(.+)", line.strip())
            if cm:
                marker = cm.group(1)
                text = cm.group(2).strip()
                status = "done" if marker.lower() == "x" else "deferred" if marker == ">" else "pending"
                result["targets"].append({"text": text, "status": status})

    # Current State table
    sm = re.search(r"## Current State.*?\n(.*?)(?=\n## |\n---|\Z)", content, re.DOTALL)
    if sm:
        for row in re.findall(r"\|\s*(.+?)\s*\|\s*(.+?)\s*\|", sm.group(1)):
            area, status = row
            if area.strip() not in ("Area", "------", "---", ""):
                result["state_table"].append({"area": area.strip(), "status": status.strip()})

    # Blockers
    bm = re.search(r"### Blockers\s*\n(.*?)(?=\n### |\n## |\n---|\Z)", content, re.DOTALL)
    if bm:
        for line in bm.group(1).strip().split("\n"):
            line = line.strip()
            if line.startswith("- **"):
                result["blockers"].append(line.lstrip("- "))

    # Risk Register
    rm = re.search(r"## Risk Register\s*\n(.*?)(?=\n## |\n---|\Z)", content, re.DOTALL)
    if rm:
        for row in re.findall(r"\|\s*(.+?)\s*\|\s*(.+?)\s*\|", rm.group(1)):
            risk, mitigation = row
            if risk.strip() not in ("Risk", "------", "---", ""):
                result["risk_register"].append({"risk": risk.strip(), "mitigation": mitigation.strip()})

    # Security Audit table
    sam = re.search(r"## Security Audit\s*\n(.*?)(?=\n## |\n---|\Z)", content, re.DOTALL)
    if sam:
        sec_rows = []
        for row in re.findall(r"\|\s*(.+?)\s*\|\s*(.+?)\s*\|", sam.group(1)):
            layer, status = row
            if layer.strip() not in ("Layer", "------", "---", ""):
                sec_rows.append({"layer": layer.strip(), "status": status.strip()})
        if sec_rows:
            result["security_audit"] = sec_rows

    # SCS-001 Build Track (ascii tree)
    scs_m = re.search(r"## SCS-001 Build Track.*?\n```(.*?)```", content, re.DOTALL)
    if scs_m:
        result["scs001_tree"] = scs_m.group(1).strip()

    return result


def get_today_plans() -> dict:
    today = date.today().isoformat()
    filename = f"{today}.md"
    return {
        "date": today,
        "kognai": parse_daily_plan(str(KOGNAI_PLANS / filename)),
        "invoica": parse_daily_plan(str(INVOICA_PLANS / filename)),
    }
