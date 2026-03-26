#!/usr/bin/env python3
"""
product-scraper.py — Sprint TICKET-008-PROMO-01

Uses browser_use Agent to scrape ProductData from marketplace URLs.
Supports: Amazon, Etsy, Shopify, Product Hunt.

Usage:
  source .venv-browser-use/bin/activate
  python scripts/promo/product-scraper.py --url <URL> [--headless] [--dry-run]

Output (stdout JSON — pipe-safe):
  {"ok": true, "data": <ProductData>}
  {"ok": false, "error": "<message>"}

ProductData schema:
  name, brand, price, description, bulletPoints[], images[],
  rating, reviewCount, topReviews[], category, url
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

EXTRACTION_TASK = """
Navigate to this URL: {url}

Wait for the page to fully load. Then extract the following product information as JSON:

{{
  "name": "full product name/title",
  "brand": "brand or seller name (empty string if not found)",
  "price": "price as string with currency symbol e.g. '$29.99' (empty string if not found)",
  "description": "main product description paragraph (first 500 chars max)",
  "bulletPoints": ["feature 1", "feature 2", "feature 3"],
  "images": ["https://...", "https://..."],
  "rating": "e.g. '4.5' or empty string",
  "reviewCount": "e.g. '1,234 reviews' or empty string",
  "topReviews": ["review 1 snippet", "review 2 snippet"],
  "category": "product category e.g. 'Electronics', 'Handmade Jewelry' (empty string if not found)",
  "url": "{url}"
}}

Rules:
- images[]: collect at least 3 product image URLs (main + gallery). Only https:// URLs.
- bulletPoints[]: key product features. At least 2.
- topReviews[]: first 2 visible review snippets (50 chars each max). Empty array if none.
- Do NOT include cart/navigation images, only product images.
- Output ONLY the JSON object. No markdown. No explanation. Just the JSON.
"""


async def scrape_product(url: str, headless: bool = True) -> dict:
    """Scrape ProductData from a marketplace URL using browser_use Agent."""
    try:
        from browser_use import Agent
        from browser_use.llm import ChatAnthropic
    except ImportError as e:
        return {"ok": False, "error": f"browser_use import failed: {e}"}

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"ok": False, "error": "ANTHROPIC_API_KEY not set"}

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=api_key,
        max_tokens=4096,
    )

    task = EXTRACTION_TASK.format(url=url)

    browser_config = {
        "headless": headless,
    }

    # Use Chrome Default profile if it exists (for marketplace logins/anti-bot)
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    chrome_data = os.path.expanduser("~/Library/Application Support/Google/Chrome")
    if Path(chrome_path).exists() and Path(chrome_data).exists():
        browser_config["chrome_instance_path"] = chrome_path
        browser_config["extra_chromium_args"] = [
            f"--user-data-dir={chrome_data}",
            "--profile-directory=Default",
        ]
    else:
        # Fallback: headless chromium
        browser_config["headless"] = True

    agent = Agent(
        task=task,
        llm=llm,
        browser_config=browser_config,
        max_failures=3,
        use_vision=True,
    )

    try:
        result = await agent.run()
        raw_text = str(result)

        # Extract JSON from the result
        json_start = raw_text.find("{")
        json_end = raw_text.rfind("}") + 1
        if json_start == -1 or json_end == 0:
            return {"ok": False, "error": f"No JSON in result: {raw_text[:200]}"}

        json_str = raw_text[json_start:json_end]
        data = json.loads(json_str)

        # Normalise fields
        if "url" not in data or not data["url"]:
            data["url"] = url
        if "images" not in data:
            data["images"] = []
        if "bulletPoints" not in data:
            data["bulletPoints"] = []
        if "topReviews" not in data:
            data["topReviews"] = []

        return {"ok": True, "data": data}

    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"JSON parse failed: {e} — raw: {raw_text[:300]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Scrape ProductData from marketplace URL")
    parser.add_argument("--url", required=True, help="Marketplace URL to scrape")
    parser.add_argument("--headless", action="store_true", default=False,
                        help="Run browser in headless mode (default: visible)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Skip actual scraping, return mock data for testing")
    args = parser.parse_args()

    if args.dry_run:
        mock = {
            "ok": True,
            "data": {
                "name": "Test Product (dry-run)",
                "brand": "TestBrand",
                "price": "$9.99",
                "description": "This is a dry-run mock product.",
                "bulletPoints": ["Feature A", "Feature B", "Feature C"],
                "images": [
                    "https://example.com/img1.jpg",
                    "https://example.com/img2.jpg",
                    "https://example.com/img3.jpg",
                ],
                "rating": "4.5",
                "reviewCount": "123 reviews",
                "topReviews": ["Great product!", "Works as expected."],
                "category": "Test",
                "url": args.url,
            },
        }
        print(json.dumps(mock))
        return

    result = asyncio.run(scrape_product(args.url, headless=args.headless))
    print(json.dumps(result))


if __name__ == "__main__":
    main()
