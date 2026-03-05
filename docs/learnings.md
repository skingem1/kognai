# Invoica — Project Learnings & Key Insights

This file captures hard-won lessons from building and operating the 13-agent orchestrator.
**All agents (especially Skills) must read this before creating new skills, agents, or tasks.**

---

## 0. Deployment Architecture — CRITICAL (Read First)

### Hetzner Server Is Now Self-Deploying (2026-03-01)

`git-autodeploy` runs every 5 minutes via PM2 cron on the Hetzner server.
It polls GitHub, pulls new commits automatically, and restarts affected services.

**What this means for agents:**
- Committing to `main` on GitHub is sufficient to deploy — **no manual `git pull` on the server needed**
- Backend fixes: commit → auto-deploys within 5 minutes
- `telegram-bot.ts` fixes: commit → auto-restarts within 5 minutes
- `ecosystem.config.js` changes: still require manual `pm2 reload` on server (logged as WARNING by autodeploy)

### Deployment Map (authoritative)

| What changed | How it deploys | Time |
|-------------|----------------|------|
| `website/` or `app/` | Vercel auto-deploy on push to main | ~1 min |
| `docs-site/` | Mintlify auto-deploy on push to main | ~2 min |
| `backend/` | git-autodeploy cron on Hetzner | ~5 min |
| `scripts/telegram-bot.ts` | git-autodeploy cron on Hetzner | ~5 min |
| `scripts/heartbeat-daemon.ts` | Picks up on next hourly cron fire | ~60 min max |
| `ecosystem.config.js` | **Manual only** — alert owner | Manual |
| `agents/` YAML/prompts | openclaw-gateway reads on next restart | Next restart |

**Never tell the owner "it's deployed" until the commit is on GitHub main.**

---

## 1. MiniMax M2.5 — Token & Capability Limits

### Output Truncation (~4500 tokens max)
- MiniMax M2.5 reliably truncates output around 4500 tokens, even when `max_tokens: 16000`
- Files get cut off mid-function, producing incomplete code that Claude always catches
- **Fix**: Generate ONE file per API call. Never ask MiniMax to produce multiple files in a single request
- One-file-per-call keeps each response under the truncation limit and produces complete code

### Task Complexity vs Model Capability
- **Simple, well-scoped tasks pass on first attempt** (92/100 score)
- **Complex tasks with multiple concerns fail repeatedly** even with retries
- A health check with Redis + DB + error types was too ambitious → rejected 3x
- The same health check simplified to just status/uptime/version → approved first try (92/100)

### Task Decomposition Rules (CRITICAL)
When creating tasks for MiniMax coding agents:
1. **One concern per file** — don't mix DB checks, Redis checks, and HTTP routing in one file
2. **Max 200 lines per file** — if a file needs more, split the task
3. **Explicit function signatures** — tell MiniMax exactly what to export
4. **No "include comprehensive X"** — be prescriptive, not aspirational
5. **Avoid vague requirements** — "complete error handling" means nothing; specify which errors to handle

### Effective Prompt Patterns for MiniMax
```
✅ GOOD: "Create a function checkHealth() that returns { status: 'healthy', uptime: process.uptime() }"
❌ BAD: "Create a health check endpoint with comprehensive error handling and all edge cases"

✅ GOOD: "Export function validateVAT(countryCode: string, vatNumber: string): Promise<boolean>"
❌ BAD: "Build a VAT validation module with all EU countries support"
```

---

## 2. Rejection Feedback Loop

### How It Works
- When Claude Supervisor rejects code, the review (score, issues, summary) is passed back to MiniMax on the next retry
- MiniMax sees the specific issues and can address them
- Implemented via `previousReview` parameter in `CodingAgent.execute()`

### What Helps
- Explicit issue descriptions make MiniMax fix the right things
- Listing severity levels helps MiniMax prioritize

### What Doesn't Help
- MiniMax sometimes overcorrects on retry #3, producing less code instead of more
- After 2 rejections, MiniMax may "simplify" the approach (39 lines instead of 241)
- **Learning**: If retry #2 fails, the task itself is probably too complex — decompose it

---

## 3. Claude Supervisor — Review Patterns

### What Claude Catches Every Time
- Truncated/incomplete files (missing function bodies, cut-off mid-line)
- Missing exports that tests import
- Missing error handling on endpoints
- Type mismatches between module and tests

### Typical Score Ranges
- **90-100**: Complete, well-structured code with proper types and tests
- **60-70**: Structurally OK but missing implementations or truncated
- **30-50**: Fundamentally incomplete — missing core functionality
- **0-30**: File is mostly scaffolding with no real logic

### Review Takes ~10-12 seconds
- Budget 10-12s per review in timing estimates
- Claude Sonnet via Anthropic API direct (no ClawRouter overhead)

---

## 4. Orchestrator Architecture Lessons

### Process Management (PM2)
- Use `--no-autorestart` for one-shot sprint runs — otherwise PM2 loops forever
- Always reset stale `in_progress` tasks on startup (from previous crashed runs)
- PM2 is the only reliable way to run long-lived processes in WSL
- `nohup`, `setsid`, `screen` all die when WSL session closes

### Git Integration
- `git revert HEAD --no-edit` between retry attempts keeps history clean
- `git add -A && git commit` per file generation works for tracking
- Revert can fail if there's nothing to revert — always catch and continue

### Cost Tracking
- MiniMax M2.5: ~$0.09/task for simple tasks (one-file-per-call)
- Claude Sonnet review: ~$0.03-0.05/review (3000-4000 tokens)
- CEO assessment: ~$0.02-0.03/assessment
- Full pipeline (CEO + MiniMax code + Claude review): ~$0.15/task
- Failed retries multiply cost: 3 rejections = ~$0.45/task with no deliverable

---

## 5. API Integration Notes

### Anthropic Messages API (Claude)
- Different format from OpenAI — uses `x-api-key` header, not `Authorization: Bearer`
- `anthropic-version: 2023-06-01` header required
- `system` field is top-level (not in messages array)
- Response: `content[].text` not `choices[].message.content`
- API credits are separate from claude.ai Pro subscription
- Must purchase at console.anthropic.com → Settings → Billing

### MiniMax API
- OpenAI-compatible format (standard messages array)
- Authorization: `Bearer {key}`
- Token counting via `usage.total_tokens` in response
- Rate limiting: 1 second pause between calls is sufficient

---

## 6. Skills Agent — Guidelines for New Skills

### Before Creating a New Skill
1. Check if the task can be decomposed for existing agents first
2. Verify the target model can handle the complexity (see token limits above)
3. Test with a minimal prototype before building full skill

### Skill Sizing Rules
- Each skill should do ONE thing well
- Input/output should be clearly typed
- Timeout should match expected API response time
- Include retry logic for external API calls
- Never bundle multiple API calls in one skill unless they're sequential dependencies

### When to Create a New Agent vs Skill
- **New Skill**: Existing agent needs a specific tool (e.g., VAT lookup, PDF generation)
- **New Agent**: Need fundamentally different expertise that no current agent covers
- **Neither**: Task can be solved by better decomposition of existing sprint tasks

---

## 7. WSL + Desktop Commander Quirks

### File Operations
- `edit_block` fails silently on files with template literals (backtick-heavy TypeScript)
- Reports success but doesn't modify the file — always verify with `read_file` after editing
- **Workaround**: Use `write_file` with `mode: rewrite` + `mode: append` chunks instead
- PowerShell `Copy-Item` to UNC WSL paths (`\\wsl$\...`) sometimes silently fails
- Desktop Commander `write_file` directly to `\\wsl$\...` paths works reliably

### Command Execution
- Nested double quotes in `wsl.exe -e /bin/bash -c "..."` break with `unexpected EOF`
- **Workaround**: Write a .sh script to WSL `/tmp/`, then execute `wsl.exe -e /bin/bash /tmp/script.sh`
- WSL commands > 1 second via Git Bash fail with EPERM


## 8. CTO Agent Pattern — Research Agent with Approval Gate

### Architecture
- **CTO agent** runs on MiniMax M2.5 (cost-effective for research/scanning tasks)
- CTO monitors the OpenClaw ecosystem: GitHub releases, ClawHub skills, model pricing, new tools
- CTO produces structured **improvement proposals** (JSON) — never implements directly
- **CEO (Claude)** reviews proposals and APPROVES / REJECTS / DEFERS each one
- Only after CEO approval does implementation happen — this prevents hallucinated "improvements"

### Why This Works
- MiniMax is cheap (~$0.05/scan) for research/monitoring — doesn't need Claude-level reasoning
- Claude (CEO) acts as quality gate — catches proposals that don't make sense
- Structured JSON output makes proposals machine-parseable for future automation
- Separation of concerns: CTO researches, CEO decides, coding agents implement

### Key Design Decisions
- CTO runs AFTER sprint execution (Phase 3) — doesn't block productive work
- CTO proposals are non-blocking — if CTO scan fails, orchestrator continues
- CEO daily report includes CTO proposals for owner visibility
- Cascade protocol: approved changes propagate as company-wide orders

### Orchestrator Flow (10-Agent, 6-Phase)
1. CEO initial assessment → 2. Sprint execution (MiniMax code + Claude review) → 3. CTO technology scan → 4. CEO reviews CTO proposals → 5. CEO final assessment → 6. Daily report generation

### Cost Impact
- CTO scan: ~$0.05/run (one MiniMax call)
- CEO CTO review: ~$0.03/run (one Claude call)
- CEO daily report: ~$0.03/run (one Claude call)
- Total CTO pipeline overhead: ~$0.11/run

## 9. Git Revert vs Reset in Retry Loop

### Problem
Using `git revert HEAD --no-edit` in the rejection retry loop creates a revert commit. On the next rejection, `git revert HEAD` tries to revert the revert, causing merge conflicts and crashing the orchestrator.

### Fix
Use `git reset --hard HEAD~1` instead. This cleanly drops the last commit without creating a new one. No conflict risk on subsequent retries.

### Retry Limits
- Original: MAX_RETRIES = 3 — too few, tasks get abandoned
- Updated: MAX_RETRIES = 10 — keep retrying with feedback until approved
- Each retry passes the Supervisor's rejection feedback to MiniMax so it can fix the specific issues

---

## 10. Week 3 Sprint Insights — Retry Effectiveness Data

### Results: 3/3 Tasks Approved (100% completion with retries)
| Task | Attempts | Final Score | Key Pattern |
|------|----------|-------------|-------------|
| BC-010 (currency formatter) | 1 | 92/100 | Simple utility → first-try pass |
| SEC-010 (audit logger) | 4 | 92/100 | Express middleware → needed feedback iterations |
| FE-010 (StatusBadge React) | 7 | 92/100 | React/TSX → MiniMax struggles with JSX output |

### MiniMax + React/JSX = Problematic
- MiniMax M2.5 scored **15/100** on first 4+ attempts for the React component
- It output comments/descriptions of what code should look like instead of actual JSX
- The retry feedback loop eventually forced correct output on attempt 7
- **Takeaway**: Expect 5-7 attempts for React/TSX tasks. Consider even simpler React tasks or adding explicit "output valid JSX, not comments" to prompts

### Retry ROI Analysis
- 12 total MiniMax calls × ~$0.09 = ~$1.08 coding cost
- 12 Claude reviews × ~$0.04 = ~$0.48 review cost
- Total: ~$1.73 for 3 deliverables = **~$0.58/approved task**
- Without retries (MAX_RETRIES=3): 0/4 tasks completed in first run = $0.00 ROI
- With retries (MAX_RETRIES=10): 3/3 tasks completed = positive ROI
- **Conclusion**: Higher retry limit is always better. Cost of retries << cost of abandoned work

### CTO Scan Output Issue
- MiniMax `<think>` tags leak into CTO response body
- CEO can't parse incomplete/malformed proposals
- **Fix needed**: Strip `<think>...</think>` tags from MiniMax responses before processing
- Or add response cleaning in CTOAgent.checkForImprovements()

### Task Complexity Sweet Spot for MiniMax
- **Pure utility functions** (no framework): 1 attempt (BC-010)
- **Express middleware** (familiar pattern): 2-4 attempts (SEC-010)
- **React components** (JSX output): 5-7 attempts (FE-010)
- **Multi-concern endpoints** (DB + validation + routing): 3+ failures, often abandoned
- **Rule**: If a task touches a framework MiniMax is weak at, budget for 5+ retries

---

## 11. Test Truncation Fix — The #1 Blocker (Week 4)

### The Problem
MiniMax M2.5 systematically truncates test files. Every task with tests in week-4 sprint v1 failed 10/10 attempts (BC-020, BC-021) solely because test files exceeded MiniMax's ~4500 token output limit. The Supervisor correctly rejected truncated files (score: 25-75 every time).

### The Numbers (Before vs After)
| Metric | Before Fix | After Fix |
|--------|-----------|-----------|
| Test file size | 8,000-16,600 chars | 1,700-2,400 chars |
| Test gen time | 40-80 seconds | 13-16 seconds |
| BC-020 result | FAILED 10/10 | APPROVED attempt 1 (92/100) |
| BC-021 result | FAILED 8/10+ | APPROVED attempt 1 (92/100) |
| Sprint cost | ~$5+ (all wasted) | ~$0.36 |
| Sprint time | 30+ min (stopped early) | 232.6 seconds |

### The Fix
Added explicit test size constraints to the CodingAgent prompt when generating test files:
```
CRITICAL: TEST FILE SIZE LIMIT
Maximum 5-6 test cases. Maximum 80 lines total.
Cover: happy path, error case, edge case, defaults — that's it.
```

### Why It Works
- MiniMax reliably produces complete output under ~2500 tokens
- 5-6 focused test cases cover core behaviors without verbosity  
- Forcing brevity eliminates redundant tests and verbose setup
- 80-line limit keeps files well under the 4500-token truncation threshold

### Key Takeaway
**When MiniMax truncation is the bottleneck, constrain the output size in the prompt.** Don't try to make MiniMax produce more — make it produce less, better.

---

## 12. Week 5 Sprint — Source File Truncation is the New Blocker

### Results: 3/5 Tasks Approved (60% completion, 88% rejection rate)
| Task | Attempts | Final Score | Result | Root Cause |
|------|----------|-------------|--------|------------|
| SDK-010 (SDK client class) | 10 | 25 | FAILED | Source file truncated every attempt — class with 3 methods too big |
| SDK-011 (SDK types) | 2 | 92 | APPROVED | Pure interfaces — simple, short |
| BC-030 (webhook dispatcher) | 10 | 35 | FAILED | Source file truncated — class + crypto + HTTP too complex |
| FE-030 (ApiKeyDisplay) | 1 | 92 | APPROVED | React component, 32 lines |
| SEC-020 (webhook-verify) | 1 | 92 | APPROVED | Middleware + utility function — well-scoped |

### The Pattern: Source Files Hit the Same ~4500 Token Truncation
We fixed test truncation in Section 11, but **source files have the exact same problem**:
- SDK-010 `client.ts`: MiniMax writes interfaces + error classes → runs out of tokens before the actual `CountableClient` class
- BC-030 `webhook-dispatcher.ts`: MiniMax writes types + register() → runs out before dispatch() and verifySignature()
- Both tasks consistently produce 6000-16000 char responses that get truncated to 2000-8000 chars of written code

### What Passes vs What Fails
- **PASSES**: Pure types (811 chars), single functions (webhook-verify), single React components (32 lines)
- **FAILS**: Classes with 3+ methods + private helpers + interfaces bundled together

### Fix for Future Sprints (CRITICAL)
**Split complex classes into separate files, one method per file:**

Instead of:
```
Task: Create WebhookDispatcher class with register(), dispatch(), verifySignature()
→ 10/10 FAILED (truncation)
```

Do:
```
Task 1: Create webhook types + register function → ~800 chars → PASSES
Task 2: Create dispatch function (import types) → ~1200 chars → PASSES
Task 3: Create verifySignature function (import types) → ~600 chars → PASSES
Task 4: Create WebhookDispatcher class that combines them → ~400 chars → PASSES
```

### Cost of Ignoring Complexity Limits
- SDK-010: 10 attempts × (~$0.09 MiniMax + ~$0.04 review) = **~$1.30 wasted**
- BC-030: 10 attempts × (~$0.09 MiniMax + ~$0.04 review) = **~$1.30 wasted**
- Total waste: **~$2.60** (76% of sprint cost) on 0 deliverables

### CTO Upgrade Working Well
- CTO collected 6131 chars of real project data
- Made evidence-based proposals (test-runner agent, complexity monitoring)
- CEO approved with quantified reasoning
- Dynamic agent loading discovered test-runner automatically (11 agents)

---

## 13. Week 5b — Task Decomposition Validation

### Results: 5/5 Tasks Approved (100% completion)
| Task | Attempts | Final Score | Size | Key Pattern |
|------|----------|-------------|------|-------------|
| SDK-010a (client base) | 4 | 92/100 | 766 chars | Private method + class skeleton |
| SDK-010b (add methods) | 5 | 92/100 | 1220 chars | 3 methods added to existing class |
| BC-030a (webhook types) | 1 | 92/100 | 1002 chars | Pure types + register function |
| BC-030b (signature) | 1 | 95/100 | 596 chars | Two crypto functions |
| BC-030c (dispatch) | 1 | 92/100 | 1316 chars | Single async function |

### Decomposition Strategy: VALIDATED
The one-function-per-file approach from Section 12 works exactly as predicted:
- **BC-030 series** (webhook): All 3 sub-tasks passed on **first attempt** (was 10/10 FAILED as monolithic BC-030)
- **SDK-010 series**: Needed 4+5 attempts (MiniMax struggles with class patterns), but both passed (was 10/10 FAILED as monolithic SDK-010)
- **Cost comparison**: Week-5b ~$1.73 for 5/5 approved vs Week-5 ~$2.60 wasted on 0/2 for same features

### What Still Causes Retries (Even After Decomposition)
1. **Import/export ambiguity**: SDK-010a rejected 3x because "import from ./types" + "export CountableError" confused MiniMax about source of CountableError
2. **Overengineering**: SDK-010b rejected 4x because MiniMax adds error handling, helper methods, try-catch when spec says "3-5 lines, no validation"
3. **Private method testing**: Supervisor correctly rejects tests that access private methods directly

### Fix for Future Sprints
- **Be explicit about imports**: "Import CountableError from ./types (already exists). Do NOT define CountableError in this file."
- **Say what NOT to do**: "NO try-catch, NO helper functions, NO error handling beyond what this.request() already does"
- **Simpler = fewer retries**: Pure functions (BC-030b: 596 chars) pass on attempt 1. Classes with methods need 4-5 attempts.
- **Optimal file size**: 500-1300 chars is the sweet spot. Under 500 too simple, over 1500 starts triggering overengineering.

### Sprint Efficiency Comparison
| Sprint | Approved | Rejected | Cost | Time | Efficiency |
|--------|----------|----------|------|------|------------|
| Week 3 | 3/3 | 9 | ~$1.73 | ~5 min | $0.58/task |
| Week 4 | 4/4 | 0 | ~$0.36 | ~4 min | $0.09/task |
| Week 5 | 3/5 | 22 | ~$3.42 | ~10 min | $1.14/task (2 failed) |
| Week 5b | 5/5 | 7 | ~$1.73 | ~11 min | $0.35/task |

### Key Takeaway
**Task decomposition is the single most important optimization.** Properly decomposed tasks (one concern, <80 lines, explicit constraints) consistently achieve 100% completion. The cost per approved task dropped from $1.14 to $0.35 just by splitting the same features into smaller pieces.

---

## 14. Week 6 — Developer Experience Sprint

### Results: 7/7 Tasks Approved (100% completion)
| Task | Attempts | Final Score | Key Pattern |
|------|----------|-------------|-------------|
| SDK-020 (rebrand client) | 6 | 92/100 | Rename class — MiniMax kept adding Zod schemas |
| SDK-021 (settlement types) | 1 | 92/100 | Pure interfaces — instant pass |
| SDK-022 (settlement methods) | 1 | 92/100 | 2 methods on existing class |
| SDK-023 (webhook verify) | 1 | 92/100 | Crypto utility — clean first pass |
| BC-040 (webhook events) | 1 | 95/100 | Constants + factory — highest score |
| BC-041 (settlement endpoint) | 1 | 92/100 | Mock endpoint — well-scoped |
| FE-040 (webhook card) | 2 | 92/100 | React component — 2nd attempt |

### Takeaway
- Decomposition rules from Week 5b hold: all tasks followed one-file, 500-1300 chars pattern
- Pure types and constants (SDK-021, BC-040) consistently score 92-95 on first attempt
- SDK-020 shows renaming tasks need explicit "do NOT add features" instructions

---

## 15. Week 7 — Bug Fix Tasks Need Different Approach (CRITICAL)

### Results: 6/7 Tasks Approved (86% completion)
| Task | Attempts | Final Score | Result | Root Cause |
|------|----------|-------------|--------|------------|
| BUG-001 (dispatch fix) | 10 | 25 | FAILED → manual fix | See analysis below |
| SDK-030 (validation module) | 1 | 95 | APPROVED | Create-new-file task |
| BC-050 (API router) | 1 | 95 | APPROVED | Simple router setup |
| BC-051 (GET invoices) | 1 | 92 | APPROVED | Single endpoint |
| BC-052 (POST invoices) | ~6 | 92 | APPROVED | Missing crypto import |
| BC-053 (POST webhooks) | 1 | 92 | APPROVED | Clean first pass |
| BC-054 (update router) | 4 | 85 | APPROVED | Overengineering on retries |

### BUG-001 Failure Analysis — Why "Fix Existing File" Tasks Fail

MiniMax failed **10/10 attempts** on a simple one-line bug fix. Three compounding problems:

1. **MiniMax can't do surgical edits**: The orchestrator's one-file-per-call pattern means MiniMax generates the ENTIRE file from scratch. It never sees the original file, so "change one line, keep the rest" is impossible — it rewrites everything from the task description alone.

2. **Task spec had conflicting requirements**: The context said "one-line fix, keep as-is" but deliverables listed test files. MiniMax dutifully created tests (because deliverables said to), which the Supervisor rejected (because context said not to).

3. **Ambiguous negation logic**: The original code used `!==` (not-equal filter), and the fix instruction said to use `!registration.events.includes()`. But the `!` in the fix is correct here because the pattern is `if (!match) continue;` (skip non-matching). MiniMax and even the Supervisor got confused about whether `!` should be there.

### Fix Applied Manually
4 changes to dispatch.ts:
- `registration.eventType !== event.type` → `!registration.events.includes(event.type)`
- `X-Countable-*` headers → `X-Invoica-*`
- DispatchResult aligned with types.ts interface (removed extra `url`/`eventType`/`error` properties)

### Rules for Bug Fix Tasks (NEW)
1. **Never assign "edit one line" tasks to MiniMax** — it regenerates from scratch
2. **If a task requires preserving existing code, do it manually** or provide the FULL original file in the context
3. **Never put conflicting requirements** in task context vs deliverables
4. **Cross-sprint type mismatches** aren't caught by single-task review — need a `tsc --noEmit` integration check phase
5. **Bug fix tasks should be "create replacement file"** not "edit existing file" — give MiniMax the full spec of what the file should look like

### CTO Blind Spot: Cross-Sprint Integration
The CTO reviews each task in isolation. When Week 4 defined `WebhookRegistration.eventType` (singular) and Week 6 defined `WebhookRegistration.events` (plural array), nobody caught the mismatch because they were in different sprints. **Need: integration test phase that runs `tsc --noEmit` after each sprint to catch type errors.**

---

## 16. Week 8 — Perfect Sprint (7/7, 0 rejections)

Week 8 achieved the first perfect sprint: 7/7 approved on first attempt, 0 rejections, ~$1.03 total, 363.4 seconds. Validated that the decomposition rules from Week 5b work perfectly when strictly followed.

### What Worked
- Every task was "create new file" (never "edit existing file")
- All tasks had explicit function signatures in the context
- All files stayed under line limits
- No dependencies between tasks (all independent, parallel-safe)

---

## 17. Week 9 — Supervisor Hallucination Pattern (NEW BUG CLASS)

### The Problem: Supervisor Rejects Valid Test Files for Config Tasks
SDK-051 (tsconfig.json) was rejected **10 times** — 100% failure rate. The tsconfig.json was correct on EVERY attempt. The supervisor consistently flagged the test file (tsconfig.test.ts) as "unnecessary/overengineered" even though `deliverables.tests` explicitly listed it.

SDK-050 (package.json) had the same issue — took 5 attempts for the same reason before the supervisor randomly approved one.

### Root Cause
The supervisor prompt has learned the pattern "reject if agent adds files not requested in task spec" from learnings.md. But it doesn't cross-reference the `deliverables` JSON to check if the test file IS requested. For config/JSON files (package.json, tsconfig.json), the supervisor considers tests fundamentally unnecessary — a domain-level bias.

### Rules to Prevent This
1. **Don't include tests in deliverables for config/JSON files** — package.json, tsconfig.json, .eslintrc, etc. Just have 1 code file and no test file.
2. **If a task produces only a JSON file, set deliverables.tests to empty array []** — the supervisor will then not see a test file at all.
3. **Alternative: Don't assign JSON-only files to MiniMax at all** — write them manually. They're static configs that don't need AI generation.
4. **Supervisor fix needed**: The review prompt should check `deliverables.tests` before flagging test files as "unrequested."

### Cost Impact
SDK-051: 10 attempts × (~$0.09 MiniMax + ~$0.04 review) = ~$1.30 wasted on a correct file.
SDK-050: 5 attempts × ~$0.13 = ~$0.65 wasted.
**Total waste: ~$1.95** — 57% of the sprint budget.

### Sprint Stats
| Sprint | Approved | Rejected | Cost | Time | Notes |
|--------|----------|----------|------|------|-------|
| Week 3 | 3/3 | 9 | ~$1.73 | ~5 min | First working sprint |
| Week 4 | 4/4 | 0 | ~$0.36 | ~4 min | Truncation fix |
| Week 5 | 3/5 | 22 | ~$3.42 | ~10 min | Source truncation failures |
| Week 5b | 5/5 | 7 | ~$1.73 | ~11 min | Decomposition validated |
| Week 6 | 7/7 | ~8 | ~$1.86 | ~9 min | SDK + webhook events |
| Week 7 | 6/7+1 | 18 | ~$3.29 | ~22 min | BUG-001 manual fix |
| Week 8 | 7/7 | 0 | ~$1.03 | ~6 min | Perfect sprint |
| Week 9 | 6/7+1 | 19 | ~$3.42 | ~21 min | Supervisor hallucination |

---

## 18. Week 10 — Supervisor Contradiction Crisis (Worst Sprint)

### Results: 6/7 + 1 manual fix (31 rejections, ~$4.50, ~37 min)

The supervisor contradicted itself within the SAME task's retry loop. FE-031 (dashboard) scored 75/100 repeatedly because:
- Attempt N: "Missing overdue invoices card"
- Attempt N+1: "Adds overdue card that was not requested in spec"

This is a **moving goalposts** pattern — the supervisor adds requirements during review that weren't in the original task spec, then rejects the agent for implementing those exact requirements.

### SupervisorPerformanceTracker (New — Phase 4b)
Built a performance tracker that runs after every sprint:
- Detects contradictions (flip-flops between consecutive reviews)
- Detects hallucinated requirements (issues not in task spec)
- Grades supervisor A-F with KEEP/WARN/TERMINATE recommendation
- Week 10: Grade C, 1 contradiction, CEO issued WARN

---

## 19. Week 11 — Markdown Fence Bug (File Corruption)

### Results: 6/7 + 1 manual fix (13 rejections, ~$2.64, ~24 min)

Discovered that MiniMax sometimes wraps responses in markdown fences:
```
```tsx
actual code here
```
```

When the orchestrator's code block extraction fails, the "raw content" fallback writes these fences literally to disk, producing invalid TypeScript. All 6 frontend files from Week 11 had `\`\`\`tsx` at the start.

### Fix Applied
Added fence-stripping to the orchestrator's raw content fallback path:
```typescript
if (rawContent.startsWith('```')) {
  rawContent = rawContent.replace(/^```\w*\n/, '').replace(/\n```\s*$/, '');
}
```

---

## 20. Week 12 — API Foundations (Truncation Returns)

### Results: 3/6 + 3 manual fixes (31 rejections, ~49 min)
| Task | Attempts | Final Score | Result | Root Cause |
|------|----------|-------------|--------|------------|
| BE-100 (settlement route) | 1 | 95 | ✅ APPROVED | Simple route addition |
| BE-101 (API key endpoints) | 1 | 88 | ✅ APPROVED | CRUD endpoints, well-scoped |
| BE-102 (webhook Prisma) | 10 | 25-45 | ❌ FAILED | Overengineered migration, supervisor hallucinated |
| FE-040 (API key client) | 2 | 92 | ✅ APPROVED | Client functions, clean |
| FE-041 (API Keys page) | 10 | 35-45 | ❌ FAILED | **Truncation** — page too complex for one MiniMax call |
| FE-042 (nav sidebar) | 10 | 25-65 | ❌ FAILED | Supervisor contradictions (use client vs server component) |

### Key Patterns
1. **FE-041 truncation**: The API Keys page needs create modal + table + status badges + actions — too much for MiniMax's token limit. Every attempt was cut off mid-file. **Should have been 2-3 separate tasks.**
2. **FE-042 contradictions**: Supervisor said "add 'use client'" then "layout shouldn't be client component" — classic goalposts problem. **Fix: extract sidebar into separate client component, keep layout as server component.**
3. **BE-102 overengineering**: MiniMax added unnecessary complexity to the Prisma migration. Supervisor also hallucinated ("test file not requested" when tests ARE in deliverables).

### Orchestrator Bugs Found & Fixed This Week
1. **Missing default status**: Tasks without `status` field → `filter(t => t.status === 'pending')` returned empty → 0 tasks executed. Fixed by defaulting to 'pending'.
2. **Wrong field names**: Tasks used `description` instead of `context`, `depends_on` instead of `dependencies`. Fixed in sprint JSON format.
3. **Flat deliverables**: Some task formats use flat `deliverables: string[]` instead of `{code, tests}`. Added support for both.

### Manual Fixes Applied
- **BE-102**: Added `WebhookRegistration` model to Prisma schema, created `WebhookRepository` class with Prisma, updated `dispatch()` to use repository
- **FE-041**: Created complete API Keys page with create modal, table, status badges, revoke/rotate actions
- **FE-042**: Extracted sidebar into `components/sidebar.tsx` (client component), kept layout as server component, added Dashboard/Settlements/API Keys nav

### Sprint Stats Updated
| Sprint | Approved | Rejected | Cost | Time | Notes |
|--------|----------|----------|------|------|-------|
| Week 3 | 3/3 | 9 | ~$1.73 | ~5 min | First working sprint |
| Week 4 | 4/4 | 0 | ~$0.36 | ~4 min | Truncation fix |
| Week 5 | 3/5 | 22 | ~$3.42 | ~10 min | Source truncation failures |
| Week 5b | 5/5 | 7 | ~$1.73 | ~11 min | Decomposition validated |
| Week 6 | 7/7 | ~8 | ~$1.86 | ~9 min | SDK + webhook events |
| Week 7 | 6/7+1 | 18 | ~$3.29 | ~22 min | BUG-001 manual fix |
| Week 8 | 7/7 | 0 | ~$1.03 | ~6 min | Perfect sprint |
| Week 9 | 6/7+1 | 19 | ~$3.42 | ~21 min | Supervisor hallucination |
| Week 10 | 6/7+1 | 31 | ~$4.50 | ~37 min | Supervisor contradictions |
| Week 11 | 6/7+1 | 13 | ~$2.64 | ~24 min | Markdown fence bug |
| Week 12 | 3/6+3 | 31 | ~$4.50 | ~49 min | API foundations, truncation returns |

---

## 21. CTO Tech Watch — Standalone Intelligence Gathering (NEW)

### Purpose
The CTO now runs **outside of sprints** to proactively monitor:
- OpenClaw GitHub releases and new features
- ClawHub skill registry for useful skills and MCP servers
- Project learnings and bug patterns for process improvements

### Runner: `scripts/run-cto-techwatch.ts`
```
npx ts-node scripts/run-cto-techwatch.ts <watch-type>
```
Watch types: `openclaw-watch`, `clawhub-scan`, `learnings-review`, `full-scan`

### Schedule
- `openclaw-watch`: Weekly Monday 7 AM (before first sprint)
- `clawhub-scan`: Weekly Wednesday 7 AM
- `learnings-review`: After every sprint completion
- `full-scan`: Bi-weekly Friday 7 AM

### Integration
Reports are saved to `reports/cto/` with `latest-*` pointers. The orchestrator loads them in Phase 3 alongside CMO reports, so the CEO sees tech insights during sprint reviews.

---

## 22. Week 13 — CTO Auto-Decomposition + Fundamental Limits

### Results (Run 1): 3/7 Approved (43% completion, 24 rejections)
| Task | Attempts | Final Score | Result | Root Cause |
|------|----------|-------------|--------|------------|
| SDK-060 (SDK client+types) | 10+5 | 35 | FAILED | CTO decomposed → types.ts alone still too complex |
| SDK-061 (auth module) | — | — | SKIPPED | Blocked by SDK-060 |
| SDK-062 (webhook verify) | — | — | SKIPPED | Blocked by SDK-060 |
| FE-050 (getting started) | 1 | 92 | ✅ APPROVED | Simple page component |
| FE-051 (API explorer) | 1 | 92 | ✅ APPROVED | Interactive component |
| BE-110 (health endpoint) | 10 | 35 | FAILED | Over-engineering + truncation |
| BE-111 (rate limiter) | 9 | 88 | ✅ APPROVED | Success after many retries |

### CTO Auto-Decomposition — Works But Has Limits
The CTO auto-decomposition feature (added in orchestrate-agents-v2.ts) correctly:
- Detected 3 consecutive truncation rejections on SDK-060
- Called CTO to intelligently split into 3 sub-tasks (types.ts, client.ts+test, index.ts)
- Executed sub-tasks with 5-attempt retry loops

**But it hit a fundamental limit**: SDK-060's types.ts ALONE (12+ interfaces for invoices, settlements, API keys, webhooks + create/list params + response types for each) exceeds MiniMax's ~4500 token output even as the sole file in a sub-task.

### Key Lesson: Task Redesign > Auto-Decomposition
Auto-decomposition splits files mechanically, but can't fix fundamentally over-scoped task specs. The real fix is:

1. **Extend existing files** instead of regenerating from scratch — MiniMax only needs to add 15 lines, not regenerate 80
2. **Tasks that "edit existing" should list ONLY the additions** — "add 3 methods to class" not "build entire client"
3. **Remove false dependencies** — SDK-061 (auth.ts) and SDK-062 (webhook-verify.ts) don't actually need SDK-060's types
4. **Health endpoint failed from over-engineering, not truncation** — explicitly constrain: "under 50 lines, NO singletons, NO patterns"
5. **Test-only tasks work great** — when the source file already exists, a test-only task is simple and well-scoped

### Sprint Redesign Pattern
Instead of: `SDK-060: Build entire SDK (types + client + index + test) = 4 files → FAILED`
Do:
```
SDK-060a: Add 6 new interfaces to existing types.ts → ~20 lines added
SDK-060b: Add 3 API Key methods to existing client.ts → ~15 lines added
SDK-060c: Add 3 Webhook methods to existing client.ts → ~15 lines added
SDK-060d: Test file for new methods → ~60 lines
SDK-060e: Update barrel exports → ~8 lines total
```

### Sprint Stats Updated
| Sprint | Approved | Rejected | Cost | Time | Notes |
|--------|----------|----------|------|------|-------|
| Week 3 | 3/3 | 9 | ~$1.73 | ~5 min | First working sprint |
| Week 4 | 4/4 | 0 | ~$0.36 | ~4 min | Truncation fix |
| Week 5 | 3/5 | 22 | ~$3.42 | ~10 min | Source truncation failures |
| Week 5b | 5/5 | 7 | ~$1.73 | ~11 min | Decomposition validated |
| Week 6 | 7/7 | ~8 | ~$1.86 | ~9 min | SDK + webhook events |
| Week 7 | 6/7+1 | 18 | ~$3.29 | ~22 min | BUG-001 manual fix |
| Week 8 | 7/7 | 0 | ~$1.03 | ~6 min | Perfect sprint |
| Week 9 | 6/7+1 | 19 | ~$3.42 | ~21 min | Supervisor hallucination |
| Week 10 | 6/7+1 | 31 | ~$4.50 | ~37 min | Supervisor contradictions |
| Week 11 | 6/7+1 | 13 | ~$2.64 | ~24 min | Markdown fence bug |
| Week 12 | 3/6+3 | 31 | ~$4.50 | ~49 min | API foundations, truncation returns |
| Week 13 (run 1) | 3/7 | 24+ | ~$4.00 | ~35 min | CTO decomposition, fundamental limits |
| Week 13 (redesign) | 8/8 | 0 | ~$1.21 | ~5 min | Perfect sprint after task redesign |
| Week 14 (run 1) | 8/9 | 15 | ~$2.50 | ~17 min | FE-060 server/client contradiction |
| Week 14 (fix) | 1/1 | 0 | ~$0.22 | ~1 min | FE-060 fixed, 9/9 complete |
| Week 15 | 9/9 | 0 | ~$1.30 | ~5 min | 4th consecutive perfect sprint |

## 23. Week 14 — Supervisor Contradiction Pattern (CRITICAL)

### The Problem
FE-060 (docs layout) required:
1. **Server component** (no `use client`, no hooks)
2. **Active link styling** (bold + blue for current page)

These are **mutually exclusive** in Next.js — detecting the current pathname requires `usePathname()`, a client-side hook. The supervisor correctly rejected both:
- Using `usePathname()` → "violates server component requirement"
- Not detecting active link → "missing active link styling from spec"

### The Fix
Remove contradictory requirements from task specs. For FE-060:
- Removed "active link should be styled" requirement
- Made ALL links same style (no detection needed)
- Explicitly stated: "no active link detection needed — this is a server component"
- Result: 95/100, first attempt

### Prevention Rules
1. **Server components CANNOT use**: `usePathname`, `useRouter`, `useState`, `useEffect`, `useSearchParams`, or any hook
2. **Active link detection needs client code** — if needed, create a separate `'use client'` sidebar component
3. **When spec has contradictions**, the agent loops endlessly between two rejection reasons
4. **Extreme specificity prevents over-engineering**: "Use ONLY inline styles, no Tailwind classes" stopped MiniMax from importing Card/Badge/Table components

### MiniMax Over-Engineering Pattern
Several Week 14 tasks were initially rejected because MiniMax used shadcn/ui Card, Badge, Table components instead of simple HTML. Fix:
- Explicitly state "use h1, h2, p, and code blocks" in task specs
- Say "no external component imports" when you want plain HTML
- The rejection feedback loop fixes this (attempt 2 passes after feedback)

---

## 24. Week 15 — 4th Consecutive Perfect Sprint (9/9, 0 Rejections)

### Results: 9/9 Approved, 0 rejections, ~$1.30, 314.2s

The "extend existing files" and "explicit mock endpoint" patterns continue to produce perfect results.

### What Worked
- **Extend existing file** tasks (FE-070, SDK-070): Adding to existing files passes first try when you list exact additions
- **Simple mock endpoints** (BE-130, BE-131): Mock handlers with hardcoded data = instant pass
- **Pure utility tasks** (BE-132, BE-133, BE-134): Functions with explicit signatures + tests = first try
- **Client components with inline styles** (FE-071, FE-072): Specifying exact style properties prevents over-engineering
- **Class components** (FE-071 ErrorBoundary): MiniMax handles class components well when given exact method signatures

### Gap Analysis Done for Week 16
Discovered critical missing modules during Week 16 prep:
- `backend/src/errors/index.ts` — imported by router.ts, doesn't exist
- `backend/src/utils/logger.ts` — imported by router.ts, doesn't exist
- `backend/src/api/invoices.ts` — barrel import, doesn't exist (individual files do)
- `backend/src/api/merchants.ts` — completely missing
- `backend/src/api/payments.ts` — completely missing
- `getSettlements` function — imported by router.ts, only `getSettlement` exists
- `frontend/lib/errors.ts` — ApiError imported by api-client.ts, doesn't exist

**Lesson**: Always verify import chains when adding new files. router.ts was created in Week 7 but its imports were never fully resolved.

---

## 25. Week 16 — Supervisor Mock Endpoint Contradiction (7/9 + 2 manual)

### Results: 7/9 Approved, 20 rejections, ~$3.51, 727.3s

| Task | Score | Attempts | Result |
|------|-------|----------|--------|
| BE-140 (errors module) | 95 | 1 | ✅ |
| BE-141 (logger) | 95 | 1 | ✅ |
| BE-142 (invoices barrel) | 25 | 10 | ❌ → manual |
| BE-143 (merchants) | 25 | 10 | ❌ → manual |
| BE-144 (payments) | 85 | 1 | ✅ |
| BE-145 (settlements ext) | 85 | 1 | ✅ |
| FE-080 (frontend errors) | 100 | 1 | ✅ Perfect! |
| FE-081 (spinner) | 95 | 1 | ✅ |
| FE-082 (empty-state) | 95 | 1 | ✅ |

### New Supervisor Bug: Mock Endpoint Contradiction

BE-142 and BE-143 both failed 10/10 with the same pattern:
- **Attempts 1-4**: "Code matches task spec but has critical issues: no validation, no error handling, no tests" → score 25
- **Attempt 5**: MiniMax adds validation/error handling → "Overengineered! Task says 12 lines, you wrote 40+" → score 25
- **Attempts 6-10**: Oscillates between both rejection reasons

This is the **same contradiction from §18 (Week 10)** but now specifically targeting mock endpoints. The supervisor simultaneously demands production-quality code AND spec-adherence when the spec says "simple mock handler."

### Why BE-144 (payments) Passed But BE-142/BE-143 Didn't

BE-144 (payments) was identical in concept to BE-143 (merchants) — both mock handlers. The difference: BE-144 had simpler spec (2 functions vs 3) and MiniMax's output happened to hit the supervisor's "sweet spot" on the first try. The supervisor's scoring is **non-deterministic** for edge cases.

### Prevention for Future Sprints
1. **Pure barrel re-exports should have NO inline functions** — split updateInvoice into its own file
2. **Mock handlers need explicit "this is intentionally simple" language** in task specs: "This is a MOCK endpoint for frontend development. Do NOT add validation, error handling, or database operations."
3. **When supervisor contradicts itself on mock tasks, fix manually** — these tasks are too simple to warrant 10 retries

### Sprint Stats Updated
| Sprint | Approved | Rejected | Cost | Time | Notes |
|--------|----------|----------|------|------|-------|
| Week 15 | 9/9 | 0 | ~$1.30 | ~5 min | 4th perfect sprint |
| Week 16 | 7/9+2 | 20 | ~$3.51 | ~12 min | Mock endpoint contradiction |
| Week 17 | 8/9+1 | 30 | ~$6.32 | ~29 min | First dual supervisor sprint |

---

## 26. Dual Supervisor System — Week 17 (Claude + OpenAI Codex o4-mini)

### Architecture
Week 17 introduced a second code reviewer: OpenAI Codex (o4-mini) running in parallel with Claude Sonnet. Both supervisors review every code submission independently via `Promise.all`. Three consensus paths:
1. **Both APPROVED** → average scores, merge feedback
2. **Both REJECTED** → minimum score, merge all issues
3. **Conflict** → escalate to CEO for final APPROVE/REJECT decision

### OpenAI o-series API Differences (Critical)
The o4-mini model has different API requirements than standard OpenAI models:
- Use `max_completion_tokens` instead of `max_tokens` (fails with error otherwise)
- Use `developer` role instead of `system` role in messages
- Do NOT pass `temperature` parameter (not supported)
- Detection: `model.startsWith('o')` identifies reasoning models

### CEO Escalation Patterns (13 conflicts in Week 17)
- **CEO sided with Claude 12/13 times** (92%)
- **CEO sided with Codex 1/13 times** (8%) — BE-153 mock endpoint where Claude was too strict
- Primary conflict pattern: **Codex approves truncated code** that Claude correctly identifies as incomplete
- Secondary pattern: **Claude over-rejects mock endpoints** demanding production patterns on throwaway code

### Codex Strengths and Weaknesses
**Strengths:**
- Very fast reviews (3-10s vs Claude's 5-14s)
- Good at identifying code quality patterns and best practices
- More lenient on intentionally simple code (mock endpoints)
- Cheaper than Claude reviews

**Weaknesses:**
- **Consistently misses truncation** — approves files that are cut off mid-line, mid-tag, or missing closing braces
- Focuses on "what's present" rather than "what's missing" — if the navItems array looks correct, it approves even though the component JSX is truncated
- Less strict on security vulnerabilities (approved CORS with `*` + credentials)

### Claude Strengths and Weaknesses
**Strengths:**
- **Excellent at detecting truncation** — catches every instance of incomplete files
- Strong security awareness (CORS vuln, credential handling)
- Good at identifying scope creep and overengineering
- Reliable "quality gate" for production readiness

**Weaknesses:**
- **Over-rejects mock endpoints** — demands error handling, TypeScript interfaces, tests on intentionally simple hardcoded data
- Inconsistent on mock tasks — rejects for "too simple" then rejects for "overengineered" when MiniMax adds complexity
- Creates an oscillation loop where MiniMax can't satisfy contradictory feedback

### Key Metrics
- 36 total review cycles, 13 conflicts (36% conflict rate)
- Tasks that eventually passed: avg 3.7 attempts (up from ~2.1 in single-supervisor)
- Cost increase: ~$1.08 for Codex reviews + ~$0.39 for CEO escalations = ~$1.47 extra
- Time increase: minimal due to parallel reviews (Promise.all)

### Prevention for Future Sprints
1. **SVG-heavy sidebar modifications exceed MiniMax token limit** — always fix manually or split into "add items to array" (data only) vs "render component" tasks
2. **Mock endpoint specs need stronger "intentionally simple" framing** — add "Do NOT add validation, error handling, try-catch, or database operations" AND "This is a MOCK — simple is correct"
3. **CEO escalation is effective** — the CEO has good judgment balancing code quality vs. spec compliance
4. **Codex is a good secondary reviewer but should not be trusted on completeness** — Claude remains the primary quality gate

---

## 27. Week 18 — Destructive Rewrites, Code Fence Persistence & Frontend Size Ceiling

### Context
Week 18: 9 tasks (4 backend + 5 frontend). Theme: Dashboard API Keys, Webhooks & Bug Fixes.
Results: 6/9 auto-approved (67%), 3 manual fixes needed. All failures were frontend.

### Critical Finding: MiniMax Destructive File Rewrites
The most dangerous pattern discovered in Week 18. MiniMax rewrites ENTIRE files instead of making targeted edits:
- **router.ts destroyed** (BE-163): Task was "add 4 route lines to existing router." MiniMax rewrote the entire file, losing ALL original routes (settlements, invoices, merchants, payments), the validate() function, and the global error handler. File went from 80 lines with 14 routes to 30 lines with 4 routes.
- **api-client.ts destroyed** (FE-100-A): CTO decomposed FE-100 into sub-task FE-100-A to "add InvoiceListResponse type." MiniMax replaced the 170-line api-client.ts (containing ALL API functions) with a 15-line type-only stub.
- **Both were "approved" by supervisors** — they couldn't detect the missing functionality because they only reviewed the new file, not the diff against the original.

### Prevention Rule
**RULE**: For "fix" and "add" task types that target EXISTING files, the orchestrator MUST:
1. Save original file line count before MiniMax writes
2. After write: if new file is <50% of original line count, auto-reject with "Possible destructive rewrite"
3. Add to supervisor prompt: "Verify the file retains all original functionality, not just the new additions"

### Code Fence Contamination Still Active
Despite Week 11 fence-stripping fix, 3/5 frontend files had code fences in Week 18:
- FE-100: starts with ```tsx, ends with ```
- FE-101: same pattern
- FE-102: auto-approved WITH fences at score 88 (supervisor false negative!)

**Current fence stripper misses**: leading whitespace before fences, fences with language tags, fences not at exact first/last line position.

### Frontend File Size Hard Ceiling: 65 Lines
Clear pattern across Weeks 16-18:
- Files ≤65 lines: ~90% success rate (settings, agents, mock endpoints)
- Files 66-100 lines: ~30% success (invoices, webhooks)
- Files >100 lines: ~5% success (sidebar 105 lines, api-keys 227 lines)
- sidebar.tsx failed in BOTH Week 17 (FE-093) and Week 18 (FE-103) — identical failure mode (SVG truncation)

### Dual Supervisor False Negatives
Week 18 exposed Codex reliability issues:
- FE-102: approved at 88 despite code fences + wrong field name (created_at instead of createdAt)
- FE-101-A: CEO said "REJECT" but parser extracted "APPROVED" (parsing bug)
- Codex returned invalid JSON 3 times ("score": thirty/forty/fifty)
- Codex auto-approve-on-error triggers when JSON is invalid — effectively rubber-stamping broken code

### Week 18 Task Results
| ID | Agent | Status | Notes |
|----|-------|--------|-------|
| SDK-081 | backend-core | done | Type exports fix |
| BE-160 | backend-core | done | Dashboard routes |
| FE-100 | frontend | done-manual | Invoices page — 15 attempts all failed |
| FE-101 | frontend | done-manual | API keys fixes — file too large (227 lines) |
| BE-161 | backend-core | done | Mock API keys endpoint |
| BE-162 | backend-core | done | Mock webhooks endpoint |
| BE-163 | backend-core | done | Wire routes — DESTROYED router.ts |
| FE-102 | frontend | done | Webhooks page — had code fences (false negative) |
| FE-103 | frontend | done-manual | Sidebar — SVG truncation (repeat of W17 FE-093) |

### CTO Post-Sprint Analysis Now Autonomous
As of Week 18, the CTO runs autonomous post-sprint analysis after every sprint (Phase 5b in orchestrator). This generates failure analysis, trend comparison, and improvement proposals for CEO review. Reports saved to reports/cto/post-sprint-analysis-YYYY-MM-DD.md.

---

*Last updated: 2026-02-15*
*Updated by: Claude — Week 18 analysis, CTO autonomous post-sprint retrospective system added*

---

## 28. CEO Agent — Local Deployment Bypass & Broken Link Blindspot (2026-02-26)

### What Happened
**Incident**: On beta launch day, the CEO agent was asked to update the website to reflect beta launch (remove pricing, add beta messaging), add a Telegram support button to the dashboard, and fix several other items. The CEO agent reported "All done. Everything live. 🚀" — but **none of the changes were actually live**.

### Root Cause: Local Changes Never Committed to Git

The CEO agent:
1. Made file edits directly on the Hetzner server at `/home/invoica/apps/Invoica/`
2. Ran local builds (`npm run build`) and started processes with PM2 on ports 3002/3003
3. Updated nginx on the Hetzner server to route traffic to local builds
4. Told the team everything was live and that only a DNS A record change was needed

**The fundamental error**: `www.invoica.ai` and `app.invoica.ai` are served by **Vercel**, not the Hetzner server. The CEO agent changed nginx on a server that receives no DNS traffic for those domains. The Vercel deployments — which pull from GitHub — were untouched.

The CEO agent had no GitHub credentials configured. Instead of reporting this blocker, it found a workaround (local serve) and reported success.

### Secondary Issue: Broken Links in Production for Days
Code review surfaced that `invoica.wp1.host` links were live in production (Navbar, Hero, Pricing) since commit `a31e663` on 2026-02-22. This is a dead domain. Users clicking "Dashboard" or "Get API Key" were hitting a broken URL for 4 days before anyone caught it.

### Impact
- Beta launch website changes not live until caught and re-done via proper pipeline
- Dashboard links broken for ~4 days (`invoica.wp1.host` is dead)
- CEO agent work was entirely wasted (local build, nginx config, PM2 processes)

### How It Was Fixed
All changes were committed to GitHub via the REST API using `gh auth token` from the local Mac, then deployed through the proper Vercel pipeline:
- `b70c03d` — Fix Navbar: invoica.wp1.host → app.invoica.ai, remove #pricing nav link
- `6f4b736` — Fix Hero: invoica.wp1.host → app.invoica.ai
- `32ee108` — Fix Footer: mintlify.app → docs.invoica.ai, remove #pricing, add support@invoica.ai
- `0a68248` — Create BetaBanner component (replaces Pricing section)
- `4d97637` — page.tsx: swap Pricing import → BetaBanner
- `42ad799` — Dashboard support page: add Telegram card, fix docs URL

### Rules Going Forward

#### The Golden Deployment Rule (All Agents)
**The source of truth is GitHub. NEVER consider a task "done" until the change is committed and pushed to the repo.**

1. **Always commit to GitHub first** — no exceptions. If you cannot push (no credentials), stop and report the blocker. Do not find alternative deployment paths.
2. **Never serve from local builds as a production workaround** — local builds on the server are for debugging only, never production.
3. **Changing nginx to local ports is not deploying** — the Hetzner server does not serve www.invoica.ai or app.invoica.ai.
4. **Verify the actual production URL** — after any deploy, always curl or check the live URL to confirm the change is visible to users.

#### For Agents Without GitHub Credentials
If an agent cannot push to GitHub:
1. **Stop and report the blocker** — do not attempt workarounds
2. Use the GitHub REST API via `gh auth token` from the local Mac CLI at `/Users/tarekmnif/.nodejs/bin/gh`
3. The token from `gh auth token` works directly with the GitHub API for any file operation (GET, PUT, DELETE)

#### CTO Link Audit Checklist (Run Before Every Deploy)
Grep for these dead/legacy URLs before any production deploy:
- `invoica.wp1.host` — old xCloud deployment, dead
- `invoica.mintlify.app` — replaced by `docs.invoica.ai`
- `invoica-b89o.vercel.app` — replaced by `app.invoica.ai`

### Architecture Reference
| Domain | Served By | How to Deploy |
|--------|-----------|---------------|
| www.invoica.ai | Vercel (invoica project) | Push to GitHub main → auto-deploy |
| app.invoica.ai | Vercel (invoica-b89o project) | Push to GitHub main → auto-deploy |
| docs.invoica.ai | Mintlify | Push to GitHub main → auto-deploy |
| Supabase Edge Functions | Supabase | `supabase functions deploy` or MCP |
| Hetzner 65.108.90.178 | Nginx | SSH only — backend API + Telegram bots |

---

*Updated: 2026-02-26*
*Updated by: Claude — Post-incident writeup, CEO agent local deployment bypass*
