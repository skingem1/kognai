---
name: context-compressor
version: 1.0.0
description: Context window compression skill for Kognai agents. Reduces context size for long conversations and large codebases while preserving critical information for task completion.
---

# Context Compressor

Compresses conversation context and file contents to fit within model context windows.

## When to Use

- Context window approaching limit (>80% full)
- Loading large files that exceed model capacity
- Multi-turn conversations accumulating context
- Before routing to smaller models (Tier 0/1)

## Capabilities

### 1. Conversation Compression
- Summarize earlier turns into key facts
- Preserve tool call results as condensed state
- Keep recent turns verbatim, compress older ones
- Maintain critical decisions and constraints

### 2. File Compression
- Extract relevant sections from large files
- Summarize code structure (functions, classes, exports)
- Keep imports and type signatures, compress bodies
- Preserve comments that explain WHY (not HOW)

### 3. Smart Truncation
- Priority-based: keep most relevant content
- Recency bias: recent content more important
- Task-aware: preserve content related to current task
- Reference preservation: keep file paths and line numbers

## Usage

```bash
# Compress a conversation context file
npx tsx skills/context-compressor/compress.ts --file context.json --target 4000

# Compress a source file for context
npx tsx skills/context-compressor/compress.ts --code src/large-file.ts --target 500

# Compress text input
npx tsx skills/context-compressor/compress.ts --text "..." --target 1000
```

## Output

Returns compressed text + metrics:
- Original size (tokens)
- Compressed size (tokens)
- Target size (tokens)
- Compression ratio
- What was preserved vs dropped
