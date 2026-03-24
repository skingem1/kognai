# LAX — Latency-Aware Execution

> **Status:** Skeleton — not published. Part of the Godman Protocols portfolio.

LAX is an open protocol that provides Protocol for latency-aware execution scheduling — optimising agent task routing based on real-time latency metrics and SLA constraints.

## Overview

| Property | Value |
|----------|-------|
| Version | 0.1.0-skeleton |
| License | Apache 2.0 |
| Namespace | `@godman-protocols/lax` |
| Runtime target | Node 20+ / Deno 1.40+ / Edge |

## Core Concepts

- **LatencyBudget** —a time-bounded execution envelope for agent tasks
- **ExecutionSlot** —a scheduled window on a specific runtime with known latency characteristics
- **SLAContract** —latency and throughput guarantees between agent and runtime
- **RoutingDecision** —the outcome of the LAX scheduler selecting a runtime for a task
- **LatencyProbe** —a periodic measurement of round-trip time to a runtime endpoint

## Repository Structure

```
lax/
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
