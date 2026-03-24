# Changelog — @godman-protocols/pact

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.2.0] — 2026-04-14

### Added
- `createMandate(params)` — create a signed mandate with scope, TTL, and issuer
- `hashMandate(mandate)` — SHA-256 hash of canonical mandate content
- `signMandate(mandate, privateKey)` — HMAC-SHA256 signature on mandate hash
- `revokeMandate(mandate)` — mark mandate revoked with timestamp
- `verifyMandate(mandate, publicKey)` — full validity check (signature, TTL, revocation)
- `scopeCovers(mandate, action)` — scope membership check for delegated actions
- `CoordinationFrame` — multi-agent workflow lifecycle (open, close, abort, addParticipant)
- `MandateRegistry` — in-memory registry with revocation ledger and snapshot support
- Smoke test: 17 assertions, all PASS (Sprint 963–964)
- Full TypeScript types (types.ts, strict mode)
- `docs/api.md` — complete API reference (Sprint 965)

### Changed
- Package promoted from skeleton (v0.1.0) to working protocol

---

## [0.1.0] — 2026-03-24

### Added
- Repository skeleton: README, Apache 2.0 license, package.json, tsconfig.json
- Plugin configs: `.openclaw`, `.claude-plugin`, `.cursor-plugin`, `.codex`
- `src/index.ts` placeholder
- `src/types.ts` placeholder type definitions

---

[0.2.0]: https://github.com/godman-protocols/pact/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/godman-protocols/pact/releases/tag/v0.1.0
