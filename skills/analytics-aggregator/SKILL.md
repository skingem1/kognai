---
name: analytics-aggregator
version: 1.0.0
description: Post-performance analytics aggregation for SCS-001. Collects views, likes, comments across platforms. Feeds performance data back into topic selection and A/B test analysis.
---

# Analytics Aggregator

Aggregates post performance metrics across platforms.

## Capabilities
- Collect views, likes, comments, shares per post
- Cross-platform aggregation (TikTok + YouTube + Instagram)
- Performance trends: best performing niches, hooks, templates
- Feed data into A/B test framework (Sprint 469)
- Weekly digest generation for operator

## Usage
```bash
npx tsx skills/analytics-aggregator/aggregate.ts
npx tsx skills/analytics-aggregator/aggregate.ts --period 7d
npx tsx skills/analytics-aggregator/aggregate.ts --best-niche
```

## Integration
Reads from workspace/analytics/post-metrics.json and workspace/ab-tests/assignments.jsonl. Produces aggregated reports that feed back into trend-analyzer and scheduling-engine.
