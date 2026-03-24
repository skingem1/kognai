# Changelog — @godman-protocols/score

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.2.0] — 2026-04-14

### Added
- `createRubric(params)` — define a scoring rubric with named criteria and weights
- `evaluate(rubric, output)` — score agent output against rubric criteria, weighted average
- `calculateReputation(history)` — compute exponentially-weighted reputation score from evaluation history
- `createAuditEntry(params)` — immutable audit record for each evaluation decision
- Smoke test: 10 assertions, all PASS (Sprint 967)
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

[0.2.0]: https://github.com/godman-protocols/score/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/godman-protocols/score/releases/tag/v0.1.0
