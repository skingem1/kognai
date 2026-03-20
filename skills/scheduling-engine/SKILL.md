---
name: scheduling-engine
version: 1.0.0
description: Content scheduling and optimal posting time calculation for SCS-001. Manages content calendar, posting frequency, and platform-specific timing optimization.
---

# Scheduling Engine

Manages content scheduling and optimal posting times.

## Capabilities
- Best-time-to-post calculation per platform
- Content calendar with 7-day lookahead
- Posting frequency management (avoid flooding)
- Niche rotation scheduling (no niche >30% in 10-post window)
- PM2 cron integration for automated triggers

## Usage
```bash
npx tsx skills/scheduling-engine/schedule.ts --next 7
npx tsx skills/scheduling-engine/schedule.ts --best-time tiktok
npx tsx skills/scheduling-engine/schedule.ts --calendar
```

## Integration
Called by pipeline orchestrator to determine when and what to produce next. Respects niche rotation rules from Sprint 478 diversity scoring.
