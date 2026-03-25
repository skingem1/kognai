# Sprint 1256 Output — ACHIRI-ALPHA Pre-launch Smoke Test
*Validated: 2026-03-25 | 31d until April 25 alpha launch*

## Smoke Test Results

| Test Suite | Result |
|------------|--------|
| Pre-deployment smoke (6 checks) | ✅ 6/6 PASS |
| E2E alpha integration (27 checks) | ✅ 27/27 PASS |
| Onboarding flow (7 checks) | ✅ 7/7 PASS |
| Waitlist notification dry-run | ✅ PASS (1 recipient: Skingem) |

## System Status

- **Achiri API**: Live on port 3420 (achiri-api PM2 process)
- **Model routing**: free → qwen3:4b (local), tnd_basic → claude-haiku-4-5, tnd_premium → claude-sonnet-4-6
- **Memory**: ENABLED — 35 JSONL files, MAX 50 turns/user
- **T3 Skills**: 8/8 COMPLETE (safety, eval, derja-profiler, paymee, voice, memory, user-profile, conversation-summary)
- **Onboarding**: ACTIVE — gated on new session + no summary + message_count=0

## Waitlist

- **Waitlist file**: `workspace/achiri/waitlist.jsonl` — 1 user (Skingem)
- **Notify script**: `scripts/achiri/notify-waitlist.sh` — ready for broadcast
- **Templates available**: `alpha-invite`, `reminder`
- **Blocker**: `ACHIRI_TELEGRAM_BOT_TOKEN` not in .env (human action to set for live broadcast)

## Remaining Pre-Launch Gaps (before Apr 25)

1. **Hetzner deploy** — `scripts/achiri/deploy-hetzner.sh` exists, needs SSH credentials
2. **ACHIRI_TELEGRAM_BOT_TOKEN** — set in .env for live Telegram bot
3. **Waitlist growth** — currently 1 user, need to grow before alpha-invite broadcast
4. **Public URL** — needs nginx reverse proxy + certbot SSL on Hetzner

## Overall Status

🟡 **ALPHA-READY locally — Hetzner deploy is the launch blocker**
- All validation passes 40/40
- Deploy scripts exist (deploy-hetzner.sh, init-hetzner.sh, nginx-achiri.conf)
- Blocked only by: SSH credentials + ACHIRI_TELEGRAM_BOT_TOKEN (human actions)
