---
name: lossless-claw
version: 1.0.0
description: Lossless code editing skill for Kognai agents. Makes surgical edits to source files without unintended changes. Validates edit correctness via AST-aware diffing and rollback support.
---

# Lossless Claw

Precision code editing that guarantees no unintended changes to source files.

## When to Use

- Making targeted edits to existing code files
- Editing files >500 lines where full rewrite is risky
- When FP-007 (destructive rewrite) risk is present
- Multi-file refactoring requiring consistent changes

## Capabilities

### 1. Surgical Edit
- Find-and-replace with context validation
- Ensure old_string matches exactly before replacing
- Preserve indentation, line endings, encoding
- Verify no collateral damage via before/after diff

### 2. Multi-Edit Transaction
- Apply multiple edits to a file atomically
- Rollback all changes if any edit fails
- Preserve file backup before modification
- Report exact changes made

### 3. Safety Checks
- File size guard: refuse edits to files >2000 lines without explicit override
- Encoding preservation: detect and maintain file encoding
- Whitespace preservation: never modify lines not in the edit target
- Syntax validation: check file still parses after edit (TS/JS/Python)

## Usage

```bash
# Single edit
npx tsx skills/lossless-claw/edit.ts --file src/app.ts --find "old code" --replace "new code"

# Multi-edit from JSON
npx tsx skills/lossless-claw/edit.ts --file src/app.ts --edits edits.json

# Dry run (show diff without applying)
npx tsx skills/lossless-claw/edit.ts --file src/app.ts --find "old" --replace "new" --dry-run

# With backup
npx tsx skills/lossless-claw/edit.ts --file src/app.ts --find "old" --replace "new" --backup
```

## Safety

Lossless Claw enforces the FP-007 guard: files over 2000 lines trigger a warning. This prevents the destructive rewrite pattern where agents accidentally overwrite large files. Use `--force` to override (with backup created automatically).
