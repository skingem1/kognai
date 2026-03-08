#!/bin/bash
# sync-shared-context.sh — Verify shared context files are in sync
# Run this when you change shared infrastructure to check both projects pick it up.

SHARED_INFRA="$HOME/kognai/docs/shared-infra.md"
KOGNAI_CLAUDE="$HOME/kognai/CLAUDE.md"
INVOICA_CLAUDE="$HOME/Documents/Invoica/CLAUDE.md"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════"
echo "  SHARED CONTEXT SYNC CHECK"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════════"
echo ""

# Check shared-infra.md exists
if [ -f "$SHARED_INFRA" ]; then
    SHARED_DATE=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$SHARED_INFRA")
    echo -e "${GREEN}✓${NC} shared-infra.md exists (last modified: $SHARED_DATE)"
else
    echo -e "${RED}✗${NC} shared-infra.md MISSING at $SHARED_INFRA"
    exit 1
fi

echo ""

# Check Kognai CLAUDE.md references shared-infra
if [ -f "$KOGNAI_CLAUDE" ]; then
    if grep -q "shared-infra.md" "$KOGNAI_CLAUDE"; then
        echo -e "${GREEN}✓${NC} Kognai CLAUDE.md references shared-infra.md"
    else
        echo -e "${RED}✗${NC} Kognai CLAUDE.md does NOT reference shared-infra.md"
    fi
else
    echo -e "${RED}✗${NC} Kognai CLAUDE.md MISSING"
fi

# Check Invoica CLAUDE.md references shared-infra
if [ -f "$INVOICA_CLAUDE" ]; then
    if grep -q "shared-infra.md" "$INVOICA_CLAUDE"; then
        echo -e "${GREEN}✓${NC} Invoica CLAUDE.md references shared-infra.md"
    else
        echo -e "${RED}✗${NC} Invoica CLAUDE.md does NOT reference shared-infra.md"
    fi
else
    echo -e "${RED}✗${NC} Invoica CLAUDE.md MISSING at $INVOICA_CLAUDE"
fi

echo ""

# Check update dates
echo "Last modified dates:"
echo "  shared-infra.md : $(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$SHARED_INFRA" 2>/dev/null || echo 'N/A')"
echo "  Kognai CLAUDE.md: $(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$KOGNAI_CLAUDE" 2>/dev/null || echo 'N/A')"
echo "  Invoica CLAUDE.md: $(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$INVOICA_CLAUDE" 2>/dev/null || echo 'N/A')"

echo ""

# Check for key shared items in shared-infra.md
echo "Key shared items in shared-infra.md:"
for item in "Hetzner" "Supabase" "PM2" "x402" "Tailscale" "Mac Mini" "model routing" "Summer Yu"; do
    if grep -qi "$item" "$SHARED_INFRA"; then
        echo -e "  ${GREEN}✓${NC} $item"
    else
        echo -e "  ${YELLOW}?${NC} $item not found"
    fi
done

echo ""

# Summary
ISSUES=0
if [ ! -f "$SHARED_INFRA" ]; then ((ISSUES++)); fi
if [ ! -f "$KOGNAI_CLAUDE" ]; then ((ISSUES++)); fi
if [ ! -f "$INVOICA_CLAUDE" ]; then ((ISSUES++)); fi
if [ -f "$KOGNAI_CLAUDE" ] && ! grep -q "shared-infra.md" "$KOGNAI_CLAUDE"; then ((ISSUES++)); fi
if [ -f "$INVOICA_CLAUDE" ] && ! grep -q "shared-infra.md" "$INVOICA_CLAUDE"; then ((ISSUES++)); fi

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}All good!${NC} Both projects reference shared infrastructure."
else
    echo -e "${RED}$ISSUES issue(s) found.${NC} Fix the items marked with ✗ above."
fi

echo ""
echo "Tip: After updating shared-infra.md, both Claude Code sessions"
echo "     will pick up the changes on their next session start."
echo "═══════════════════════════════════════════════"
