# SIGNAL — Event Bus and Pub/Sub

> **Status:** Skeleton — not published. Part of the Godman Protocols portfolio.

SIGNAL is an open protocol that provides Protocol for event bus and pub/sub for agent swarms — enabling asynchronous, topic-based communication between agents.

## Overview

| Property | Value |
|----------|-------|
| Version | 0.1.0-skeleton |
| License | Apache 2.0 |
| Namespace | `@godman-protocols/signal` |
| Runtime target | Node 20+ / Deno 1.40+ / Edge |

## Core Concepts

- **Topic** —a named channel that agents can publish to or subscribe to
- **Event** —a timestamped, typed message published to a Topic
- **Subscription** —a binding between an agent and a Topic with optional filters
- **EventLog** —an append-only ledger of all Events on a Topic (retention-bounded)
- **DeliveryGuarantee** —the QoS level for event delivery (at-most-once, at-least-once, exactly-once)

## Repository Structure

```
signal/
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

- [ ] Core type definitions
- [ ] Reference implementation stubs
- [ ] TypeScript SDK (this repo)
- [ ] Python SDK
- [ ] Integration tests with PACT mandates
- [ ] x402 payment-gated operations

## Related Protocols

| Protocol | Purpose |
|----------|---------|
| PACT | Agent coordination and trust |
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
