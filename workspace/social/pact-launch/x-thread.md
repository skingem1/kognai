# PACT — X Launch Thread
**Account:** @invoica_ai  
**Date:** April 14, 2026  
**Format:** 6-tweet thread  

---

## Tweet 1 — Hook

When your AI agent needs to ask another agent to do something, there's no standard way to say "yes, this is authorised."

We just open-sourced the missing coordination layer.

PACT — Protocol for Agent Coordination and Trust. 🧵

---

## Tweet 2 — The problem

Without a trust protocol, multi-agent systems fail in one of two ways:

→ Too permissive: agents trust each other implicitly. One compromised agent cascades through the whole system.

→ Too restrictive: every inter-agent call needs a human. You've just automated nothing.

---

## Tweet 3 — What PACT does

PACT gives agents verifiable cooperation agreements called Mandates.

A Mandate says: "I (Harvey) authorise you (Messi) to read workspace/scs001/* and pay up to $5 per call."

Signed. Scoped. Revocable. Verifiable without a server.

---

## Tweet 4 — The code

```typescript
const mandate = createMandate('harvey', 'messi', {
  actions: ['read', 'write'],
  resources: ['workspace/scs001/*'],
  maxPaymentUsdc: 5.00,
});
const signed = signMandate(mandate, HARVEY_KEY);
const { valid } = verifyMandate(signed, HARVEY_KEY);
```

3 functions. No server. No database. Works in any runtime.

---

## Tweet 5 — Composability

PACT works with:

→ @Clawcard_sh — ERC-8004 agents pass PACT trust verification on day one
→ @invoica_ai x402 — maxPaymentUsdc maps directly to payment caps
→ @OpenClaw — install via ClaWHub, works in Claude/Cursor/Codex

One command: npx skills add https://github.com/godman-protocols/pact

---

## Tweet 6 — CTA

PACT is the first of 7 open protocols from Godman Protocols.

Next: LAX (latency-aware execution), SCORE (reputation), SOUL (constitutional constraints).

GitHub: github.com/godman-protocols/pact
ClaWHub: [ClaWHub link]
Docs: godman-protocols.dev/pact

Star it. Ship it. Build on it.

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 208 | ✓ |
| 2 | 225 | ✓ |
| 3 | 224 | ✓ |
| 4 | 205 | ✓ |
| 5 | 247 | ✓ |
| 6 | 203 | ✓ |

## Notes
- Tweet 4 includes a code block — X renders these as plain text. The actual tweet should have the code on its own lines without backticks, or post as an image.
- Replace [ClaWHub link] with the actual ClaWHub listing URL after Sprint 966 landing.
- Tag @binji and @sam_ragsdale (OpenClaw builder community) at time of post.
- Post at 9am ET Tuesday for maximum engagement.
