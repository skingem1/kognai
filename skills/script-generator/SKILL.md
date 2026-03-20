---
name: script-generator
version: 1.0.0
description: AI-powered script generation for short-form videos. Takes trending topic + hook formula and produces viral-optimized scripts with timestamps, voiceover cues, and caption text.
---

# Script Generator

Generates viral-optimized scripts for TikTok/YouTube Shorts.

## Capabilities
- Hook-first scripting: opens with proven hook formula
- Multi-format: split-screen, reaction, greenscreen templates
- Timestamp markers for voiceover sync
- Caption-ready text blocks
- Citability scoring (134-167 word blocks for GEO)

## Usage
```bash
npx tsx skills/script-generator/generate.ts --topic "AI productivity tips" --hook "did-you-know" --template "reaction"
npx tsx skills/script-generator/generate.ts --topic "fitness hack" --length 30
```

## Integration
Wraps SCS-001 script agent. Takes output from trend-analyzer, produces input for caption-optimizer and video production pipeline.
