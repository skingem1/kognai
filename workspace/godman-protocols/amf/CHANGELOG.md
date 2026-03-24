# Changelog — @godman-protocols/amf

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.2.0] — 2026-04-14

### Added
- `createEnvelope(from, to, payload, options)` — create a signed AMF message envelope
- `verifyEnvelope(envelope, signingKey)` — verify envelope integrity and signature
- `buildTaskPayload(params)` — helper to build a typed `task` payload
- `buildResultPayload(params)` — helper to build a typed `result` payload
- `buildErrorPayload(params)` — helper to build a typed `error` payload
- `buildEventPayload(params)` — helper to build a typed `event` payload
- Envelope fields: `id`, `version`, `from`, `to`, `timestamp`, `contentType`, `payload`, `signature`
- HMAC-SHA256 signature covering canonical envelope content
- Smoke test: 11 assertions, all PASS (Sprint 970)
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

[0.2.0]: https://github.com/godman-protocols/amf/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/godman-protocols/amf/releases/tag/v0.1.0
