# INTEL-009: Clawcard Evaluation for TikTok Autonomous Verification

> **Sprint 962** | **Date:** 2026-03-24 | **Status:** Evaluated (login required for live test)

## Background

TikTok autonomous posting is blocked by phone verification (Sprint 508-BROWSER-01). Clawcard provides agent-level phone numbers and email addresses that could solve this blocker.

## Installation

```bash
npm install -g @clawcard/cli  # v3.3.0 installed
```

## Available Capabilities (from CLI help)

| Feature | Command | Relevance to TikTok |
|---------|---------|---------------------|
| Agent phone (SMS) | `clawcard agent sms` | HIGH — could receive TikTok verification SMS |
| Agent email | `clawcard agent emails` | MEDIUM — backup verification method |
| Virtual cards | `clawcard agent cards` | LOW — for paid features if needed |
| USDC wallet | `clawcard agent wallet` | LOW — x402 integration possible |
| Credential vault | `clawcard agent creds` | MEDIUM — store TikTok credentials securely |
| World ID verify | `clawcard agent verify` | HIGH — proof-of-human for platform verification |
| ERC-8004 identity | `clawcard agent identity` | LOW — on-chain identity for agent discovery |
| x402 discovery | `clawcard agent discover` | LOW — ecosystem discovery |

## Key Findings

### 1. SMS Capability
Clawcard `agent sms` command suggests agents get dedicated phone numbers that can receive SMS. This is exactly what's needed for TikTok phone verification. **Requires clawcard login + account setup to test.**

### 2. World ID Verification
`clawcard agent verify` offers World ID proof-of-human. TikTok may accept this as account verification in the future, but currently TikTok uses its own phone-based verification.

### 3. Credential Vault
`clawcard agent creds` could securely store TikTok API credentials (client key, client secret, access token) in an agent-accessible vault instead of `.env`.

### 4. Email
`clawcard agent emails` provides agent email addresses. TikTok registration requires either phone or email — this is a backup path.

## Blockers for Live Test

1. **clawcard login** — Requires browser-based OAuth (cannot be done headlessly by the agent)
2. **Account signup** — May require invite code (`clawcard signup`)
3. **Budget** — `clawcard agent fund` suggests agent operations may require USDC budget

## Recommended Next Steps

1. **Human action required:** Run `clawcard login` in a browser session to authenticate
2. **Then test:** `clawcard agent info --json` to see what phone/email is provisioned
3. **Then test:** `clawcard agent sms` to verify SMS reception capability
4. **If SMS works:** Attempt TikTok verification using the Clawcard phone number
5. **Document:** Whether the number is persistent (survives session resets) — critical for long-term TikTok auth

## Integration Path (if feasible)

```
TikTok sends SMS → Clawcard agent phone → clawcard agent sms →
scripts/tiktok-verify.ts reads code → completes verification
```

This would fully automate TikTok verification and unblock Sprint 508-BROWSER-01.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Clawcard number flagged by TikTok as VoIP | Medium | High | Test before committing to flow |
| Number not persistent | Low | Medium | Re-verify if needed |
| Clawcard downtime | Low | Low | Manual fallback always available |
| Cost per SMS | Unknown | Low | Check pricing after login |
