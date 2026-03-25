#!/usr/bin/env bash
# publish-all.sh — Godman Protocols npm publish script
# Sprint 1254 / GODMAN-LAUNCH
#
# Publishes all 7 protocols + SDK to npm in dependency order.
# Protocols must be published before SDK (SDK depends on all).
#
# Usage:
#   ./publish-all.sh          # dry-run (default — safe to run anytime)
#   ./publish-all.sh --live   # actual publish (requires npm login + npm whoami: skingem1)
#
# Requirements:
#   npm login  (or: npm login --auth-type=web)
#   npm whoami  # should output: skingem1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=true
FAILED=()
PUBLISHED=()

# Parse args
for arg in "$@"; do
  if [[ "$arg" == "--live" ]]; then
    DRY_RUN=false
  fi
done

if $DRY_RUN; then
  echo "=== Godman Protocols — npm publish DRY-RUN ==="
  echo "(Pass --live to actually publish)"
else
  echo "=== Godman Protocols — npm PUBLISH LIVE ==="
  echo "WARNING: This will publish to npm. Press Ctrl+C within 5s to abort."
  sleep 5
fi
echo ""

# Protocol publish order (protocols first, then SDK)
PROTOCOLS=(pact lax score signal soul amf drs)

publish_package() {
  local pkg="$1"
  local dir="$SCRIPT_DIR/$pkg"

  if [[ ! -d "$dir" ]]; then
    echo "SKIP $pkg — directory not found"
    return
  fi

  local version
  version=$(node -e "console.log(require('$dir/package.json').version)" 2>/dev/null || echo "unknown")
  echo -n "[$pkg v$version] "

  if $DRY_RUN; then
    local output
    if output=$(cd "$dir" && npm publish --dry-run --access public 2>&1); then
      echo "DRY-RUN OK"
      PUBLISHED+=("$pkg@$version")
    else
      echo "DRY-RUN FAILED"
      echo "  Error: $(echo "$output" | tail -3)"
      FAILED+=("$pkg")
    fi
  else
    local output
    if output=$(cd "$dir" && npm publish --access public --provenance 2>&1); then
      echo "PUBLISHED"
      PUBLISHED+=("$pkg@$version")
    else
      echo "FAILED"
      echo "  Error: $(echo "$output" | tail -3)"
      FAILED+=("$pkg")
    fi
  fi
}

# Step 1: Publish protocols
echo "--- Step 1: Protocols ---"
for proto in "${PROTOCOLS[@]}"; do
  publish_package "$proto"
done

# Step 2: Publish SDK
echo ""
echo "--- Step 2: SDK ---"
publish_package "sdk"

# Summary
echo ""
echo "=== Summary ==="
echo "Published: ${#PUBLISHED[@]} / $((${#PROTOCOLS[@]} + 1))"
for p in "${PUBLISHED[@]}"; do echo "  ✓ $p"; done
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed: ${#FAILED[@]}"
  for f in "${FAILED[@]}"; do echo "  ✗ $f"; done
  exit 1
fi

if $DRY_RUN; then
  echo ""
  echo "All dry-run checks passed. Run with --live to publish."
fi
