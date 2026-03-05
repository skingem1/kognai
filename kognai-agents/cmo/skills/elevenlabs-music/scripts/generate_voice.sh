#!/usr/bin/env bash
# ElevenLabs Text-to-Speech
# Usage: generate_voice.sh <output_dir> <text> [voice_id] [model_id]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

if [[ -f "$WORKSPACE_DIR/.env" ]]; then
  set -a; source "$WORKSPACE_DIR/.env"; set +a
fi

API_KEY="${ELEVENLABS_API_KEY:?ELEVENLABS_API_KEY not set}"
OUTPUT_DIR="${1:?Usage: generate_voice.sh <output_dir> <text> [voice_id] [model_id]}"
TEXT="${2:?Text required}"
VOICE_ID="${3:-EXAVITQu4vr4xnSDxMaL}"   # Sarah by default
MODEL_ID="${4:-eleven_flash_v2_5}"

mkdir -p "$OUTPUT_DIR"

SAFE_NAME=$(echo "$TEXT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | head -c 60)
TIMESTAMP=$(date +%s)
FILENAME="${SAFE_NAME}-${TIMESTAMP}.mp3"
FILEPATH="${OUTPUT_DIR}/${FILENAME}"

echo "Generating voice: $TEXT" >&2

HTTP_CODE=$(curl -s -w "%{http_code}" \
  -X POST "https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}" \
  -H "xi-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"${TEXT}\",\"model_id\":\"${MODEL_ID}\"}" \
  -o "$FILEPATH")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: API returned $HTTP_CODE" >&2
  cat "$FILEPATH" >&2
  rm -f "$FILEPATH"
  exit 1
fi

echo "Generated: $FILEPATH" >&2
echo "$FILEPATH"
