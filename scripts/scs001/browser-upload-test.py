#!/usr/bin/env python3
"""
browser-upload-test.py — Sprint 784 (BROWSER-01)

Test TikTok video upload via Browser Use + Chrome Default profile.
This uses the operator's existing Chrome login session (no API tokens needed).

Prerequisites:
  1. Run: bash scripts/scs001/install-browser-use.sh
  2. Be logged into TikTok in Chrome Default profile
  3. Warmup must be complete (/warmup-complete)

Usage:
  source .venv-browser-use/bin/activate
  python scripts/scs001/browser-upload-test.py [--dry-run] [--video PATH]

Dry-run mode (default): navigates to TikTok upload page but does NOT post.
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Ensure we can find the warmup status
ROOT = Path(__file__).resolve().parent.parent.parent
WARMUP_STATUS = ROOT / "workspace" / "scs001" / "warmup-status.json"
LOG_PATH = ROOT / "logs" / "browser-upload-test.jsonl"
TEST_VIDEO = ROOT / "workspace" / "scs001" / "manual-post-queue" / "test-upload.mp4"


def check_warmup() -> bool:
    """Check if warmup is verified before allowing upload."""
    if not WARMUP_STATUS.exists():
        print("❌ Warmup not started. Run /warmup-start in Telegram first.")
        return False
    status = json.loads(WARMUP_STATUS.read_text())
    if not status.get("verified"):
        print("❌ Warmup not verified. Complete 3 days of scrolling + run /warmup-complete.")
        return False
    print(f"✅ Warmup verified ({status.get('verified_at', 'unknown')[:10]})")
    return True


def log_event(event: dict):
    """Append event to JSONL log."""
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps({**event, "timestamp": datetime.utcnow().isoformat()}) + "\n")


async def test_tiktok_upload(video_path: str, dry_run: bool = True):
    """Navigate to TikTok upload page using Chrome Default profile."""
    try:
        from browser_use import Agent
        from langchain_openai import ChatOpenAI
    except ImportError:
        print("❌ browser-use not installed. Run: bash scripts/scs001/install-browser-use.sh")
        sys.exit(1)

    # Use Chrome Default profile (operator's logged-in session)
    chrome_profile = os.path.expanduser("~/Library/Application Support/Google/Chrome/Default")
    if not Path(chrome_profile).exists():
        print(f"❌ Chrome Default profile not found at: {chrome_profile}")
        sys.exit(1)
    print(f"✅ Chrome profile: {chrome_profile}")

    if dry_run:
        task = (
            "Navigate to https://www.tiktok.com/upload "
            "and verify the upload page loads correctly. "
            "Take a screenshot of the page. "
            "DO NOT upload any file or click any upload buttons. "
            "Report what you see on the page."
        )
    else:
        task = (
            f"Navigate to https://www.tiktok.com/upload. "
            f"Upload the video file at: {video_path}. "
            f"Add the caption: 'Test upload — will delete'. "
            f"DO NOT click the Post button. Just prepare the upload and take a screenshot."
        )

    print(f"\n{'🧪 DRY RUN' if dry_run else '🚀 LIVE TEST'}: {task[:80]}...")

    # Use OpenAI as the LLM for browser-use (cheapest option)
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    agent = Agent(
        task=task,
        llm=llm,
        browser_config={
            "headless": False,  # Need visible browser for Chrome profile
            "chrome_instance_path": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "extra_chromium_args": [
                f"--user-data-dir={os.path.expanduser('~/Library/Application Support/Google/Chrome')}",
                "--profile-directory=Default",
            ],
        },
    )

    result = await agent.run()

    log_event({
        "event": "browser_upload_test",
        "dry_run": dry_run,
        "video_path": video_path,
        "result": str(result)[:500],
        "success": True,
    })

    print(f"\n✅ Test complete. Result:\n{result}")
    return result


def main():
    parser = argparse.ArgumentParser(description="Test TikTok upload via Browser Use")
    parser.add_argument("--dry-run", action="store_true", default=True,
                        help="Navigate to upload page without uploading (default)")
    parser.add_argument("--live", action="store_true",
                        help="Prepare an actual upload (won't click Post)")
    parser.add_argument("--video", type=str, default=str(TEST_VIDEO),
                        help="Path to video file for upload test")
    parser.add_argument("--skip-warmup", action="store_true",
                        help="Skip warmup check (testing only)")
    args = parser.parse_args()

    dry_run = not args.live

    print("══════════════════════════════════════════════════════")
    print("  BROWSER USE — TIKTOK UPLOAD TEST")
    print("══════════════════════════════════════════════════════\n")

    # Check warmup gate
    if not args.skip_warmup and not check_warmup():
        sys.exit(1)

    # Check video exists (for live mode)
    if not dry_run and not Path(args.video).exists():
        print(f"❌ Video not found: {args.video}")
        print("Provide a video with: --video /path/to/video.mp4")
        sys.exit(1)

    # Check OpenAI API key (browser-use uses it for the agent)
    if not os.environ.get("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not set. Browser Use needs it for the agent LLM.")
        sys.exit(1)
    print("✅ OPENAI_API_KEY set")

    asyncio.run(test_tiktok_upload(args.video, dry_run))


if __name__ == "__main__":
    main()
