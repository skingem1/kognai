# PACT — ClaWHub Marketplace Listing

**Platform:** ClaWHub.com  
**Launch date:** April 14, 2026  
**Install command:** `npx skills add https://github.com/godman-protocols/pact`  

---

## Listing content

**Title:** PACT — Agent Coordination and Trust Protocol

**Category:** Infrastructure / Trust / Multi-Agent

**Tagline:** Give your agents verifiable cooperation agreements in 3 functions.

**Description:**

PACT is an open protocol for autonomous AI agents to establish verifiable cooperation agreements (Mandates), delegate authority with scoped permissions, and coordinate safely in multi-agent systems — without a human approving every inter-agent call.

**What it gives your agents:**
- Signed, scoped Mandates (who can do what, on which resources, up to what payment)
- Signature + expiry + revocation verification
- CoordinationFrame for grouping agents and their active mandates
- MandateRegistry (in-memory, with snapshot for persistence)

**Zero external dependencies.** Node 20+ / Deno 1.40+ / Edge compatible.

**Works with:**
- Clawcard (ERC-8004 identity — agents pass PACT trust verification on install)
- Invoica x402 (maxPaymentUsdc maps directly to x402 payment caps)
- Any OpenClaw agent

**Install:**
```
npx skills add https://github.com/godman-protocols/pact
```

**Links:**
- GitHub: github.com/godman-protocols/pact
- Docs: godman-protocols.dev/pact
- License: Apache 2.0

**Tags:** trust, coordination, multi-agent, mandates, x402, ERC-8004, TypeScript

---

## ClaWHub submission checklist

- [ ] GitHub repo public (April 14)
- [ ] README complete ✓ (Sprint 965)
- [ ] API docs complete ✓ (Sprint 965)
- [ ] `.openclaw` config present ✓ (Sprint 954)
- [ ] `.claude-plugin` config present ✓ (Sprint 954)
- [ ] `.cursor-plugin` config present ✓ (Sprint 954)
- [ ] `.codex` config present ✓ (Sprint 954)
- [ ] X thread posted ✓ (Sprint 966 draft)
- [ ] ClaWHub listing submitted (April 14 — human action)
- [ ] ClaWHub link added to README ✓ (after submission)
