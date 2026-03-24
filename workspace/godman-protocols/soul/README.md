# SOUL — Constitutional Constraints and Safety

> **Status:** Skeleton — not published. Part of the Godman Protocols portfolio.

SOUL is an open protocol that provides Protocol for constitutional constraints and safety — encoding non-negotiable behavioural boundaries that agents must respect.

## Overview

| Property | Value |
|----------|-------|
| Version | 0.1.0-skeleton |
| License | Apache 2.0 |
| Namespace | `@godman-protocols/soul` |
| Runtime target | Node 20+ / Deno 1.40+ / Edge |

## Core Concepts

- **Constitution** —the root document defining immutable safety rules for an agent or swarm
- **Constraint** —a single enforceable rule within a Constitution (permit, deny, or require)
- **ComplianceCheck** —the result of evaluating an agent action against applicable Constraints
- **SafetyBreach** —a logged violation when an agent action fails a ComplianceCheck
- **ConstitutionChain** —a hierarchy of Constitutions (org → team → agent) with inheritance rules

## Repository Structure

```
soul/
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
