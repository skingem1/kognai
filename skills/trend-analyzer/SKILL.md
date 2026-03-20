---
name: trend-analyzer
version: 1.0.0
description: Trending topic discovery and ranking for SCS-001 content pipeline. Scans Internet Archive, competitor feeds, and niche databases to find viral-potential topics.
---

# Trend Analyzer

Discovers and ranks trending topics for short-form video content.

## Capabilities
- Scan Internet Archive for trending clips by niche
- Score topics by virality potential (search volume, competition, recency)
- Niche rotation: avoid repeating same niche within 24h (diversity score)
- Competitor analysis: extract trending topics from top accounts
- Output: ranked topic list with scores, niches, and suggested hooks

## Usage
```bash
npx tsx skills/trend-analyzer/analyze.ts --niches "fitness,tech,finance" --count 10
npx tsx skills/trend-analyzer/analyze.ts --competitor "@topaccount" --count 5
```

## Integration
Wraps SCS-001 discovery agent logic. Called by pipeline orchestrator at start of each run. Results feed into script-generator skill.
