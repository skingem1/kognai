# AMF — Agent Message Format

> **Status:** Skeleton — not published. Part of the Godman Protocols portfolio.

AMF is an open protocol that provides Protocol for structured agent-to-agent messaging — a canonical envelope format for inter-agent communication across runtimes.

## Overview

| Property | Value |
|----------|-------|
| Version | 0.1.0-skeleton |
| License | Apache 2.0 |
| Namespace | `@godman-protocols/amf` |
| Runtime target | Node 20+ / Deno 1.40+ / Edge |

## Core Concepts

- **Envelope** —the outermost container for an AMF message with routing and auth metadata
- **Payload** —the typed content body of a message (text, JSON, binary reference)
- **RoutingHeader** —source, destination, hop count, and TTL fields
- **MessageSchema** —a versioned schema definition that payloads must conform to
- **DeliveryReceipt** —an acknowledgement or rejection from the receiving agent

## Repository Structure

```
amf/
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
