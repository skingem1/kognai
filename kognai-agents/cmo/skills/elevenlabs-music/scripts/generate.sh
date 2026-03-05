#!/usr/bin/env bash
# ElevenLabs Music/Sound Generation
# Usage: generate.sh <output_dir> <prompt> [duration_seconds] [prompt_influence]
# Generates an MP3 and prints the file path.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE_DIR="$(dirname "$(dirname "$SKILL_DIR")")"

# Load .env
if [[ -f "$WORKSPACE_DIR/.env" ]]; then
  set -a; source "$WORKSPACE_DIR/.env"; set +a
fi

API_KEY="${ELEVENLABS_API_KEY:?ELEVENLABS_API_KEY not set in .env}"
OUTPUT_DIR="${1:?Usage: generate.sh <output_dir> <prompt> [duration_seconds] [prompt_influence]}"
PROMPT="${2:?Prompt required}"
DURATION="${3:-}"
INFLUENCE="${4:-0.3}"

mkdir -p "$OUTPUT_DIR"

# Build JSON payload
JSON=$(python3 -c "
import json, sys
d = {'text': sys.argv[1], 'prompt_influence': float(sys.argv[2])}
if sys.argv[3]:
    d['duration_seconds'] = float(sys.argv[3])
print(json.dumps(d))
" "$PROMPT" "$INFLUENCE" "$DURATION")

# Sanitize filename from prompt
SAFE_NAME=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | head -c 60)
TIMESTAMP=$(date +%s)
FILENAME="${SAFE_NAME}-${TIMESTAMP}.mp3"
FILEPATH="${OUTPUT_DIR}/${FILENAME}"

echo "Generating: $PROMPT" >&2

HTTP_CODE=$(curl -s -w "%{http_code}" \
  -X POST "https://api.elevenlabs.io/v1/sound-generation" \
  -H "xi-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$JSON" \
  -o "$FILEPATH")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: API returned $HTTP_CODE" >&2
  cat "$FILEPATH" >&2
  rm -f "$FILEPATH"
  exit 1
fi

FILE_SIZE=$(wc -c < "$FILEPATH" | tr -d ' ')
echo "Generated: $FILEPATH ($FILE_SIZE bytes)" >&2
echo "$FILEPATH"
