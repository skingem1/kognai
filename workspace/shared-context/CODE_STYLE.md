# Kognai Code Style Guide
**Ported from Invoica Week 74 + Kognai-specific rules**
All engineering agents must follow this. Guardiola enforces it.

---

## TypeScript Standards
- `strict: true` always — no exceptions
- `prefer const` over `let`. Never `var`.
- Explicit types on all function parameters and return values
- No `any` — use `unknown` then narrow, or define a proper interface
- No non-null assertions (`!`) unless you can explain why in a comment

## Naming Conventions
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces/Types: `PascalCase` — prefix interfaces with `I` only if needed to disambiguate
- Boolean variables: `isX`, `hasX`, `canX`, `shouldX`

## File Size Limits (Kognai Rule)
- Standard module: max 150 lines
- Test file: max 200 lines
- Runner/orchestrator: max 100 lines
- Justification comment required if over limit: `// SIZE_EXCEPTION: reason`
- **One responsibility per file.** If it's getting long, split it.

## Error Handling
```typescript
class KognaiError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'KognaiError';
  }
}

// Always try-catch async operations
try {
  await someAsyncOperation();
} catch (error) {
  if (error instanceof KognaiError) {
    // handle known
  }
  throw error; // re-throw unknown — never swallow
}
```

## Documentation
- JSDoc on ALL public exports (functions, classes, interfaces)
- Include `@param`, `@returns`, `@throws`
- Short inline comments on non-obvious logic
- No comments restating what the code obviously does

## Testing
- Jest or Vitest — either is fine, pick one per project and stick to it
- Test file co-located: `src/foo.ts` → `src/__tests__/foo.test.ts` or `src/foo.test.ts`
- Descriptive names: `should return empty array when no items match score threshold`
- `beforeEach`/`afterEach` cleanup — never leave test state leaking
- Mock external APIs (Supabase, fetch) — tests must run offline

## HTTP / External Calls
- Use `fetch()` — no axios, no got, no node-fetch
- Always set timeout: `AbortController` with 30s for external calls
- Always handle 429 (rate limit): sleep + retry with exponential backoff
- Never hardcode URLs — use env vars or constants at top of file

## Environment Variables
- Load via `dotenv` at entry point only — never inside modules
- Module receives config as function parameter, not process.env directly
- Document required env vars in module JSDoc: `@requires SUPABASE_URL, SUPABASE_ANON_KEY`

## Kognai-Specific Rules
- **TASK_TARGET awareness**: if a function handles sensitive data → `task_target: local` only
- Never log API keys, passwords, or Tailscale IPs — even in debug mode
- Supabase: always use `upsert` with `onConflict` when re-running scripts — idempotent
- File paths in deliverables: always absolute (`/Users/tarekmnif/kognai/...`)
- No `console.log` in production modules — use a logger or remove before commit

## File Organization (Kognai Project Structure)
```
workspace/
├── tools/           # Runnable scripts and scrapers
│   └── ia-scraper/  # Internet Archive scraper (Phase 1)
│       ├── src/     # Source files
│       └── package.json
├── agents/          # Agent workspaces (SOUL.md, IDENTITY.md, memory/)
├── sprints/         # Sprint JSON files (sprint-NNN.json)
├── intel/           # Outputs: trends, tiktok-briefs, ops-reports
└── shared-context/  # This file, THESIS.md, AGENTS.md shared references
```

---
*Last updated: 2026-03-05 · Source: Invoica shared/code-style-guide.md + Kognai extensions*
