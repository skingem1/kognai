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
  python scripts/scs001/browser-upload-test.py --live --video PATH --caption "..." [--post]

Modes:
  (default/--dry-run): navigates to upload page, does NOT upload or post
  --live:  uploads video + prepares caption, does NOT click Post
  --post:  uploads video + sets caption + clicks Post (full automation, implies --live)
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


async def test_tiktok_upload(video_path: str, dry_run: bool = True, caption: str = "", post_mode: bool = False):
    """Navigate to TikTok upload page using Chrome Default profile."""
    try:
        from browser_use import Agent
        from browser_use.browser.profile import BrowserProfile
        from browser_use.llm import ChatOpenAI
    except ImportError:
        print("❌ browser-use not installed. Run: bash scripts/scs001/install-browser-use.sh")
        sys.exit(1)

    # Use Chrome Default profile (operator's logged-in session)
    chrome_user_data = os.path.expanduser("~/Library/Application Support/Google/Chrome")
    chrome_profile = os.path.join(chrome_user_data, "Default")
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
        post_caption = caption if caption else "AI content 🤖 #ai #tech"
        # Split caption into title text and hashtags for TikTok's DraftEditor
        import re
        hashtag_matches = re.findall(r'#\w+', post_caption)
        title_text = re.sub(r'#\w+', '', post_caption).strip()

        if post_mode:
            # Full automation: agent clicks Post
            final_instruction = (
                f"After all hashtags are added, scroll down to find the Post button. "
                f"Click the Post button to publish the video. "
                f"Wait for the confirmation that the post was submitted successfully "
                f"(the page should redirect or show a success message). "
                f"Take a final screenshot confirming the post was published."
            )
        else:
            # Prepare-only mode
            final_instruction = (
                f"After all hashtags are added, take a screenshot of the caption field showing the full caption. "
                f"DO NOT click the Post button under any circumstances. Just prepare the upload."
            )

        task = (
            f"Navigate to https://www.tiktok.com/upload. "
            f"Upload the video file at: {video_path}. "
            f"Wait for the video to finish uploading (the upload progress should reach 100%). "
            f"Once the upload is complete and the caption editor is visible, click on the caption text input field. "
            f"Type ONLY this title text first (no hashtags yet): '{title_text}'. "
            f"Wait 1 second after typing the title. "
            f"Then add each hashtag ONE AT A TIME: "
            f"For each hashtag in [{', '.join(hashtag_matches)}], type it (e.g. '#ai'), "
            f"wait for the hashtag suggestion dropdown to appear, "
            f"then click the FIRST suggestion in the dropdown list that matches the hashtag you just typed. "
            f"Wait 1 second between each hashtag. "
            f"{final_instruction}"
        )

    mode_label = "🧪 DRY RUN" if dry_run else ("📤 LIVE POST" if post_mode else "🚀 LIVE PREPARE")
    print(f"\n{mode_label}: {task[:100]}...")

    # Use browser_use's native ChatOpenAI (wraps AsyncOpenAI directly, handles output_format)
    llm = ChatOpenAI(model="gpt-4o", temperature=0)

    # BrowserProfile with Chrome Default (logged-in TikTok session)
    browser_profile = BrowserProfile(
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        user_data_dir=chrome_user_data,
        profile_directory="Default",
        headless=False,
        disable_security=False,
    )

    agent = Agent(
        task=task,
        llm=llm,
        browser_profile=browser_profile,
        available_file_paths=[video_path] if not dry_run else [],
    )

    result = await agent.run()

    log_event({
        "event": "browser_upload_test",
        "dry_run": dry_run,
        "post_mode": post_mode,
        "video_path": video_path,
        "caption": caption,
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
    parser.add_argument("--post", action="store_true",
                        help="Upload AND click Post to publish (full automation). Requires --live.")
    parser.add_argument("--video", type=str, default=str(TEST_VIDEO),
                        help="Path to video file for upload test")
    parser.add_argument("--caption", type=str, default="",
                        help="Caption to add to the TikTok post")
    parser.add_argument("--skip-warmup", action="store_true",
                        help="Skip warmup check (testing only)")
    args = parser.parse_args()

    # --post implies --live
    if args.post:
        args.live = True

    dry_run = not args.live
    post_mode = args.post

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

    asyncio.run(test_tiktok_upload(args.video, dry_run, args.caption, post_mode))


if __name__ == "__main__":
    main()
