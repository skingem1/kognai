#!/usr/bin/env python3
"""
post-tiktok.py — Sprint 785 (BROWSER-01)

Production TikTok upload via Browser Use + Chrome Default profile.
Full flow: navigate → upload video → fill caption → screenshot proof → optionally post.

Usage:
  python scripts/scs001/post-tiktok.py --video /path/to/video.mp4 --caption "AI news #ai" [--post] [--screenshot-dir DIR]

Modes:
  Default (no --post): Prepares upload, takes screenshot, does NOT click Post.
  With --post: Actually publishes to TikTok. Operator reviews screenshot first.

Prerequisites:
  1. Run: bash scripts/scs001/install-browser-use.sh
  2. Logged into TikTok in Chrome Default profile
  3. Warmup complete (/warmup-complete)
  4. OPENAI_API_KEY set (browser-use agent LLM)
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
WARMUP_STATUS = ROOT / "workspace" / "scs001" / "warmup-status.json"
SCREENSHOT_DIR = ROOT / "workspace" / "scs001" / "post-screenshots"
LOG_PATH = ROOT / "logs" / "browser-post.jsonl"
MANUAL_POSTS = ROOT / "workspace" / "scs001" / "manual-posts.jsonl"


def check_prerequisites(skip_warmup: bool = False) -> bool:
    """Validate all prerequisites before upload."""
    ok = True

    # Warmup check
    if not skip_warmup:
        if not WARMUP_STATUS.exists():
            print("❌ Warmup not started. Run /warmup-start in Telegram.")
            return False
        status = json.loads(WARMUP_STATUS.read_text())
        if not status.get("verified"):
            print("❌ Warmup not verified. Run /warmup-complete after 3 days.")
            return False
        print(f"✅ Warmup verified ({status.get('verified_at', '?')[:10]})")

    # OpenAI key
    if not os.environ.get("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not set")
        ok = False
    else:
        print("✅ OPENAI_API_KEY set")

    # Chrome profile
    chrome_profile = Path.home() / "Library/Application Support/Google/Chrome/Default"
    if not chrome_profile.exists():
        print(f"❌ Chrome Default profile not found")
        ok = False
    else:
        print("✅ Chrome profile found")

    return ok


def log_event(event: dict):
    """Append to JSONL log."""
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps({**event, "timestamp": datetime.utcnow().isoformat()}) + "\n")


def log_manual_post(video_id: str, method: str = "browser-use"):
    """Record post in manual-posts.jsonl for gate tracking."""
    MANUAL_POSTS.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "video_id": video_id,
        "posted_at": datetime.utcnow().isoformat(),
        "views": 0,
        "method": method,
        "platforms": ["tiktok"],
    }
    with open(MANUAL_POSTS, "a") as f:
        f.write(json.dumps(entry) + "\n")


async def upload_to_tiktok(
    video_path: str,
    caption: str,
    do_post: bool = False,
    screenshot_dir: str = str(SCREENSHOT_DIR),
) -> dict:
    """Execute the TikTok upload flow via Browser Use."""
    try:
        from browser_use import Agent
        from langchain_openai import ChatOpenAI
    except ImportError:
        print("❌ browser-use not installed. Run: bash scripts/scs001/install-browser-use.sh")
        sys.exit(1)

    # Create screenshot directory
    ss_dir = Path(screenshot_dir)
    ss_dir.mkdir(parents=True, exist_ok=True)

    video_name = Path(video_path).stem
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    screenshot_path = ss_dir / f"post-{video_name}-{ts}.png"

    if do_post:
        task = f"""
Navigate to https://www.tiktok.com/upload.
Wait for the page to fully load.
Upload the video file located at: {video_path}
Wait for the video to finish uploading and processing.
In the caption/description field, type this caption: {caption}
Take a screenshot and save it.
Click the "Post" button to publish the video.
Wait for confirmation that the video was posted.
Take a final screenshot showing the post was successful.
Report the result: success or failure, and any error messages.
"""
    else:
        task = f"""
Navigate to https://www.tiktok.com/upload.
Wait for the page to fully load.
Upload the video file located at: {video_path}
Wait for the video to finish uploading and processing.
In the caption/description field, type this caption: {caption}
Take a screenshot showing the prepared upload with caption filled in.
DO NOT click the Post button.
Report what you see on the page.
"""

    print(f"\n{'🚀 POSTING' if do_post else '🧪 PREPARE ONLY'}")
    print(f"Task: {task[:120]}...")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    chrome_data_dir = os.path.expanduser("~/Library/Application Support/Google/Chrome")

    agent = Agent(
        task=task,
        llm=llm,
        browser_config={
            "headless": False,
            "chrome_instance_path": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "extra_chromium_args": [
                f"--user-data-dir={chrome_data_dir}",
                "--profile-directory=Default",
            ],
        },
    )

    result = await agent.run()

    result_dict = {
        "video_path": video_path,
        "caption": caption,
        "posted": do_post,
        "screenshot": str(screenshot_path),
        "result": str(result)[:1000],
        "success": "error" not in str(result).lower(),
    }

    log_event({"event": "tiktok_upload", **result_dict})

    return result_dict


def main():
    parser = argparse.ArgumentParser(description="Post video to TikTok via Browser Use")
    parser.add_argument("--video", required=True, help="Path to MP4 video file")
    parser.add_argument("--caption", default="", help="TikTok caption text")
    parser.add_argument("--post", action="store_true", help="Actually click Post (default: prepare only)")
    parser.add_argument("--screenshot-dir", default=str(SCREENSHOT_DIR), help="Directory for proof screenshots")
    parser.add_argument("--skip-warmup", action="store_true", help="Skip warmup check (dev only)")
    parser.add_argument("--video-id", default="", help="Video ID for gate tracking (auto-detected from filename if omitted)")
    args = parser.parse_args()

    print("══════════════════════════════════════════════════════")
    print("  TIKTOK BROWSER UPLOAD — Sprint 785")
    print("══════════════════════════════════════════════════════\n")

    # Validate
    if not Path(args.video).exists():
        print(f"❌ Video not found: {args.video}")
        sys.exit(1)
    print(f"✅ Video: {args.video}")

    if not check_prerequisites(args.skip_warmup):
        sys.exit(1)

    # Run upload
    result = asyncio.run(upload_to_tiktok(
        args.video, args.caption, args.post, args.screenshot_dir
    ))

    # If posted, record for gate tracking
    if args.post and result.get("success"):
        video_id = args.video_id or Path(args.video).stem
        log_manual_post(video_id)
        print(f"\n✅ Post recorded: {video_id}")
        print("Gate tracker updated (manual-posts.jsonl)")

    print(f"\n{'✅ POSTED' if args.post and result.get('success') else '📋 PREPARED (not posted)'}")
    if result.get("screenshot"):
        print(f"Screenshot: {result['screenshot']}")


if __name__ == "__main__":
    main()
