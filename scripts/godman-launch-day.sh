#!/bin/bash
# GODMAN LAUNCH DAY — April 14, 2026
# Sprint 992
#
# Usage:
#   ./scripts/godman-launch-day.sh          # Full launch (publishes to npm)
#   ./scripts/godman-launch-day.sh --dry-run # Rehearsal: smoke tests only, no publish
#
# What this does:
#   1. Checks npm login status
#   2. Runs smoke tests for all 7 protocols
#   3. Publishes 7 protocols in dependency order
#   4. Updates SDK deps and publishes SDK
#   5. Verifies published versions on npm
#   6. Produces launch status report

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTOCOLS="pact lax score signal soul amf drs"
DRY_RUN=false
PASS=0; FAIL=0

[[ "$1" == "--dry-run" ]] && DRY_RUN=true

# Colors
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
head() { echo -e "\n${CYAN}$1${NC}"; }

echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}  GODMAN PROTOCOLS — APRIL 14 LAUNCH${NC}"
$DRY_RUN && echo -e "${YELLOW}  [DRY RUN — no npm publish]${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"

# 1. npm login check
head "[1] npm login"
if npm whoami &>/dev/null; then
  NPM_USER=$(npm whoami)
  ok "Logged in as: $NPM_USER"
else
  $DRY_RUN && warn "Not logged in to npm (ok for dry-run). Run: npm login" || { fail "Not logged in to npm. Run: npm login"; exit 1; }
fi

# 2. Smoke tests
head "[2] Smoke tests"
for PROTO in $PROTOCOLS; do
  DIR="$REPO_ROOT/workspace/godman-protocols/$PROTO"
  if [[ ! -d "$DIR" ]]; then
    fail "$PROTO — directory not found"
    continue
  fi
  if npm run test --prefix "$DIR" &>/dev/null 2>&1; then
    ok "$PROTO — smoke test PASS"
  else
    fail "$PROTO — smoke test FAIL (run: npm run test --prefix workspace/godman-protocols/$PROTO)"
    $DRY_RUN || exit 1
  fi
done

# 3. Publish protocols
head "[3] Publish protocols${DRY_RUN:+ (dry-run)}"
for PROTO in $PROTOCOLS; do
  DIR="$REPO_ROOT/workspace/godman-protocols/$PROTO"
  if $DRY_RUN; then
    VERSION=$(node -p "require('$DIR/package.json').version" 2>/dev/null || echo "?")
    ok "$PROTO@$VERSION — skipped (dry-run)"
  else
    if npm publish --access public --provenance --prefix "$DIR" &>/dev/null; then
      ok "@godman-protocols/$PROTO published (with provenance)"
    else
      warn "@godman-protocols/$PROTO — already published or error (check manually)"
    fi
  fi
done

# 4. SDK publish — swap file:// deps to registry versions first
head "[4] Publish SDK${DRY_RUN:+ (dry-run)}"
SDK_DIR="$REPO_ROOT/workspace/godman-protocols/sdk"
SDK_PKG="$SDK_DIR/package.json"

# Swap file:../ deps to ^0.2.0 for npm publish
cp "$SDK_PKG" "$SDK_PKG.bak"
for PROTO in $PROTOCOLS; do
  if command -v sed &>/dev/null; then
    sed -i.tmp "s|\"file:../$PROTO\"|\"^0.2.0\"|g" "$SDK_PKG"
    rm -f "$SDK_PKG.tmp"
  fi
done
ok "SDK deps swapped: file:../ → ^0.2.0"

if $DRY_RUN; then
  ok "@godman-protocols/sdk — skipped (dry-run)"
else
  npm install --prefix "$SDK_DIR" &>/dev/null || true
  if npm publish --access public --provenance --prefix "$SDK_DIR" &>/dev/null; then
    ok "@godman-protocols/sdk published (with provenance)"
  else
    warn "@godman-protocols/sdk — already published or error"
  fi
fi

# Restore original file:../ deps for local development
mv "$SDK_PKG.bak" "$SDK_PKG"
ok "SDK deps restored to file:../ for local dev"

# 5. Verify (skip in dry-run)
if ! $DRY_RUN; then
  head "[5] Verify npm versions"
  sleep 5  # Wait for registry propagation
  for PROTO in $PROTOCOLS sdk; do
    VERSION=$(npm view "@godman-protocols/$PROTO" version 2>/dev/null || echo "")
    [[ -n "$VERSION" ]] && ok "@godman-protocols/$PROTO@$VERSION on npm" || fail "@godman-protocols/$PROTO not found on npm"
  done
fi

# 6. Summary
echo -e "\n${CYAN}── Summary ──────────────────────────────${NC}"
echo -e "  PASS: ${GREEN}$PASS${NC}   FAIL: ${RED}$FAIL${NC}"
if [[ $FAIL -eq 0 ]]; then
  echo -e "\n  ${GREEN}🚀 Launch complete! Post the X thread now.${NC}"
  echo    "     workspace/social/suite-launch/x-megathread.md — 10-tweet thread ready"
else
  echo -e "\n  ${RED}Fix failures above before publishing.${NC}"
  exit 1
fi
