# DRS — Dynamic Resource Scheduling

> **Status:** Skeleton — not published. Part of the Godman Protocols portfolio.

DRS is an open protocol that provides Protocol for dynamic resource scheduling — allocating compute, memory, and model capacity across agent workloads in real time.

## Overview

| Property | Value |
|----------|-------|
| Version | 0.1.0-skeleton |
| License | Apache 2.0 |
| Namespace | `@godman-protocols/drs` |
| Runtime target | Node 20+ / Deno 1.40+ / Edge |

## Core Concepts

- **ResourcePool** —a named collection of compute or model capacity available for allocation
- **Allocation** —a granted slice of a ResourcePool bound to a specific agent task
- **SchedulingPolicy** —rules governing priority, preemption, and fair-share across agents
- **CapacityProbe** —a real-time measurement of available resources in a pool
- **AllocationReceipt** —confirmation that resources were reserved and for how long

## Repository Structure

```
drs/
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
