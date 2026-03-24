# SCORE — Scoring and Reputation

> **Status:** Skeleton — not published. Part of the Godman Protocols portfolio.

SCORE is an open protocol that provides Protocol for scoring and reputation of agent outputs — enabling trust-weighted evaluation across heterogeneous agent swarms.

## Overview

| Property | Value |
|----------|-------|
| Version | 0.1.0-skeleton |
| License | Apache 2.0 |
| Namespace | `@godman-protocols/score` |
| Runtime target | Node 20+ / Deno 1.40+ / Edge |

## Core Concepts

- **ScoreCard** —an immutable evaluation record for a single agent output
- **ReputationProfile** —an aggregate trust score derived from historical ScoreCards
- **Evaluator** —an agent or function authorised to issue ScoreCards
- **ScoreDimension** —a named axis of evaluation (accuracy, latency, cost, safety)
- **ReputationDecay** —a time-weighted function that reduces stale reputation signals

## Repository Structure

```
score/
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
