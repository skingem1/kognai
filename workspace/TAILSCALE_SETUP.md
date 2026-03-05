# Tailscale Setup (Section 10B)
**Status:** PKG downloaded. Requires your password to install.

## One-time setup (3 commands)

```bash
# 1. Install
sudo installer -pkg /tmp/Tailscale.pkg -target /

# 2. Add to PATH and start
export PATH="/Applications/Tailscale.app/Contents/MacOS:$PATH"
sudo tailscale up

# 3. Authenticate in browser (opens automatically), then get vault IP
tailscale ip -4
```

## After you get the IP

Update `~/kognai/.env`:
```
VAULT_TAILSCALE_IP=100.x.x.x   # your IP from step 3
```

Then run:
```bash
# Update .env with actual IP
sed -i '' "s/VAULT_TAILSCALE_IP=.*/VAULT_TAILSCALE_IP=100.x.x.x/" ~/kognai/.env

# Reload gateway with new env
launchctl unload ~/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

## What Tailscale enables (Section 10B)
- Vault (Mac Mini) gets stable 100.x.x.x IP accessible from cloud
- Cloud agents call vault at http://100.x.x.x:11434 (Ollama)
- No port forwarding or dynamic DNS needed
- MacGyver's connection failure protocol triggers on Tailscale drops

## PKG location
`/tmp/Tailscale.pkg` (18MB, Tailscale 1.94.2 for macOS arm64)
