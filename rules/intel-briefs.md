# Intel Brief Rules — Kognai Rules Library

**Rule ID:** RULE-INTEL-001
**Source:** TICKET-021 — witcheer Mac Mini M4 operational lessons (Lessons 2, 3, 7)
**Author:** Chomsky (Prompt Engineer)
**Created:** 2026-03-28

---

## Pre-Research Mandate (Lesson 3)

Before Harvey or any agent begins a research task, the first action is:

```
READ ~/kognai/workspace/intel/intel-briefs.md
```

This is not optional. The index file contains:
- All existing intel briefs by ID and topic
- Staleness dates for each brief
- Known gaps and queued research tasks

Starting research without reading the index risks:
- Duplicating work already completed
- Contradicting conclusions from a more thorough prior brief
- Wasting API / LLM budget on redundant retrieval

**If the file does not exist, create it before proceeding.**

---

## Source Diversity Requirements (Lesson 2)

Every intel brief must draw from a **minimum of 3 independent sources**.

### What counts as a source:
- A specific URL from a news outlet, blog, GitHub repo, or documentation site
- An official product announcement or changelog page
- A peer-reviewed or preprint paper (arXiv, SSRN, etc.)
- A verified X/Twitter thread from a named, credible account

### What does NOT count as a single source:
- Two articles from the same publication (counts as 1)
- A Wikipedia article (may be cited as context, not as a primary source)
- An LLM's summarisation of a topic (not a source at all)
- A paywall article that was not accessed and read

### URL Verification Before Citing

Before including any URL in a brief:
1. Confirm the URL resolves and returns the claimed content
2. Record the access date in the brief
3. If a URL returns 404 or redirects to an unrelated page, remove the citation and find a replacement

**A cited URL that cannot be verified at time of writing must be flagged as `[UNVERIFIED]` and not used as a primary source.**

---

## Mandatory Write-Back Protocol (Lesson 2)

Research findings must always be saved. Memory-only research does not count.

### Storage path:

```
~/kognai/workspace/intel/INTEL-XXX.md
```

Where `XXX` is the next sequential number (zero-padded to 3 digits: INTEL-001, INTEL-002, etc.).

### Write-back must occur:
- Immediately after completing the research pass
- Before any downstream agent consumes the findings
- Before the session that produced the research ends

### After writing the file:
Update the index at `~/kognai/workspace/intel/intel-briefs.md` with:
- The new brief ID
- One-line topic summary
- Date created
- Staleness threshold date (today + 7 days)

**Research that was not written back is treated as if it never occurred.**

---

## Staleness Threshold (Lesson 7)

Any intel brief older than **7 days** is considered stale and must be re-researched before use in:
- Sprint planning decisions
- Architecture amendments
- Competitive positioning statements
- Any external-facing content (X posts, launch copy, manifesto)

### Stale context rule:

Agents must never reuse conclusions from a stale brief without first:
1. Checking whether the source URLs have been updated since the brief was written
2. Running a targeted gap-check query to identify any material developments in the intervening period
3. Updating the brief with a `## Update — YYYY-MM-DD` section before using it

**Passing stale context to a downstream agent without re-verification is a constitutional violation under the staleness rule.**

---

## Intel Brief Format

Every file at `~/kognai/workspace/intel/INTEL-XXX.md` must follow this structure:

```markdown
# INTEL-XXX: [Topic Title]

**Created:** YYYY-MM-DD
**Expires:** YYYY-MM-DD (created + 7 days)
**Status:** FRESH | STALE | SUPERSEDED
**Sources:** [count — minimum 3]

---

## Summary

[2-4 sentence executive summary of the key finding]

## Findings

### [Finding 1 Title]
[Detail. Source: [Title](URL) — accessed YYYY-MM-DD]

### [Finding 2 Title]
[Detail. Source: [Title](URL) — accessed YYYY-MM-DD]

### [Finding 3 Title]
[Detail. Source: [Title](URL) — accessed YYYY-MM-DD]

## Kognai Implications

[Direct relevance to current sprint, architecture, or competitive position]

## Open Questions

- [Any unresolved items requiring follow-up]

## Change Log

| Date | Change | Author |
|------|--------|--------|
| YYYY-MM-DD | Initial version | [agent] |
```

---

## Index File Format

`~/kognai/workspace/intel/intel-briefs.md` maintains a running index:

```markdown
# Intel Briefs Index

| ID | Topic | Created | Expires | Status |
|----|-------|---------|---------|--------|
| INTEL-001 | ... | YYYY-MM-DD | YYYY-MM-DD | FRESH |
```

---

## Related Rules

- `RULE-THINK-001` — Thinking mode limits (research tasks are a common source of /think overuse)
- `RULE-SESSION-001` — Stale context re-verification requirement (extends staleness rule to session memory)

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-28 | Initial version — TICKET-021 | Chomsky |
