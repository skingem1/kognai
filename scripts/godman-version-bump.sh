#!/bin/bash
# Sprint 1181: GODMAN VERSION BUMP — set all 8 packages to the same version
#
# Usage:
#   ./scripts/godman-version-bump.sh 0.3.0          # bump to 0.3.0
#   ./scripts/godman-version-bump.sh 0.3.0 --dry-run # preview without writing
#
# Packages bumped: pact lax score signal soul amf drs sdk

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTOCOLS="pact lax score signal soul amf drs sdk"
VERSION="$1"
DRY_RUN=false
[[ "$2" == "--dry-run" || "$1" == "--dry-run" ]] && DRY_RUN=true

# Colors
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }

# Validate version arg
if [[ -z "$VERSION" || "$VERSION" == "--dry-run" ]]; then
  echo -e "${RED}Usage: $0 <version> [--dry-run]${NC}"
  echo    "  Example: $0 0.3.0"
  exit 1
fi

# Validate semver format (basic)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  fail "Invalid semver: $VERSION — expected format like 0.3.0 or 1.0.0-beta.1"
fi

echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}  GODMAN VERSION BUMP → v${VERSION}${NC}"
$DRY_RUN && echo -e "${YELLOW}  [DRY RUN — no files written]${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"

# Bump each package
for PKG in $PROTOCOLS; do
  PKG_DIR="$REPO_ROOT/workspace/godman-protocols/$PKG"
  PKG_FILE="$PKG_DIR/package.json"
  if [[ ! -f "$PKG_FILE" ]]; then
    warn "@godman-protocols/$PKG — package.json not found, skipping"
    continue
  fi
  CURRENT=$(node -p "require('$PKG_FILE').version" 2>/dev/null || echo "?")
  if $DRY_RUN; then
    ok "@godman-protocols/$PKG: $CURRENT → $VERSION (dry-run)"
  else
    # Use node to do the JSON edit (preserves formatting better than sed)
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$PKG_FILE', 'utf-8'));
      pkg.version = '$VERSION';
      fs.writeFileSync('$PKG_FILE', JSON.stringify(pkg, null, 2) + '\n');
    "
    ok "@godman-protocols/$PKG: $CURRENT → $VERSION"
  fi
done

echo ""
if $DRY_RUN; then
  echo -e "${YELLOW}Dry-run complete. Run without --dry-run to apply.${NC}"
else
  echo -e "${GREEN}All packages bumped to v${VERSION}.${NC}"
  echo    "  Next: review changes with git diff workspace/godman-protocols"
  echo    "  Then: run /godman-tag confirm to create git tags"
  echo    "  Then: run /godman-publish confirm to publish to npm"
fi
