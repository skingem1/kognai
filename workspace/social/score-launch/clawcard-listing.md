# SCORE — ClaWHub Listing

**Name:** SCORE — Scoring and Reputation for Agent Outputs  
**Namespace:** `@godman-protocols/score`  
**Version:** 0.2.0  
**License:** Apache 2.0  
**Tier:** T2 (infrastructure protocol)  
**Category:** Agent Infrastructure / Evaluation  

## Short description (140 chars)
Weighted rubric evaluation and reputation tracking for AI agents. Signed audit trail. Integrates with PACT and DRS.

## Full description
SCORE is an open protocol for measuring and tracking the quality of AI agent outputs over time. Agents define evaluation rubrics with weighted criteria, score outputs, and accumulate reputation across evaluations — creating a verifiable track record that other protocols (PACT, DRS) can use to make trust and resource decisions.

**Key features:**
- `createRubric(name, criteria)` — define weighted evaluation criteria
- `evaluate(rubric, scores, agentId)` — produce a signed Evaluation
- `calculateReputation(agentId, evaluations)` — compute rolling reputation
- `createAuditEntry(evaluation)` — append-only audit trail
- Integrates with PACT (trust adjustment) and DRS (priority allocation)

**Install:**
```bash
npx skills add https://github.com/godman-protocols/score
```

## Tags
scoring, reputation, evaluation, agent-quality, audit, godman-protocols
