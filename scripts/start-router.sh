#!/bin/bash
set -e
pkill -f router_server.py 2>/dev/null || true
mkdir -p /Users/tarekmnif/kognai/logs
cd /Users/tarekmnif/kognai/runtime
nohup python3 router_server.py > /Users/tarekmnif/kognai/logs/router-out.log 2>/Users/tarekmnif/kognai/logs/router-error.log &
echo "KognaiRouter started PID=$!"
sleep 1
curl -s http://localhost:11435/health && echo ' — healthy' || echo ' — not responding yet'
