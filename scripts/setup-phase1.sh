#!/usr/bin/env bash
# setup-phase1.sh — One-shot Phase 1 environment setup
# Run once before going live: bash scripts/setup-phase1.sh
# Idempotent — safe to run multiple times.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== KOGNAI PHASE 1 SETUP ==="
echo "Working directory: $ROOT"
echo ""

# --- Step 1: Load .env ---
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
  echo "✓ Loaded .env"
else
  echo "✗ .env not found — copy .env.example to .env and fill in values"
  exit 1
fi

# --- Step 2: Validate required env vars ---
echo ""
echo "--- Required Env Vars ---"
MISSING=0
for VAR in TIKTOK_ACCESS_TOKEN SUPABASE_URL SUPABASE_SERVICE_KEY; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "✗ MISSING: $VAR — see .env.example for instructions"
    MISSING=1
  else
    echo "✓ $VAR is set"
  fi
done

if [[ $MISSING -eq 1 ]]; then
  echo ""
  echo "SETUP BLOCKED — set missing vars in .env then re-run"
  exit 1
fi

# --- Step 3: Create Supabase storage bucket (scs001-videos) ---
echo ""
echo "--- Creating Supabase Storage Bucket ---"
cd "$ROOT"
npx ts-node -T --project tsconfig.scripts.json -e "
const { VideoHostingService } = require('./agents/scs001-hosting/index');
const h = new VideoHostingService();
h.ensureBucket()
  .then(() => { console.log('✓ Supabase bucket ready'); process.exit(0); })
  .catch((e) => { console.error('✗ Bucket creation failed:', e.message); process.exit(1); });
"

# --- Step 4: Run preflight validator ---
echo ""
echo "--- Preflight Check ---"
npx ts-node -T --project tsconfig.scripts.json scripts/scs001/validate-production-preflight.ts

# --- Step 5: Mock pipeline dry-run ---
echo ""
echo "--- Mock Pipeline Dry-Run ---"
npx ts-node -T --project tsconfig.scripts.json agents/scs001-orchestrator/run-pipeline.ts mock

# --- Done ---
echo ""
echo "=== PHASE 1 SETUP COMPLETE ==="
echo "To go live:      ./run-live.sh"
echo "To test again:   npx ts-node agents/scs001-orchestrator/run-pipeline.ts mock"
echo "To check status: pm2 status"
