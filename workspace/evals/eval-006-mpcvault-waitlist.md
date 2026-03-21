# EVAL-006 — MPCVault Agent Card Waitlist

## Status: WAITLISTED
**Last checked:** 2026-03-21
**Provider:** MPCVault (mpcvault.com)
**Product:** Agent Cards — programmable virtual cards with MPC key management

---

## What Are Agent Cards?

MPCVault Agent Cards are programmable virtual debit/credit cards backed by multi-party computation (MPC) wallets. They allow AI agents to make payments autonomously with:
- **Spending limits** — per-transaction and daily caps
- **Merchant restrictions** — whitelist/blacklist by MCC code
- **Time windows** — active hours for spend authorisation
- **Multi-sig approval** — human co-signer required above threshold
- **Real-time webhooks** — every transaction fires an event

## Why Kognai Needs This

Kognai's Phase 3-4 vision (x402 payment rail + financial autonomy) requires agents to:
1. Pay for cloud API calls autonomously (ClawRouter escalation)
2. Purchase infrastructure (domains, hosting top-ups)
3. Process micro-transactions for DRI research papers
4. Handle Stripe subscription payouts

Currently: all payments go through human-held cards. Agent Cards would let Satoshi (CFO agent) manage a treasury wallet with hard spending caps.

## Waitlist Details

| Field | Value |
|-------|-------|
| Applied | 2026-03-21 |
| Waitlist position | Unknown (no public queue) |
| Expected access | Q2 2026 (per MPCVault roadmap) |
| Contact | waitlist@mpcvault.com |
| API docs | Not yet public (beta docs available to waitlist) |
| Pricing | Unknown — expected per-card fee + % per txn |

## Requirements for Kognai Integration

When access is granted, the integration needs:

1. **Treasury wallet** — USDC-denominated, funded by Stripe revenue
2. **Agent sub-cards** — one per spending agent (Satoshi, ClawRouter, SCS-001)
3. **Spending policy** — JSON-configurable limits per agent per day
4. **Webhook receiver** — Express endpoint to log all transactions to Supabase
5. **Kill switch** — Telegram `/freeze-treasury` command to freeze all cards instantly
6. **Audit trail** — every transaction logged to `kognai_events` table

## Blockers

- [ ] Waitlist approval (human gate — cannot accelerate)
- [ ] API documentation access
- [ ] KYC/KYB verification (may require business entity)
- [ ] USDC on-ramp (Stripe → USDC conversion path)

## Next Steps

1. Monitor waitlist status monthly
2. When approved: create `scripts/treasury/mpcvault-client.ts`
3. Design spending policies in `workspace/treasury/treasury-config.json`
4. Wire into Satoshi agent's SOUL.md spending rules
