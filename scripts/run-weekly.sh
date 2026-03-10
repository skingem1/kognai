#!/usr/bin/env bash
# run-weekly.sh — Kognai Weekly Intelligence + Sprint Planning Cycle
#
# Runs every Monday morning (or on demand):
#   Phase 1: CMO browses X + internet, produces 3 reports (~15–30 min)
#   Phase 2: CEO reads reports, decides priorities, drafts next sprint
#
# Usage:
#   ./scripts/run-weekly.sh [--sprint NNN] [--focus "text"] [--skip-cmo]
#
# Cron (Mondays 07:00):
#   0 7 * * 1 cd /Users/tarekmnif/kognai && ./scripts/run-weekly.sh >> logs/weekly/$(date +\%Y-\%m-\%d).log 2>&1
#
# Output:
#   reports/cmo/market-watch.md
#   reports/cmo/opportunity-watch.md
#   reports/cmo/strategy.md
#   reports/ceo/weekly-decision-YYYY-MM-DD.md
#   workspace/sprints/draft-sprint-NNN.json   ← review before running swarm

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KOGNAI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$KOGNAI_ROOT/.env"
LOG_DIR="$KOGNAI_ROOT/logs/weekly"

# ── Load env ──────────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  .env not found at $ENV_FILE" >&2
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

# ── Validate keys ─────────────────────────────────────────────────────────────
if [[ -z "${MANUS_API_KEY:-}" ]]; then
  echo "❌  MANUS_API_KEY not set — CMO cannot browse the web" >&2
  exit 1
fi
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "❌  ANTHROPIC_API_KEY not set — CEO cannot plan sprint" >&2
  exit 1
fi

# ── Parse args ────────────────────────────────────────────────────────────────
SPRINT_ARG=""
FOCUS_ARG=""
SKIP_CMO=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sprint) SPRINT_ARG="--sprint $2"; shift 2 ;;
    --focus)  FOCUS_ARG="--focus $2";  shift 2 ;;
    --skip-cmo) SKIP_CMO=true; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$KOGNAI_ROOT/reports/cmo" "$KOGNAI_ROOT/reports/ceo"
DATE=$(date +%Y-%m-%d)
START_TIME=$(date +%s)

cd "$KOGNAI_ROOT"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         KOGNAI WEEKLY INTELLIGENCE CYCLE — $DATE        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Phase 1: CMO (Manus web browsing) ────────────────────────────────────────
if [[ "$SKIP_CMO" == "true" ]]; then
  echo "⏭   Skipping CMO phase (--skip-cmo flag set)"
  echo "    Using existing reports from reports/cmo/"
else
  echo "📊  PHASE 1: CMO Intelligence Gathering (Manus AI)"
  echo "    Manus will browse X, HackerNews, GitHub, ProductHunt..."
  echo "    This takes 15–30 minutes. Go get a coffee. ☕"
  echo ""

  CMO_START=$(date +%s)
  # shellcheck disable=SC2086
  npx ts-node scripts/run-cmo.ts $SPRINT_ARG $FOCUS_ARG
  CMO_END=$(date +%s)
  CMO_MINS=$(( (CMO_END - CMO_START) / 60 ))

  echo ""
  echo "✅  CMO phase complete (${CMO_MINS}m)"
fi

echo ""

# ── Phase 2: CEO (Claude sprint planning) ────────────────────────────────────
echo "🤵  PHASE 2: CEO Sprint Planning (Harvey / Claude Sonnet)"
echo "    Reading CMO reports + planning next sprint..."
echo ""

CEO_START=$(date +%s)
# shellcheck disable=SC2086
npx ts-node scripts/run-ceo-weekly.ts $SPRINT_ARG
CEO_END=$(date +%s)
CEO_SECS=$(( CEO_END - CEO_START ))

echo ""
echo "✅  CEO phase complete (${CEO_SECS}s)"

# ── Summary ───────────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
TOTAL_MINS=$(( (END_TIME - START_TIME) / 60 ))

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                  WEEKLY CYCLE COMPLETE                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Total time:  ${TOTAL_MINS} minutes"
echo "  Reports:     reports/cmo/{market-watch,opportunity-watch,strategy}.md"
echo "  Decision:    reports/ceo/weekly-decision-${DATE}.md"
echo "  Draft sprint: workspace/sprints/draft-sprint-NNN.json"
echo ""
echo "  ─── NEXT STEPS ───────────────────────────────────────────"
echo "  1. Review: cat reports/ceo/weekly-decision-${DATE}.md"
echo "  2. Review: cat workspace/sprints/draft-sprint-NNN.json"
echo "  3. Edit the draft sprint as needed"
echo "  4. Approve: mv workspace/sprints/draft-sprint-NNN.json workspace/sprints/sprint-NNN.json"
echo "  5. Run:     ./scripts/run-swarm.sh workspace/sprints/sprint-NNN.json"
echo ""
