# Changelog — @godman-protocols/sdk

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.2.0] — 2026-04-14

### Added
- Unified re-export of all 7 Godman Protocols: PACT, LAX, SCORE, SIGNAL, SOUL, AMF, DRS
- Cross-protocol TypeScript types and namespaced exports
- `bin/demo.ts` — `npx godman-demo` CLI: runs a 7-step live agent workflow end-to-end
  - Step 1: SOUL — create and sign constitution
  - Step 2: PACT — create and sign mandate
  - Step 3: PACT — evaluate mandate (verify + scope check)
  - Step 4: AMF — wrap mandate in signed envelope
  - Step 5: DRS — allocate compute resource slot
  - Step 6: LAX — route task within latency budget
  - Step 7: SCORE — evaluate output; SIGNAL — publish completion event
- `examples/agent-workflow.ts` — annotated reference implementation
- Full TypeScript build: `npm run build` → `dist/` (tsc, NodeNext modules)
- Zero external runtime dependencies (protocols use Node.js crypto only)

### Changed
- `dependencies` use `^0.2.0` of all 7 protocols (replace `file:../` for npm publish)
- Package promoted from scaffold to production SDK

---

## [0.1.0] — 2026-03-24

### Added
- Repository skeleton: README, Apache 2.0 license, package.json, tsconfig.json
- Plugin configs: `.openclaw`, `.claude-plugin`, `.cursor-plugin`, `.codex`
- `src/index.ts` placeholder

---

[0.2.0]: https://github.com/godman-protocols/sdk/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/godman-protocols/sdk/releases/tag/v0.1.0
