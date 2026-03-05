#!/bin/bash
# Invoica backend startup wrapper
# Loads .env and starts the backend via ts-node (no build step required).

set -a
source /home/invoica/apps/Invoica/.env 2>/dev/null
set +a

cd /home/invoica/apps/Invoica

# Syntax-check TypeScript before starting.
if ! /home/invoica/apps/Invoica/node_modules/.bin/tsc \
    --project tsconfig.json --noEmit --skipLibCheck 2>&1 \
    | grep -qE "error TS1[0-9]{3}:"; then
  : # no errors, continue
else
  echo "[backend-wrapper] TypeScript SYNTAX errors (TS1xxx) detected — aborting:"
  /home/invoica/apps/Invoica/node_modules/.bin/tsc \
    --project tsconfig.json --noEmit --skipLibCheck 2>&1 \
    | grep -E "error TS1[0-9]{3}:" | head -10
  exit 1
fi

# Wait for port 3001 to be free (graceful wait, then force-kill only if needed).
# This prevents the race where a fresh fuser -k kills a just-started ts-node.
PORT_FREE=false
for i in $(seq 1 15); do
  if ! fuser 3001/tcp >/dev/null 2>&1; then
    PORT_FREE=true
    break
  fi
  sleep 1
done

if [ "$PORT_FREE" = "false" ]; then
  echo "[backend-wrapper] Port 3001 still busy after 15s — force-killing holder"
  fuser -k 3001/tcp 2>/dev/null || true
  sleep 2
fi

exec /home/invoica/apps/Invoica/node_modules/.bin/ts-node \
  --project tsconfig.json \
  --transpile-only \
  backend/src/server.ts
