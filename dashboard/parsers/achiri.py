"""Parse Achiri usage stats from workspace/achiri/ files."""

import json
from datetime import date
from pathlib import Path
from typing import Any


def parse_achiri_stats(base_dir: Path) -> dict[str, Any]:
    """Return today's Achiri message/user counts and total waitlist size."""
    today = date.today().isoformat()

    # ── daily-counts.json ──────────────────────────────────────────────────────
    counts_path = base_dir / 'workspace' / 'achiri' / 'daily-counts.json'
    today_messages = 0
    today_users = 0

    if counts_path.exists():
        try:
            raw = json.loads(counts_path.read_text())
            day_data = raw.get(today, {})
            today_messages = sum(day_data.values())
            today_users = len(day_data)
        except (json.JSONDecodeError, AttributeError):
            pass

    # ── waitlist.jsonl ─────────────────────────────────────────────────────────
    waitlist_path = base_dir / 'workspace' / 'achiri' / 'waitlist.jsonl'
    total_waitlist = 0

    if waitlist_path.exists():
        try:
            lines = [l.strip() for l in waitlist_path.read_text().splitlines() if l.strip()]
            total_waitlist = sum(1 for l in lines if l)
        except OSError:
            pass

    return {
        'today_messages': today_messages,
        'today_users': today_users,
        'total_waitlist': total_waitlist,
        'today_date': today,
    }
