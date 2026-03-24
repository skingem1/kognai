#!/bin/bash
# GODMAN — Tag all 8 packages at current package.json version
# Sprint 1172
#
# Usage:
#   ./scripts/godman-tag-all.sh           # Create and push tags
#   ./scripts/godman-tag-all.sh --dry-run # Preview tags, no git ops
#
# Tags created: {name}-v{version}  (matches cmdGodman + cmdGodmanPreflight check format)
# e.g. pact-v0.2.0

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTOCOLS="pact lax score signal soul amf drs sdk"
BASE="$REPO_ROOT/workspace/godman-protocols"
DRY_RUN=false

if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "DRY-RUN mode — no git operations will run"
fi

echo ""
echo "=== Godman Tag All ==="
echo ""

TAGGED=0
SKIPPED=0
ERRORS=0

for proto in $PROTOCOLS; do
  PKG_JSON="$BASE/$proto/package.json"
  if [[ ! -f "$PKG_JSON" ]]; then
    echo "⚠️  $proto — package.json not found, skipping"
    ((SKIPPED++)) || true
    continue
  fi

  VERSION=$(node -e "process.stdout.write(require('$PKG_JSON').version || '')" 2>/dev/null)
  if [[ -z "$VERSION" ]]; then
    echo "⚠️  $proto — could not read version, skipping"
    ((SKIPPED++)) || true
    continue
  fi

  TAG="${proto}-v${VERSION}"  # Sprint 1195: fix format to match preflight check

  # Check if tag already exists
  if git -C "$REPO_ROOT" tag 2>/dev/null | grep -qF "$TAG"; then
    echo "✅ $proto — tag $TAG already exists"
    ((TAGGED++)) || true
    continue
  fi

  if $DRY_RUN; then
    echo "  [dry-run] would create tag: $TAG"
    ((TAGGED++)) || true
  else
    if git -C "$REPO_ROOT" tag "$TAG" 2>/dev/null; then
      echo "✅ $proto — created tag: $TAG"
      ((TAGGED++)) || true
    else
      echo "❌ $proto — failed to create tag $TAG"
      ((ERRORS++)) || true
    fi
  fi
done

echo ""
echo "--- Summary ---"
echo "Tagged: $TAGGED  Skipped: $SKIPPED  Errors: $ERRORS"

if ! $DRY_RUN && [[ $TAGGED -gt 0 && $ERRORS -eq 0 ]]; then
  echo ""
  echo "Pushing tags to origin..."
  git -C "$REPO_ROOT" push origin --tags
  echo "✅ Tags pushed."
fi

echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "⚠️  Some tags failed — check errors above"
  exit 1
else
  echo "✅ Done"
fi
