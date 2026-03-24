# Curator Agent Specification — AMD-25

> **Status:** Design only (Sprint 959). No implementation.

## Role

The Curator is responsible for maintaining the quality, freshness, and constitutional compliance of all 5 Domain Knowledge Architecture (DKA) stores. It runs as a background agent, triggered by schedule or on-demand by the CEO agent.

## Responsibilities

1. **Ingest** — Accept new knowledge entries, validate schema, embed text, store vectors
2. **Verify** — Periodically re-check expired vectors against their source references
3. **Prune** — Remove vectors that fail verification or exceed retention policy
4. **Classify** — Enforce and update security classifications based on content analysis
5. **Report** — Emit store health metrics (vector count, age distribution, confidence distribution)

## Model Tier

- Primary: T2 (qwen3:14b) — for classification and content analysis
- Embedding: text-embedding-3-small (cloud) or local/nomic-embed (vault)
- Fallback: T3 (claude-sonnet-4-6) — for complex classification decisions

## Trigger Modes

| Mode | Trigger | Scope |
|------|---------|-------|
| Scheduled | Every 6 hours (PM2 cron) | Full store scan |
| On-demand | CEO agent request | Specific domain or query |
| Reactive | New vector ingested | Single vector validation |

## Input Schema

```typescript
interface CuratorTask {
  type: 'ingest' | 'verify' | 'prune' | 'report';
  domain?: DomainId;       // null = all domains
  vectorIds?: string[];     // specific vectors (for verify/prune)
  sourceText?: string;      // for ingest
  sourceRef?: string;       // for ingest
  tags?: string[];          // for ingest
}
```

## Output Schema

```typescript
interface CuratorReport {
  domain: DomainId;
  vectorCount: number;
  expiredCount: number;
  prunedCount: number;
  averageConfidence: number;
  averageAgeDays: number;
  constitutionalViolations: number;
  timestamp: string;
}
```

## Constitutional Constraints

The Curator MUST enforce SOUL protocol constraints on retrieval:
- **Trading domain**: Never surface insider information or non-public financial data to unauthorized agents
- **Regulatory domain**: Always surface relevant compliance rules when queried, even if confidence is low
- **All domains**: Redact any PII before returning results to non-authorized agents
- **Classification escalation**: If content analysis suggests a higher classification than assigned, escalate to CEO

## Knowledge Boundary Rules

See `boundary-rules.ts` for the typed specification of inter-domain access control.

## Integration Points

- AMF: All Curator communications use AMF Envelope format
- SOUL: Constitutional filters applied at retrieval time
- SCORE: Curator issues ScoreCards for knowledge quality
- SIGNAL: Curator publishes events to `dka.ingest`, `dka.prune`, `dka.verify` topics
