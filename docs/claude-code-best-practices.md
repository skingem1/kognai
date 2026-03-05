# Claude Code Best Practices

> Source: Eyad Khrais (@eyad_khrais) — CTO with 7 years SWE at Amazon, Disney, Capital One.
> Saved for Countable agent reference. All agents should internalize these principles.

---

## 1. Think First (Plan Mode)

- **Always plan before executing.** 10/10 times, plan mode output is significantly better.
- Press Shift+Tab twice for plan mode. Takes 5 minutes, saves hours of debugging.
- Before building a feature: think about architecture.
- Before refactoring: think about the end state.
- Before debugging: think about what you actually know.
- Pattern: **thinking first → typing** beats **typing first → hoping**.

## 2. Architecture & Specificity

- Broad prompts = bad output. "Build me an auth system" → terrible.
- Specific prompts = good output. "Build email/password auth using existing User model, sessions in Redis with 24hr expiry, middleware for /api/protected" → excellent.
- The more architectural detail you provide upfront, the less wiggle room for bad decisions.

## 3. CLAUDE.md / System Prompts

- Keep it short. ~150-200 instructions max (system prompt uses ~50 already).
- Make it specific to YOUR project. Don't explain what "components" means.
- **Tell it WHY, not just what.** "Use strict mode because we've had production bugs from implicit any" > "Use strict mode".
- Update constantly. If you correct the same thing twice, it belongs in the prompt.
- Good prompt = notes for yourself with amnesia. Bad prompt = documentation for a new hire.

## 4. Context Window Management

- Quality degrades at **20-40% context**, not 100%.
- **Scope conversations**: one conversation per feature/task.
- **Use external memory**: write plans/progress to files (SCRATCHPAD.md, plan.md).
- **Know when to clear**: if conversation is off the rails, start fresh.
- Mental model: **Claude is stateless.** Every conversation starts from nothing except what you give it.

## 5. Prompting

- **Be specific** about what you want. Constraints > open-ended.
- **Tell it what NOT to do.** Claude tends to overengineer — extra files, unnecessary abstractions.
- **Give context about why.** "Needs to be fast — runs on every request" changes approach.
- **Examples > descriptions.** Show what success looks like.
- Bad Input == Bad Output. If output sucks, input sucked. Full stop.

## 6. When Stuck

- **Don't loop.** If you've explained the same thing 3 times, more explaining won't help.
- Clear the conversation and start fresh.
- Simplify the task — break into smaller pieces.
- Show instead of tell — write a minimal example.
- Reframe the problem — different angle can unlock progress.
- If Claude struggles with a complex task, **your plan was insufficient**.

## 7. Model Strategy

- **Sonnet**: faster, cheaper. Great for execution where path is clear (boilerplate, refactoring, implementation).
- **Opus**: slower, expensive. Better for complex reasoning, planning, tradeoffs.
- Workflow: **Opus to plan → Sonnet to implement**.

## 8. Build Systems, Not One-Shots

- Claude Code has `-p` flag for headless mode (run prompt, get output, no interactive UI).
- Script it. Pipe output. Chain with bash. Integrate into workflows.
- **The flywheel**: Claude makes mistake → review logs → improve prompts/tooling → Claude gets better.
- After months of iteration, same models produce dramatically better output — just better configured.

---

## Key Takeaways for Countable Agents

1. **CEO**: Always use plan mode. Think architecture before assigning tasks.
2. **CTO**: When proposing improvements, be specific (not "improve performance" but "add Redis caching to /api/invoices with 5min TTL").
3. **Supervisor**: Review for overengineering. Flag unnecessary abstractions and extra files.
4. **Skills**: When creating tasks for MiniMax, remember specificity is everything. Broad tasks fail. Narrow tasks pass.
5. **All agents**: If stuck in a loop, change approach. Don't keep retrying the same thing.

---

*Stored in docs/ for all agents. Referenced by CEO, CTO, Supervisor, and Skills prompts.*