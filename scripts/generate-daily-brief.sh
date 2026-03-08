#!/bin/bash
# Kognai Daily Brief Generator — wrapper script
# Called by launchd at 06:55 every weekday
# Generates docs/daily-brief.md, docs/strategic-context.md, docs/gate-tracker.md

cd /Users/tarekmnif/kognai
/usr/bin/python3 scripts/generate-daily-brief.py

# Log success
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Daily brief generated" >> /Users/tarekmnif/kognai/logs/daily-brief.log
