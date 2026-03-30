#!/usr/bin/env python3
"""
analytics-browser-scrape.py — SCS-001 Analytics Scraper
Sprint BUGFIX-ANALYTICS-01

Uses Browser Use + Chrome Default profile to read TikTok Creator Center analytics.
Extracts per-video KPIs: views, likes, comments, shares, avg watch time, completion rate.
Output: logs/post-metrics.jsonl (append — one JSON per video per scrape run)

Usage:
  source .venv-browser-use/bin/activate
  python scripts/scs001/analytics-browser-scrape.py [--days 7|28|60]
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LOG_PATH = ROOT / "logs" / "post-metrics.jsonl"
MANUAL_POSTS = ROOT / "workspace" / "scs001" / "manual-posts.jsonl"


def load_known_videos() -> list[dict]:
    """Load manually-recorded TikTok posts (have tiktok_url with real TikTok IDs)."""
    if not MANUAL_POSTS.exists():
        return []
    videos = []
    for line in MANUAL_POSTS.read_text().splitlines():
        try:
            entry = json.loads(line)
            if entry.get("tiktok_url"):
                m = re.search(r"/video/(\d+)", entry["tiktok_url"])
                if m:
                    entry["tiktok_id"] = m.group(1)
                    videos.append(entry)
        except Exception:
            pass
    return videos


async def scrape_analytics(days: int = 7):
    """Navigate Creator Center → extract per-video KPIs."""
    try:
        from browser_use import Agent
        from browser_use.browser.profile import BrowserProfile
        from browser_use.llm import ChatOpenAI
    except ImportError:
        print("❌ browser-use not installed. Run: bash scripts/scs001/install-browser-use.sh")
        sys.exit(1)

    chrome_user_data = os.path.expanduser("~/Library/Application Support/Google/Chrome")
    if not Path(chrome_user_data).exists():
        print(f"❌ Chrome profile not found at: {chrome_user_data}")
        sys.exit(1)

    known = load_known_videos()
    print(f"📊 Known TikTok videos with URLs: {len(known)}")

    # Task: scrape the Creator Center content analytics page
    task = (
        f"Navigate to https://www.tiktok.com/creator-center/analytics/content "
        f"(the Content tab in TikTok Creator Center analytics). "
        f"Wait for the page to fully load and the video list to appear. "
        f"If there is a date range selector, make sure it covers the last {days} days. "
        f"For each video shown in the list (up to 20 videos), extract: "
        f"1. The video title or caption text (first 80 characters) "
        f"2. The publish date (e.g. 'Mar 28' or '2026-03-28') "
        f"3. Video views count (shown as a number, e.g. 316 or 1.2K — convert K/M to full numbers) "
        f"4. Likes count "
        f"5. Comments count "
        f"6. Shares count "
        f"Try to click on 1-2 of the most recent videos to get detailed analytics (if a detail panel opens): "
        f"7. Average watch time in seconds "
        f"8. Completion rate as a percentage "
        f"If detailed analytics are not accessible, use 0 for avg_watch_time and completion_rate. "
        f"Return ONLY a valid JSON array (no markdown, no other text) with objects having keys: "
        f"title (string), publish_date (string), views (number), likes (number), "
        f"comments (number), shares (number), avg_watch_time_seconds (number), completion_rate (number). "
        f"Example: "
        f'[{{"title":"AI takes over...","publish_date":"Mar 28","views":316,"likes":45,"comments":8,"shares":3,"avg_watch_time_seconds":0,"completion_rate":0}}]'
    )

    print(f"\n🔍 Scraping TikTok Creator Center (last {days} days)...")

    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    browser_profile = BrowserProfile(
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        user_data_dir=chrome_user_data,
        profile_directory="Default",
        headless=False,
        disable_security=False,
    )

    agent = Agent(task=task, llm=llm, browser_profile=browser_profile)
    result = await agent.run()

    result_str = str(result)

    # Extract JSON array from result
    json_match = re.search(r'\[[\s\S]*\]', result_str)
    if not json_match:
        print(f"❌ No JSON array in result:\n{result_str[:400]}")
        sys.exit(1)

    try:
        posts = json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        print(f"❌ JSON parse error: {e}\nRaw: {json_match.group(0)[:300]}")
        sys.exit(1)

    if not isinstance(posts, list):
        print(f"❌ Expected list, got {type(posts)}")
        sys.exit(1)

    scraped_at = datetime.utcnow().isoformat()
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Try to match scraped videos to known TikTok IDs by title similarity
    def parse_views(v) -> int:
        if isinstance(v, (int, float)):
            return int(v)
        s = str(v).replace(",", "").strip()
        if s.endswith("K") or s.endswith("k"):
            return int(float(s[:-1]) * 1000)
        if s.endswith("M") or s.endswith("m"):
            return int(float(s[:-1]) * 1_000_000)
        try:
            return int(float(s))
        except Exception:
            return 0

    count = 0
    with open(LOG_PATH, "a") as f:
        for post in posts:
            views = parse_views(post.get("views", 0))
            likes = parse_views(post.get("likes", 0))
            comments = parse_views(post.get("comments", 0))
            shares = parse_views(post.get("shares", 0))

            # Try to find tiktok_id + kognai video_id by title match
            tiktok_id = None
            kognai_video_id = None
            post_title = (post.get("title") or "").lower().strip()
            if post_title:
                for kv in known:
                    kv_title = (kv.get("title") or "").lower().strip()
                    if kv_title and len(post_title) > 10 and post_title[:20] in kv_title:
                        tiktok_id = kv.get("tiktok_id")
                        kognai_video_id = kv.get("video_id")
                        break

            entry = {
                "scraped_at": scraped_at,
                "days_range": days,
                "title": post.get("title", "")[:120],
                "publish_date": str(post.get("publish_date", "")),
                "views": views,
                "likes": likes,
                "comments": comments,
                "shares": shares,
                "avg_watch_time_seconds": float(post.get("avg_watch_time_seconds", 0) or 0),
                "completion_rate": float(post.get("completion_rate", 0) or 0),
                "tiktok_id": tiktok_id,
                "kognai_video_id": kognai_video_id,
            }
            f.write(json.dumps(entry) + "\n")
            count += 1

    print(f"\n✅ Scraped {count} videos → {LOG_PATH}")
    for p in posts[:5]:
        v = parse_views(p.get("views", 0))
        print(f"  • {p.get('publish_date','')} | {v:,} views | {p.get('title','')[:50]}")


def main():
    parser = argparse.ArgumentParser(description="Scrape TikTok Creator Center analytics")
    parser.add_argument("--days", type=int, default=7, choices=[7, 28, 60],
                        help="Analytics date range in days (default: 7)")
    args = parser.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not set. Browser Use needs it for the agent LLM.")
        sys.exit(1)
    print("✅ OPENAI_API_KEY set")

    asyncio.run(scrape_analytics(args.days))


if __name__ == "__main__":
    main()
