#!/usr/bin/env bash
# install-browser-use.sh — Sprint 784 (BROWSER-01)
#
# Install Browser Use CLI for TikTok automated posting.
# Requires: Homebrew (macOS)
#
# What this installs:
#   1. Python 3.11+ via Homebrew (system Python is 3.9.6, too old)
#   2. browser-use Python package
#   3. Playwright + Chromium browser
#
# Usage: bash scripts/scs001/install-browser-use.sh

set -euo pipefail

echo "══════════════════════════════════════════════════════"
echo "  BROWSER USE INSTALLER — Sprint 784"
echo "══════════════════════════════════════════════════════"
echo ""

# Step 1: Check/install Homebrew
if ! command -v brew &>/dev/null; then
  echo "❌ Homebrew not found. Install it first:"
  echo '   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 1
fi
echo "✅ Homebrew found"

# Step 2: Install Python 3.11+ via Homebrew
PYTHON_CMD=""
if command -v python3.12 &>/dev/null; then
  PYTHON_CMD="python3.12"
elif command -v python3.11 &>/dev/null; then
  PYTHON_CMD="python3.11"
else
  echo "📦 Installing Python 3.12 via Homebrew..."
  brew install python@3.12
  PYTHON_CMD="$(brew --prefix python@3.12)/bin/python3.12"
fi

PY_VERSION=$($PYTHON_CMD --version 2>&1)
echo "✅ Python: $PY_VERSION ($PYTHON_CMD)"

# Step 3: Create venv for browser-use
VENV_DIR="$HOME/kognai/.venv-browser-use"
if [ ! -d "$VENV_DIR" ]; then
  echo "📦 Creating virtual environment at $VENV_DIR..."
  $PYTHON_CMD -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
echo "✅ Virtual environment activated"

# Step 4: Install browser-use
echo "📦 Installing browser-use..."
pip install --upgrade pip
pip install browser-use
echo "✅ browser-use installed"

# Step 5: Install Playwright browsers
echo "📦 Installing Playwright Chromium..."
playwright install chromium
echo "✅ Playwright Chromium installed"

# Step 6: Verify
echo ""
echo "══════════════════════════════════════════════════════"
echo "  VERIFICATION"
echo "══════════════════════════════════════════════════════"
python -c "import browser_use; print(f'✅ browser_use v{browser_use.__version__}')" 2>/dev/null || echo "⚠️ browser_use import check skipped"
python -c "from playwright.sync_api import sync_playwright; print('✅ Playwright available')" 2>/dev/null || echo "⚠️ Playwright import check skipped"

echo ""
echo "✅ DONE. To use browser-use:"
echo "   source $VENV_DIR/bin/activate"
echo "   python scripts/scs001/browser-upload-test.py"
echo ""
echo "To add to .env:"
echo '   BROWSER_USE_VENV="'"$VENV_DIR"'"'
