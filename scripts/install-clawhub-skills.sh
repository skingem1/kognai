#!/bin/bash
# T1 OpenClaw Skills Installer — Sprint-065/066
# Prerequisites: npx clawhub login
set -e

SKILLS_DIR="/Users/tarekmnif/kognai/skills"
mkdir -p "$SKILLS_DIR"

echo "Installing T1 OpenClaw skills to $SKILLS_DIR..."
echo ""

# Skills with strong clawhub matches
declare -a SKILLS=(
  "skill-vetter"
  "context-recovery"
  "sovereign-git-commit-analyzer"
  "gitclaw"
  "system-resource-monitor"
  "hetzner-cloud"
  "vercel"
  "pm2"
)

for skill in "${SKILLS[@]}"; do
  printf "  Installing %-35s" "$skill..."
  if npx clawhub install "$skill" --workdir "$SKILLS_DIR" --no-input 2>/dev/null; then
    echo "✅"
  else
    echo "❌ failed"
  fi
done

# tailscale: flagged suspicious by VirusTotal — requires --force
printf "  Installing %-35s" "tailscale (--force)..."
if npx clawhub install tailscale --workdir "$SKILLS_DIR" --no-input --force 2>/dev/null; then
  echo "✅"
else
  echo "❌ failed"
fi

echo ""
echo "Done. Installed skills:"
ls "$SKILLS_DIR" 2>/dev/null || echo "  (none — check npx clawhub login)"

echo ""
echo "NOTE: 4 T1 skills are not yet on clawhub and must be sourced manually:"
echo "  - sophie-optimizer"
echo "  - context-compressor"
echo "  - lossless-claw"
echo "  - project-context-sync"
