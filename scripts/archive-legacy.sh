#!/usr/bin/env bash
# archive-legacy.sh — safely move Kognai legacy directories to _archive/
#
# ╔══════════════════════════════════════════════════════════╗
# ║  WARNING: This operation moves directories permanently.  ║
# ║  Always run with --dry-run first to preview changes.     ║
# ╚══════════════════════════════════════════════════════════╝
#
# Usage:
#   ./scripts/archive-legacy.sh              # dry-run (safe, prints what would happen)
#   ./scripts/archive-legacy.sh --execute    # actually moves the directories

set -euo pipefail

KOGNAI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE_DIR="$KOGNAI_ROOT/_archive"
DRY_RUN=true

LEGACY_DIRS=(
  "backend"
  "frontend"
  "website"
  "docs-site"
  "sdk"
  "apps"
  "infrastructure"
  "kognai-agents"
)

# ── Argument parsing ─────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --execute) DRY_RUN=false ;;
    --dry-run) DRY_RUN=true ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--dry-run | --execute]" >&2
      exit 1
      ;;
  esac
done

# ── Header ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
if $DRY_RUN; then
  echo "║  ARCHIVE LEGACY — DRY RUN (no files will be moved)       ║"
else
  echo "║  ARCHIVE LEGACY — EXECUTE (files will be moved!)         ║"
fi
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Source root : $KOGNAI_ROOT"
echo "  Archive dir : $ARCHIVE_DIR"
echo ""

# ── Create archive dir ───────────────────────────────────────
if ! $DRY_RUN; then
  mkdir -p "$ARCHIVE_DIR"
fi

# ── Process each directory ───────────────────────────────────
MOVED=0
SKIPPED=0

for dir in "${LEGACY_DIRS[@]}"; do
  src="$KOGNAI_ROOT/$dir"
  dst="$ARCHIVE_DIR/$dir"

  if [[ ! -d "$src" ]]; then
    echo "  [SKIP] $dir — not found"
    ((SKIPPED++)) || true
    continue
  fi

  size=$(du -sh "$src" 2>/dev/null | cut -f1)

  if $DRY_RUN; then
    echo "  [DRY]  $dir ($size) → _archive/$dir"
  else
    if [[ -d "$dst" ]]; then
      echo "  [SKIP] $dir — destination already exists in _archive/"
      ((SKIPPED++)) || true
      continue
    fi
    mv "$src" "$dst"
    echo "  [DONE] $dir ($size) → _archive/$dir"
    ((MOVED++)) || true
  fi
done

# ── Summary ──────────────────────────────────────────────────
echo ""
if $DRY_RUN; then
  echo "  Dry run complete. Run with --execute to apply changes."
else
  echo "  Archive complete: $MOVED moved, $SKIPPED skipped."
fi
echo ""
