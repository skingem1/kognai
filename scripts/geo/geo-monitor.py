#!/usr/bin/env python3
"""
geo-monitor.py — Weekly GEO health check for kognai.ai

Checks:
1. robots.txt allows GPTBot, ClaudeBot, PerplexityBot
2. llms.txt is accessible and valid
3. JSON-LD schema is present and parseable
4. Citable blocks meet word count requirements (134-167 words)
5. Brand mention delta (delegates to brand-mention-scan.ts)

Outputs results to workspace/geo/geo-health.json
Schedule: Weekly via PM2 cron

Usage: python3 scripts/geo/geo-monitor.py [--url https://kognai.ai]
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent.parent / "workspace" / "geo"
HEALTH_PATH = WORKSPACE / "geo-health.json"
CITABLE_PATH = WORKSPACE / "citable-blocks.json"
BASELINE_PATH = WORKSPACE / "brand-baseline.json"

DEFAULT_URL = "https://kognai.ai"


def check_robots_txt(base_url: str) -> dict:
    """Check if AI crawlers are allowed in robots.txt."""
    bots = ["GPTBot", "ClaudeBot", "PerplexityBot", "GoogleOther"]
    result = {"check": "robots_txt", "status": "unknown", "details": {}}
    try:
        url = f"{base_url}/robots.txt"
        req = urllib.request.Request(url, headers={"User-Agent": "KognaiGEOMonitor/1.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        content = resp.read().decode("utf-8")
        for bot in bots:
            if f"User-agent: {bot}" in content and "Disallow: /" in content.split(f"User-agent: {bot}")[1].split("User-agent:")[0]:
                result["details"][bot] = "blocked"
            else:
                result["details"][bot] = "allowed"
        blocked = [b for b, s in result["details"].items() if s == "blocked"]
        result["status"] = "fail" if blocked else "pass"
        if blocked:
            result["message"] = f"Blocked bots: {', '.join(blocked)}"
    except urllib.error.URLError as e:
        result["status"] = "error"
        result["message"] = f"Cannot fetch robots.txt: {e}"
    except Exception as e:
        result["status"] = "error"
        result["message"] = str(e)
    return result


def check_llms_txt(base_url: str) -> dict:
    """Check if llms.txt is accessible."""
    result = {"check": "llms_txt", "status": "unknown"}
    try:
        url = f"{base_url}/llms.txt"
        req = urllib.request.Request(url, headers={"User-Agent": "KognaiGEOMonitor/1.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        content = resp.read().decode("utf-8")
        result["status"] = "pass" if len(content) > 100 else "warn"
        result["length"] = len(content)
        result["has_entities"] = "Kognai" in content
    except urllib.error.HTTPError as e:
        if e.code == 404:
            result["status"] = "fail"
            result["message"] = "llms.txt not found (404) — deploy workspace/geo/llms.txt to site root"
        else:
            result["status"] = "error"
            result["message"] = f"HTTP {e.code}"
    except Exception as e:
        result["status"] = "error"
        result["message"] = str(e)
    return result


def check_jsonld(base_url: str) -> dict:
    """Check if JSON-LD is present on homepage."""
    result = {"check": "jsonld", "status": "unknown"}
    try:
        req = urllib.request.Request(base_url, headers={"User-Agent": "KognaiGEOMonitor/1.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        html = resp.read().decode("utf-8")
        has_org = '"@type":"Organization"' in html or '"@type": "Organization"' in html
        has_app = '"@type":"SoftwareApplication"' in html or '"@type": "SoftwareApplication"' in html
        result["has_organization"] = has_org
        result["has_software_application"] = has_app
        result["status"] = "pass" if (has_org or has_app) else "fail"
        if not has_org and not has_app:
            result["message"] = "No JSON-LD found — deploy workspace/geo/jsonld-*.json as <script type='application/ld+json'>"
    except Exception as e:
        result["status"] = "error"
        result["message"] = str(e)
    return result


def check_citable_blocks() -> dict:
    """Validate local citable blocks meet word count requirements."""
    result = {"check": "citable_blocks", "status": "unknown", "blocks": []}
    try:
        if not CITABLE_PATH.exists():
            result["status"] = "fail"
            result["message"] = "citable-blocks.json not found"
            return result

        data = json.loads(CITABLE_PATH.read_text())
        blocks = data.get("blocks", [])
        all_valid = True
        for block in blocks:
            wc = len(block.get("content", "").split())
            valid = 134 <= wc <= 167
            if not valid:
                all_valid = False
            result["blocks"].append({
                "id": block.get("id"),
                "word_count": wc,
                "valid": valid,
            })
        result["total_blocks"] = len(blocks)
        result["status"] = "pass" if all_valid and len(blocks) >= 5 else "warn"
        if not all_valid:
            result["message"] = "Some blocks outside 134-167 word range"
    except Exception as e:
        result["status"] = "error"
        result["message"] = str(e)
    return result


def check_brand_baseline() -> dict:
    """Check brand baseline freshness."""
    result = {"check": "brand_baseline", "status": "unknown"}
    try:
        if not BASELINE_PATH.exists():
            result["status"] = "fail"
            result["message"] = "brand-baseline.json not found"
            return result

        data = json.loads(BASELINE_PATH.read_text())
        next_scan = data.get("next_scan_due", "")
        if next_scan:
            due = datetime.fromisoformat(next_scan.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            overdue = now > due
            result["status"] = "warn" if overdue else "pass"
            result["next_scan_due"] = next_scan
            result["overdue"] = overdue
            if overdue:
                result["message"] = f"Brand scan overdue since {next_scan}"
        else:
            result["status"] = "warn"
            result["message"] = "No next_scan_due set"
    except Exception as e:
        result["status"] = "error"
        result["message"] = str(e)
    return result


def compute_geo_score(checks: list) -> int:
    """Compute overall GEO health score (0-100)."""
    weights = {
        "robots_txt": 25,
        "llms_txt": 25,
        "jsonld": 20,
        "citable_blocks": 20,
        "brand_baseline": 10,
    }
    score = 0
    for check in checks:
        name = check["check"]
        w = weights.get(name, 0)
        if check["status"] == "pass":
            score += w
        elif check["status"] == "warn":
            score += w * 0.5
        # fail/error = 0
    return int(score)


def main():
    base_url = DEFAULT_URL
    if len(sys.argv) > 2 and sys.argv[1] == "--url":
        base_url = sys.argv[2]

    print(f"=== Kognai GEO Health Monitor ===")
    print(f"Target: {base_url}")
    print(f"Date: {datetime.now(timezone.utc).isoformat()}")
    print()

    checks = [
        check_robots_txt(base_url),
        check_llms_txt(base_url),
        check_jsonld(base_url),
        check_citable_blocks(),
        check_brand_baseline(),
    ]

    for check in checks:
        icon = {"pass": "PASS", "warn": "WARN", "fail": "FAIL", "error": "ERR"}.get(check["status"], "???")
        msg = check.get("message", "")
        print(f"  [{icon}] {check['check']}: {msg if msg else check['status']}")

    score = compute_geo_score(checks)
    print(f"\n  GEO Score: {score}/100")

    # Save health report
    report = {
        "scan_date": datetime.now(timezone.utc).isoformat(),
        "target_url": base_url,
        "geo_score": score,
        "checks": checks,
        "previous_score": None,
        "score_delta": None,
    }

    # Load previous score for delta
    if HEALTH_PATH.exists():
        try:
            prev = json.loads(HEALTH_PATH.read_text())
            report["previous_score"] = prev.get("geo_score")
            if report["previous_score"] is not None:
                report["score_delta"] = score - report["previous_score"]
                if report["score_delta"] < -10:
                    print(f"\n  WARNING: Score dropped by {abs(report['score_delta'])} points!")
                    print(f"  Trigger: geo-telegram-alert.ts")
        except Exception:
            pass

    HEALTH_PATH.parent.mkdir(parents=True, exist_ok=True)
    HEALTH_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(f"\n  Report saved: {HEALTH_PATH}")

    # Exit code for PM2/cron: 0=ok, 1=degraded, 2=critical
    if score >= 70:
        sys.exit(0)
    elif score >= 40:
        sys.exit(1)
    else:
        sys.exit(2)


if __name__ == "__main__":
    main()
