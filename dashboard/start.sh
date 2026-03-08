#!/bin/bash
# Kognai Vault Dashboard — Start
cd "$(dirname "$0")"
echo "Starting Kognai Vault Dashboard on http://localhost:11436 ..."
python3 -m uvicorn server:app --host 127.0.0.1 --port 11436 &
echo $! > .pid
echo "Dashboard PID: $(cat .pid)"
echo "Open: http://localhost:11436"
