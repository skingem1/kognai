#!/usr/bin/env bash
# godman-push-to-github.sh — Initialize git repos and push all 8 Godman protocols to GitHub
# Usage: ./scripts/godman-push-to-github.sh [--dry-run]
#
# Prerequisites:
#   1. GitHub org "godman-protocols" created under skingem1 account
#   2. 8 empty repos created: amf, drs, lax, pact, score, sdk, signal, soul
#   3. SSH key configured for github.com (or use HTTPS with gh auth)
#
# What this does:
#   - For each protocol dir in workspace/godman-protocols/
#   - Initializes a git repo (if not already)
#   - Adds .gitignore (node_modules, dist)
#   - Commits all source files
#   - Adds remote origin → github.com/godman-protocols/<name>
#   - Pushes main branch + tags

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROTOCOLS_DIR="$PROJECT_ROOT/workspace/godman-protocols"
GITHUB_ORG="godman-protocols"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN MODE — no git operations will execute ==="
fi

PROTOCOLS=(amf drs lax pact score sdk signal soul)
PUSHED=0
FAILED=0
SKIPPED=0

for proto in "${PROTOCOLS[@]}"; do
  DIR="$PROTOCOLS_DIR/$proto"
  echo ""
  echo "━━━ $proto ━━━"

  if [[ ! -d "$DIR" ]]; then
    echo "  ⚠ Directory not found: $DIR — skipping"
    ((SKIPPED++))
    continue
  fi

  if [[ ! -f "$DIR/package.json" ]]; then
    echo "  ⚠ No package.json — skipping"
    ((SKIPPED++))
    continue
  fi

  cd "$DIR"

  # Create .gitignore if missing
  if [[ ! -f .gitignore ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "  [dry-run] Would create .gitignore"
    else
      cat > .gitignore << 'GITIGNORE'
node_modules/
dist/
*.tsbuildinfo
.DS_Store
GITIGNORE
      echo "  ✓ Created .gitignore"
    fi
  fi

  # Initialize git repo if needed
  if [[ ! -d .git ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "  [dry-run] Would run: git init -b main"
    else
      git init -b main > /dev/null 2>&1
      echo "  ✓ Initialized git repo"
    fi
  else
    echo "  ✓ Git repo already exists"
  fi

  # Stage all files
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] Would stage and commit all files"
  else
    git add -A
    # Commit only if there are changes
    if git diff --cached --quiet 2>/dev/null; then
      echo "  ✓ Nothing new to commit"
    else
      git commit -m "Initial release v$(node -p "require('./package.json').version")" > /dev/null 2>&1
      echo "  ✓ Committed all files"
    fi

    # Tag with version from package.json
    VERSION="v$(node -p "require('./package.json').version")"
    if ! git tag -l "$VERSION" | grep -q "$VERSION"; then
      git tag -a "$VERSION" -m "Release $VERSION"
      echo "  ✓ Tagged $VERSION"
    else
      echo "  ✓ Tag $VERSION already exists"
    fi
  fi

  # Add remote origin
  REMOTE_URL="git@github.com:${GITHUB_ORG}/${proto}.git"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] Would add remote: $REMOTE_URL"
    echo "  [dry-run] Would push main + tags"
    ((PUSHED++))
  else
    if git remote get-url origin > /dev/null 2>&1; then
      CURRENT_URL="$(git remote get-url origin)"
      if [[ "$CURRENT_URL" != "$REMOTE_URL" ]]; then
        git remote set-url origin "$REMOTE_URL"
        echo "  ✓ Updated remote origin → $REMOTE_URL"
      else
        echo "  ✓ Remote origin already set"
      fi
    else
      git remote add origin "$REMOTE_URL"
      echo "  ✓ Added remote origin → $REMOTE_URL"
    fi

    # Push
    if git push -u origin main --tags 2>/dev/null; then
      echo "  ✓ Pushed main + tags"
      ((PUSHED++))
    else
      echo "  ✗ Push failed (repo may not exist yet — create it on GitHub first)"
      ((FAILED++))
    fi
  fi

  cd "$PROJECT_ROOT"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PUSHED pushed, $FAILED failed, $SKIPPED skipped"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "(dry-run — no actual pushes)"
fi
echo ""
echo "Next steps:"
echo "  1. Create GitHub org: https://github.com/organizations/plan"
echo "  2. Create 8 empty repos (no README, no .gitignore)"
echo "  3. Re-run this script without --dry-run"
