# Codebook Compression Log

## Purpose

Track context compression events — when and how much context was saved by using codebook symbols vs full terms.

## Format

| Date | Session | Agent | Original Tokens | Compressed Tokens | Ratio | Notes |
|------|---------|-------|----------------|-------------------|-------|-------|
| 2026-03-10 | bootstrap | harvey | — | — | — | Codebook initialized (v0.1.0, 34 symbols) |

## Guidelines

- Log entries when compressed context saves >10% tokens
- Ratio = compressed_tokens / original_tokens (lower is better)
- Agent column: which agent performed the compression
- Only log meaningful compressions — skip trivial single-symbol uses

## Symbol Registry Stats

- **v0.1.0** (2026-03-10): 34 symbols defined
- Target compression ratio: 0.40 (60% reduction)
- Next review: after first real session using symbols
