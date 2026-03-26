#!/bin/bash
set -e
KOGNAI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pkill -f router_server.py 2>/dev/null || true
mkdir -p "${KOGNAI_ROOT}/logs"
cd "${KOGNAI_ROOT}/runtime"
nohup python3 router_server.py > "${KOGNAI_ROOT}/logs/router-out.log" 2>"${KOGNAI_ROOT}/logs/router-error.log" &
echo "KognaiRouter started PID=$!"
sleep 1
curl -s http://localhost:11435/health && echo ' — healthy' || echo ' — not responding yet'
