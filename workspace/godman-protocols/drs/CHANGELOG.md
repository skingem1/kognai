# Changelog — @godman-protocols/drs

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.2.0] — 2026-04-14

### Added
- `ResourceScheduler` class — manages named resource pools with allocation, release, and preemption
- `createPool(params)` — define a resource pool with capacity and priority tier
- `allocate(scheduler, request)` — allocate a resource slot with TTL and priority
- `release(scheduler, allocationId)` — release an allocation back to the pool
- `preempt(scheduler, allocationId)` — forcibly reclaim an allocation (higher-priority demand)
- `getPoolStatus(scheduler, poolName)` — retrieve current pool utilization and allocation list
- Automatic expiry: allocations exceeding TTL are evicted on next operation
- Priority-aware eviction: lowest-priority allocations evicted first under pressure
- Smoke test: 12 assertions, all PASS (Sprint 971)
- Full TypeScript types, strict mode
- Zero external runtime dependencies (Node.js only)

### Changed
- Package promoted from skeleton (v0.1.0) to working protocol (final of 7 Godman Protocols)

---

## [0.1.0] — 2026-03-24

### Added
- Repository skeleton: README, Apache 2.0 license, package.json, tsconfig.json
- Plugin configs: `.openclaw`, `.claude-plugin`, `.cursor-plugin`, `.codex`
- `src/index.ts` placeholder

---

[0.2.0]: https://github.com/godman-protocols/drs/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/godman-protocols/drs/releases/tag/v0.1.0
