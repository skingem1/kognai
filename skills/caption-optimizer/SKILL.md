---
name: caption-optimizer
version: 1.0.0
description: Caption and hashtag optimization for social media posts. Optimizes caption length, emoji usage, hashtag selection, and CTA placement for maximum engagement per platform.
---

# Caption Optimizer

Optimizes captions and hashtags for TikTok, YouTube Shorts, and Instagram Reels.

## Capabilities
- Platform-specific formatting (TikTok vs YouTube vs Instagram)
- Hashtag strategy: mix of broad + niche + trending
- CTA optimization: where to place follow/like prompts
- Emoji density tuning per platform norms
- A/B variant generation for testing

## Usage
```bash
npx tsx skills/caption-optimizer/optimize.ts --text "your caption" --platform tiktok
npx tsx skills/caption-optimizer/optimize.ts --text "your caption" --variants 3
```

## Integration
Takes script-generator output and optimizes for posting platform. Feeds into publishing workflow.
