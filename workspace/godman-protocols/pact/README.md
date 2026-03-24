# PACT — Protocol for Agent Coordination and Trust

> **Status:** Skeleton — not published. Part of the Godman Protocols portfolio.

PACT is an open protocol that enables autonomous AI agents to establish verifiable cooperation agreements, delegate authority, and coordinate across heterogeneous runtimes.

## Overview

| Property | Value |
|----------|-------|
| Version | 0.1.0-skeleton |
| License | Apache 2.0 |
| Namespace | `@godman-protocols/pact` |
| Runtime target | Node 20+ / Deno 1.40+ / Edge |

## Core Concepts

- **Mandate** — a signed, scoped delegation from one agent to another
- **Trust Anchor** — a verifiable root of authority (DID, x402 wallet, or org key)
- **Coordination Frame** — a shared execution context for multi-agent tasks
- **Revocation Ledger** — append-only log of invalidated mandates

## Repository Structure

```
pact/
├── README.md
├── LICENSE
├── package.json
├── src/
│   ├── index.ts          # Public API surface
│   └── types.ts          # Core type definitions
├── .claude-plugin        # Claude Code integration (INTEL-005)
├── .cursor-plugin        # Cursor IDE integration (INTEL-005)
├── .codex               # Codex integration (INTEL-005)
└── .openclaw            # ClaWHub / OpenClaw integration (INTEL-005)
```

## Roadmap

- [ ] Mandate schema (EIP-712 compatible)
- [ ] Trust Anchor resolution
- [ ] Coordination Frame lifecycle
- [ ] Revocation Ledger (append-only, Supabase or IPFS)
- [ ] x402 payment-gated mandate execution
- [ ] TypeScript SDK (this repo)
- [ ] Python SDK
- [ ] Reference runtime implementation

## Related Protocols

| Protocol | Purpose |
|----------|---------|
| PACT | Agent coordination and trust (this repo) |
| LAX | Latency-aware execution scheduling |
| SCORE | Scoring and reputation for agent outputs |
| AMF | Agent Message Format |
| DRS | Dynamic Resource Scheduling |
| SOUL | Constitutional constraints and safety |
| SIGNAL | Event bus and pub/sub for agent swarms |

## Contributing

Not open for contributions yet. Skeleton phase — internal design only.

## License

Apache License 2.0 — see [LICENSE](./LICENSE)
