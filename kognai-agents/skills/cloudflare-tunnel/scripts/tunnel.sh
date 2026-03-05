#!/bin/bash
# tunnel.sh — Manage Cloudflare Quick Tunnels (no account needed)
# Usage: bash tunnel.sh <start|stop|status|list> [port]
set -e

CMD="${1:?Usage: tunnel.sh <start|stop|status|list> [port]}"
PORT="${2:-3000}"
PID_FILE="/tmp/cf-tunnel-${PORT}.pid"
LOG_FILE="/tmp/cf-tunnel-${PORT}.log"

# Ensure cloudflared is available
if ! command -v cloudflared &>/dev/null; then
  echo "📦 Installing cloudflared..."
  curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /usr/local/bin/cloudflared 2>/dev/null || \
  curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /tmp/cloudflared
  [ -f /tmp/cloudflared ] && { sudo mv /tmp/cloudflared /usr/local/bin/cloudflared 2>/dev/null || mv /tmp/cloudflared ~/cloudflared; PATH="$HOME:$PATH"; }
  chmod +x /usr/local/bin/cloudflared 2>/dev/null || chmod +x ~/cloudflared
  echo "✅ cloudflared installed"
fi

case "$CMD" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
      echo "⚠️  Tunnel already running on port $PORT (PID $(cat $PID_FILE))"
      grep -o 'https://[^ ]*\.trycloudflare\.com' "$LOG_FILE" | tail -1
      exit 0
    fi
    echo "🌐 Starting Cloudflare tunnel for port $PORT..."
    nohup cloudflared tunnel --url "http://localhost:$PORT" > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 4
    URL=$(grep -o 'https://[^ ]*\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | tail -1)
    if [ -n "$URL" ]; then
      echo "✅ Tunnel active!"
      echo "   Public URL: $URL"
    else
      echo "⏳ Starting... check $LOG_FILE for URL"
      tail -5 "$LOG_FILE"
    fi
    ;;
  stop)
    if [ -f "$PID_FILE" ]; then
      kill "$(cat $PID_FILE)" 2>/dev/null && rm "$PID_FILE" && echo "✅ Tunnel stopped (port $PORT)"
    else
      echo "No tunnel found for port $PORT"
    fi
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
      URL=$(grep -o 'https://[^ ]*\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | tail -1)
      echo "✅ Running (PID $(cat $PID_FILE)) — $URL"
    else
      echo "❌ Not running on port $PORT"
    fi
    ;;
  list)
    echo "Active tunnels:"
    ls /tmp/cf-tunnel-*.pid 2>/dev/null | while read f; do
      p=$(cat "$f"); port=$(echo "$f" | grep -o '[0-9]*' | tail -1)
      kill -0 "$p" 2>/dev/null && echo "  port $port — PID $p" || echo "  port $port — stale"
    done
    ;;
  *)
    echo "Unknown command: $CMD"; exit 1 ;;
esac
