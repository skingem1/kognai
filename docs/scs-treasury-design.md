# SCS Treasury Architecture Design

**Version:** 1.0
**Date:** 2026-03-21
**Status:** DESIGN (pending MPCVault Agent Card access)
**Owner:** Satoshi (CFO agent, Layer 9)

---

## Overview

The SCS Treasury is Kognai's autonomous financial layer, designed around MPCVault Agent Cards. It manages revenue collection, cost allocation, and agent spending with hard constitutional limits.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                REVENUE SOURCES                   │
│  Stripe subscriptions │ x402 micropayments       │
│  DRI paper fees       │ API access fees           │
└──────────────┬──────────────────┬────────────────┘
               │                  │
               ▼                  ▼
┌──────────────────────────────────────────────────┐
│              TREASURY WALLET (USDC)               │
│  MPCVault MPC wallet — multi-sig (human + agent) │
│  Balance tracking: workspace/treasury/balance.json│
└──────────────┬───────────────────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│Satoshi │ │ClawRtr │ │SCS-001 │
│Card    │ │Card    │ │Card    │
│$50/day │ │$20/day │ │$10/day │
└────┬───┘ └────┬───┘ └────┬───┘
     │          │          │
     ▼          ▼          ▼
 Infra costs  Model API  Content
 (hosting,    escalation  production
  domains)    (cloud tier) (stock media)
```

## Agent Cards

Each spending agent gets a dedicated virtual card with configurable limits:

| Agent | Card Purpose | Daily Limit | Per-Txn Limit | MCC Whitelist |
|-------|-------------|-------------|---------------|---------------|
| Satoshi (CFO) | Infrastructure & general | $50 | $25 | Cloud, hosting, domains |
| ClawRouter | Model API escalation | $20 | $5 | API services |
| SCS-001 | Content production costs | $10 | $3 | Media, stock footage |

## Spending Policies

Policies are defined in `workspace/treasury/treasury-config.json` and enforced by:
1. **MPCVault card-level limits** — hard caps, cannot be overridden by agents
2. **Satoshi pre-approval** — transactions > 50% of daily limit require CFO check
3. **Human co-sign** — transactions > $20 require human Telegram approval
4. **Constitutional rule** — cumulative revenue >= cumulative costs (Founding Charter)

## Revenue Flow

1. **Stripe webhook** → `backend/src/routes/stripe-webhook.ts` records payment
2. **Revenue tracker** → `scripts/scs001/revenue-tracker.ts` updates totals
3. **Treasury sync** — daily cron converts Stripe balance → treasury ledger
4. **USDC top-up** — when treasury balance < $100, alert human for manual top-up

## Kill Switches

| Trigger | Action | Recovery |
|---------|--------|----------|
| `/freeze-treasury` Telegram | Freeze all Agent Cards | `/unfreeze-treasury` |
| Daily spend > $80 total | Auto-freeze, alert human | Human review + unfreeze |
| Revenue < costs for 7 days | Freeze non-essential cards | Revenue must recover |
| Any single txn > $25 | Block + alert | Human approval required |

## Transaction Logging

Every Agent Card transaction is logged to:
1. **Supabase** — `kognai_events` table (type: `treasury.transaction`)
2. **Local ledger** — `workspace/treasury/transactions.jsonl`
3. **Daily digest** — aggregated in daily report

Event schema:
```json
{
  "type": "treasury.transaction",
  "agent": "satoshi",
  "card_id": "card_xxx",
  "amount_usd": 4.50,
  "merchant": "Hetzner Cloud",
  "mcc": "7372",
  "status": "approved",
  "timestamp": "2026-03-21T14:30:00Z"
}
```

## Implementation Phases

| Phase | When | What |
|-------|------|------|
| **Design** (now) | Pre-waitlist | This document + config schema |
| **Mock** | On waitlist approval | Mock client for testing flows |
| **Integration** | API access granted | `scripts/treasury/mpcvault-client.ts` |
| **Live** | After 30-day test | Production cards with real limits |

## Dependencies

- MPCVault Agent Card waitlist approval (EVAL-006)
- Stripe revenue must be flowing (Phase 1 gate: 30 posts)
- x402 wallet already configured (`X402_WALLET_ADDRESS` set)
- Satoshi agent operational (Layer 9)
