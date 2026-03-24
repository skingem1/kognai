# Changelog — @godman-protocols/signal

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.2.0] — 2026-04-14

### Added
- `EventBus` class — in-memory pub/sub event bus
- `publish(topic, payload, options)` — publish event to topic with idempotency key support
- `subscribe(pattern, handler)` — subscribe to topic with glob pattern matching (`*`, `**`)
- `unsubscribe(subscriptionId)` — remove a subscription
- `getDeliveryReceipt(eventId)` — retrieve delivery confirmation for a published event
- `getHistory(topic)` — retrieve event history for a topic
- Idempotency deduplication: duplicate event IDs silently ignored
- Glob matching: `task.*` matches `task.started`, `task.completed`, `task.**` matches nested topics
- Smoke test: 12 assertions, all PASS (Sprint 968)
- Full TypeScript types, strict mode
- Zero external runtime dependencies (Node.js only)

### Changed
- Package promoted from skeleton (v0.1.0) to working protocol

---

## [0.1.0] — 2026-03-24

### Added
- Repository skeleton: README, Apache 2.0 license, package.json, tsconfig.json
- Plugin configs: `.openclaw`, `.claude-plugin`, `.cursor-plugin`, `.codex`
- `src/index.ts` placeholder

---

[0.2.0]: https://github.com/godman-protocols/signal/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/godman-protocols/signal/releases/tag/v0.1.0
