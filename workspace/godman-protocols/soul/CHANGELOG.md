# Changelog — @godman-protocols/soul

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.2.0] — 2026-04-14

### Added
- `createConstitution(params)` — define a constitutional ruleset with allow/deny rules and kill switches
- `signConstitution(constitution, key)` — HMAC-SHA256 signature on constitution hash for tamper detection
- `evaluateAction(constitution, action, context)` — enforce deny-before-allow-before-default-deny policy
- `checkKillSwitches(constitution, metrics)` — evaluate active kill switch triggers against runtime metrics
- `createAudit(constitution, action, result)` — immutable, signed audit entry for every enforcement decision
- Kill switch support: memory threshold, view-rate, approval-rate, ban detection
- Evaluation order: DENY rules first, then ALLOW, then default-deny (safe by default)
- Smoke test: 11 assertions, all PASS (Sprint 969)
- Full TypeScript types, strict mode
- Zero external runtime dependencies (Node.js only)

### Changed
- Package promoted from skeleton (v0.1.0) to working protocol

### Security
- All constitutional decisions produce a signed audit log
- Constitutions are hash-signed to detect tampering
- Default evaluation result is DENY when no explicit rule matches

---

## [0.1.0] — 2026-03-24

### Added
- Repository skeleton: README, Apache 2.0 license, package.json, tsconfig.json
- Plugin configs: `.openclaw`, `.claude-plugin`, `.cursor-plugin`, `.codex`
- `src/index.ts` placeholder

---

[0.2.0]: https://github.com/godman-protocols/soul/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/godman-protocols/soul/releases/tag/v0.1.0
