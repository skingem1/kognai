// EVAL-002 — Cognee Evaluation for Knowledge Graph Memory
// Library: topoteretes/cognee (Apache 2.0, ~4K stars)
// Purpose: Knowledge graph memory layer for BrainX — structured relationships
//
// 5 Criteria:
// 1. Python SDK + ARM64 compatibility (Mac Mini M4 vault)
// 2. Knowledge graph quality (entity extraction, relationship mapping)
// 3. BrainX Memory compatibility (pgvector + episodic memory integration)
// 4. Local model support (can run with qwen3 instead of OpenAI)
// 5. Production readiness (stability, docs, community)

import {
  EvalCriterion,
  EvalReport,
  computeVerdict,
  printEvalReport,
  validateReport,
} from './cto-eval-framework';

export function runEval002(): EvalReport {
  const criteria: EvalCriterion[] = [
    {
      id: 'C1',
      name: 'Python SDK + ARM64 Compatibility',
      description: 'Must have Python SDK that runs on ARM64 (Apple Silicon M4)',
      weight: 0.20,
      score: 4,
      evidence: 'Cognee installs via pip. Pure Python + networkx + optional Neo4j. No native C extensions in core. ARM64 compatible on macOS. Dependencies (networkx, pydantic, httpx) all have ARM64 wheels.',
      risks: ['Neo4j graph DB optional dep — Docker image works on ARM64'],
      mitigations: ['Use networkx in-memory graph for dev, Neo4j for production'],
    },
    {
      id: 'C2',
      name: 'Knowledge Graph Quality',
      description: 'Entity extraction, relationship mapping, graph traversal quality',
      weight: 0.25,
      score: 4,
      evidence: 'Cognee extracts entities and relationships from text using LLM-powered pipelines. Builds knowledge graphs with typed edges. Supports graph traversal queries. Quality depends on underlying LLM but pipeline is well-designed. Supports chunking, deduplication, and incremental graph updates.',
      risks: ['Quality heavily dependent on LLM used', 'Large documents may produce noisy graphs'],
      mitigations: ['Use qwen3:14b for extraction quality', 'Post-process with importance filtering'],
    },
    {
      id: 'C3',
      name: 'BrainX Memory Compatibility',
      description: 'Can integrate with BrainX episodic memory (pgvector)',
      weight: 0.25,
      score: 4,
      evidence: 'Cognee supports vector storage backends including pgvector natively. Graph data can be stored in PostgreSQL or Neo4j. Complementary to BrainX — BrainX handles episodic memory (what happened), Cognee handles semantic memory (what things mean and how they relate).',
      risks: ['Two PostgreSQL schemas need coordination', 'Query patterns differ (vector search vs graph traversal)'],
      mitigations: ['Use same PG database, separate schemas: brainx_memories + cognee_graph', 'Build unified query interface in AMD-03'],
    },
    {
      id: 'C4',
      name: 'Local Model Support',
      description: 'Can run with local models (qwen3, deepseek) instead of cloud APIs',
      weight: 0.15,
      score: 3,
      evidence: 'Cognee supports OpenAI-compatible endpoints via base_url config. Can point to Ollama running qwen3:14b. However, extraction quality drops with smaller models. Entity resolution works best with GPT-4 class models.',
      risks: ['Quality degradation with local models', 'Ollama latency higher than cloud APIs for batch extraction'],
      mitigations: ['Use qwen3:14b (best local model) for extraction', 'Cache extracted graphs to avoid re-processing', 'Batch processing during off-hours'],
    },
    {
      id: 'C5',
      name: 'Production Readiness',
      description: 'Stability, documentation quality, community activity',
      weight: 0.15,
      score: 4,
      evidence: 'Apache 2.0 license — compatible. ~4K stars, very active development. Good English documentation. Active Discord community. Regular releases. Well-maintained GitHub repo with clear contribution guidelines.',
      risks: ['Still pre-1.0 — API may change', 'Complex dependency tree'],
      mitigations: ['Pin version', 'Wrap in adapter layer (same as EVAL-001 recommendation)'],
    },
  ];

  const { weighted_score, verdict } = computeVerdict(criteria);

  const report: EvalReport = {
    eval_id: 'EVAL-002',
    title: 'Cognee Evaluation for Knowledge Graph Memory',
    library_name: 'topoteretes/cognee',
    library_url: 'https://github.com/topoteretes/cognee',
    library_license: 'Apache-2.0',
    library_stars: 4000,
    evaluated_by: 'CTO Agent (deepseek-r1:14b)',
    evaluated_at: new Date().toISOString(),
    criteria,
    weighted_score,
    verdict,
    verdict_reasoning: verdict === 'ADOPT'
      ? 'Strong knowledge graph capabilities with native pgvector support. Complements BrainX episodic memory. Good docs and community. Recommended for semantic memory layer in Phase 2A Achiri.'
      : verdict === 'PARTIAL'
        ? 'Good graph quality but local model support needs validation. Adopt for knowledge graph features, test with qwen3:14b before production commitment.'
        : 'Does not meet minimum criteria. Evaluate alternatives.',
    next_steps: [
      'Install cognee in dev environment and test with qwen3:14b via Ollama',
      'Design unified BrainX + Cognee schema (AMD-03 spec)',
      'Build Achiri knowledge graph for cultural context (Phase 2A)',
      'Compare with EVAL-001 OpenViking: use Cognee for memory, OpenViking for skills',
      'Test entity extraction quality on Kognai domain content',
    ],
    blockers: verdict !== 'ADOPT' ? [
      'Local model quality validation needed before production use',
    ] : [],
  };

  return report;
}

if (require.main === module) {
  const report = runEval002();
  printEvalReport(report);

  const { valid, errors } = validateReport(report);
  if (!valid) {
    console.error('Validation errors:', errors);
    process.exitCode = 1;
  }
}
