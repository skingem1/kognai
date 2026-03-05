# External Intelligence — X/Twitter Post by @ksimback

**Source**: https://x.com/ksimback/status/2023362295166873743
**Author**: @ksimback (Kevin Simback)
**Date flagged**: 2026-02-18
**Flagged by**: Owner
**Content**: Full guide on reducing OpenClaw model costs by up to 90%

## Summary
Kevin Simback published a comprehensive guide on OpenClaw cost optimization covering:

1. **The Problem**: OpenClaw defaults send everything to primary model (heartbeats, sub-agent tasks, etc.) — Opus for everything can cost $1000+/month
2. **Cost Drivers**: Context accumulation (200K+ tokens), system prompt re-injection (3K-14K tokens per call), tool output storage, heartbeat overhead
3. **Intelligent Routing**: Match model capability to task complexity
4. **ClawRouter**: Highlighted as the hottest OpenClaw tool (2.4K GitHub stars in 11 days) — classifies into Simple/Medium/Complex/Heavy tiers
5. **Prompt Caching**: 90% cheaper on cached system prompts — extend heartbeat to 55min for warm cache
6. **Local Models**: Qwen 3 32B via Ollama for zero marginal cost on routine tasks
7. **OpenRouter**: 300+ models, 1 API — automatic routing

## CTO Relevance Assessment

### Highly Relevant
- We already use ClawRouter (port 8402 via PM2) — validates our architecture
- MiniMax M2.5 for coding aligns with their open model recommendation
- Prompt caching — verify our cacheRetention settings are optimized
- Heartbeat optimization — check if our interval can hit warm cache

### Action Items for CTO
- [ ] Verify ClawRouter config has optimal caching settings
- [ ] Check if prompt caching is enabled for Anthropic API supervisor calls
- [ ] Assess heartbeat interval optimization for our orchestrator
- [ ] Review if any API calls send unnecessary context
- [ ] Consider Qwen 3 32B for local deployment if zero-cost inference needed

## Full Content
See: reports/cto/external-intel/x-post-ksimback-2026-02-18-content.md
