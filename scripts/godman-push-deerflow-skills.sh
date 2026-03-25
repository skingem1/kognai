#!/usr/bin/env bash
# godman-push-deerflow-skills.sh — Sprint 1293
# Prepare and submit Godman SKILL.md files to the DeerFlow skills registry.
#
# By default runs in DRY-RUN mode — shows what would be submitted.
# Pass --execute to actually clone, copy, and push a PR branch.
#
# Usage:
#   bash scripts/godman-push-deerflow-skills.sh             # dry-run (preview)
#   bash scripts/godman-push-deerflow-skills.sh --execute   # actual PR submission

set -euo pipefail

DEERFLOW_REPO="https://github.com/bytedance/deerflow-skills.git"
BRANCH_NAME="add-godman-protocols-skills"
PR_TITLE="Add Godman Protocols skill definitions (pact, soul, lax, score, signal, amf, drs, sdk)"
KOGNAI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_BASE="$KOGNAI_ROOT/workspace/godman-protocols"
EXECUTE=false
TMPDIR_USED=""

if [[ "${1:-}" == "--execute" ]]; then
  EXECUTE=true
fi

# ---- Verify SKILL.md files exist --------------------------------------------

echo "=== Godman DeerFlow Skills Submission ==="
echo ""
echo "Mode: $([ "$EXECUTE" = true ] && echo 'EXECUTE (will push)' || echo 'DRY-RUN (preview only)')"
echo ""

PROTOCOLS=(pact soul lax score signal amf drs sdk)
MISSING=()
SKILLS_FOUND=()

for proto in "${PROTOCOLS[@]}"; do
  skillPath="$SKILLS_BASE/$proto/skills/public/godman-$proto/SKILL.md"
  if [[ -f "$skillPath" ]]; then
    SKILLS_FOUND+=("$skillPath")
    echo "  ✅ $proto — $(head -1 "$skillPath" | tr -d '#' | xargs)"
  else
    MISSING+=("$proto")
    echo "  ❌ $proto — SKILL.md missing at $skillPath"
  fi
done

echo ""
echo "Found: ${#SKILLS_FOUND[@]}/${#PROTOCOLS[@]} SKILL.md files"

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Missing: ${MISSING[*]}"
  echo ""
  echo "⚠️  Some SKILL.md files are missing. Fix before submission."
  if [[ "$EXECUTE" = true ]]; then
    echo "Aborting — fix missing SKILL.md files first."
    exit 1
  fi
fi

# ---- Show PR description ---------------------------------------------------

echo ""
echo "PR would be submitted to: $DEERFLOW_REPO"
echo "Branch: $BRANCH_NAME"
echo ""
echo "PR title: $PR_TITLE"
echo ""
echo "Files that would be added to deerflow-skills repo:"
for skillPath in "${SKILLS_FOUND[@]}"; do
  proto=$(basename "$(dirname "$skillPath")" | sed 's/godman-//')
  echo "  skills/godman-protocols/godman-$proto/SKILL.md"
done

# ---- Execute mode -----------------------------------------------------------

if [[ "$EXECUTE" = false ]]; then
  echo ""
  echo "Dry-run complete. Run with --execute to submit the PR."
  echo "  bash scripts/godman-push-deerflow-skills.sh --execute"
  exit 0
fi

# Require gh CLI for PR creation
if ! command -v gh &>/dev/null; then
  echo "❌ gh CLI not found. Install: https://cli.github.com"
  exit 1
fi

# Clone deerflow-skills to a temp dir
TMPDIR_USED=$(mktemp -d)
trap 'rm -rf "$TMPDIR_USED"' EXIT

echo ""
echo "Cloning $DEERFLOW_REPO ..."
git clone --depth=1 "$DEERFLOW_REPO" "$TMPDIR_USED/deerflow-skills"
cd "$TMPDIR_USED/deerflow-skills"

# Create branch
git checkout -b "$BRANCH_NAME"

# Copy SKILL.md files
for skillPath in "${SKILLS_FOUND[@]}"; do
  proto=$(basename "$(dirname "$skillPath")" | sed 's/godman-//')
  destDir="skills/godman-protocols/godman-$proto"
  mkdir -p "$destDir"
  cp "$skillPath" "$destDir/SKILL.md"
  git add "$destDir/SKILL.md"
  echo "  Copied: $destDir/SKILL.md"
done

# Commit
git commit -m "Add Godman Protocols skill definitions (${#SKILLS_FOUND[@]} skills)"

# Push branch
git push origin "$BRANCH_NAME"

# Create PR
gh pr create \
  --title "$PR_TITLE" \
  --body "$(cat <<'EOF'
## Summary

This PR adds SKILL.md definitions for the [Godman Protocols](https://github.com/skingem1/kognai) agent trust stack:

- **pact** — Protocol for Agent Coordination and Trust (mandates, scoped permissions)
- **soul** — Constitutional compliance engine (ethical guardrails)
- **lax** — Latency-aware routing with fallback chains
- **score** — Agent reputation and trust scoring
- **signal** — Typed event bus for agent communication
- **amf** — Asynchronous message format standard
- **drs** — Distributed resource scheduling
- **sdk** — Unified SDK (all 7 protocols in one package)

All packages published to npm as `@godman-protocols/*`.

## Test plan
- [ ] Verify each SKILL.md is valid YAML frontmatter
- [ ] Verify skill names match npm package names
- [ ] Test agent discovery via DeerFlow skill registry
EOF
)"

echo ""
echo "✅ PR submitted to deerflow-skills!"
