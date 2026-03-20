// EVAL-003 — Context Hub (chub CLI) Evaluation for AMD-02 Skill Bank Retrieval
// Library: andrewyng/context-hub (MIT, ~6.1K stars)
// Purpose: Curated API documentation registry for coding agents
//
// 5 Criteria:
// 1. CLI usability + Node.js SDK (can agents invoke chub programmatically?)
// 2. Skill Bank retrieval mapping (AMD-02 skill documentation interface)
// 3. Local registry + offline support (Mac Mini vault, cost $0)
// 4. Annotation/feedback loop (agents learn from past sessions)
// 5. Production readiness (stability, coverage, community)

import {
  EvalCriterion,
  EvalReport,
  computeVerdict,
  printEvalReport,
  validateReport,
} from './cto-eval-framework';

export function runEval003(): EvalReport {
  const criteria: EvalCriterion[] = [
    {
      id: 'C1',
      name: 'CLI Usability + Node.js SDK',
      description: 'Can Kognai agents invoke chub programmatically from TypeScript?',
      weight: 0.20,
      score: 4,
      evidence: 'chub CLI installed via npm install -g @aisuite/chub. Commands: chub search, chub get, chub annotate, chub feedback. CLI is Node.js-based, can be exec\'d from TypeScript via child_process or used as library import. Standard npm package, no native deps. Works on ARM64 macOS (Mac Mini M4).',
      risks: ['No documented TypeScript SDK — CLI-only interface', 'child_process wrapping adds latency vs native API'],
      mitigations: ['Wrap chub CLI in thin TypeScript adapter (10-20 lines)', 'Cache frequently used docs locally to avoid repeated CLI calls'],
    },
    {
      id: 'C2',
      name: 'Skill Bank Retrieval Mapping (AMD-02)',
      description: 'Can chub serve as retrieval interface for Kognai Skill Bank?',
      weight: 0.25,
      score: 3,
      evidence: 'chub provides curated API docs (68 providers: Stripe, Supabase, Anthropic, etc.). Maps well to AMD-02 requirement: agents need current API docs when writing integration code. However, chub is docs-only — it doesn\'t store skill definitions (OpenClaw YAML), execution configs, or runtime state. Would serve as documentation layer ALONGSIDE Skill Bank, not as Skill Bank itself.',
      risks: ['Not a skill registry — only documentation', 'Kognai skills are agent configs (YAML + prompt.md), not API docs', 'Conflation risk: chub solves docs, not skill orchestration'],
      mitigations: ['Use chub for API docs only, keep OpenClaw for skill definitions', 'Build adapter: skill → relevant chub docs lookup', 'Clear separation: Skill Bank (what to do) vs chub (how APIs work)'],
    },
    {
      id: 'C3',
      name: 'Local Registry + Offline Support',
      description: 'Can chub work offline on Mac Mini vault ($0 cost)?',
      weight: 0.20,
      score: 3,
      evidence: 'chub get fetches from remote registry on first call, then caches locally. chub annotate writes to local registry. However, initial fetch requires internet. No built-in offline-first mode or full registry mirror. For Kognai vault use: pre-fetch all needed docs once, then operate from cache.',
      risks: ['No offline-first mode — requires initial internet fetch', 'Cache invalidation unclear (docs update upstream)', 'Registry size could grow large if all 68 providers cached'],
      mitigations: ['Pre-fetch needed providers (Stripe, Supabase, Anthropic) on vault setup', 'Cron job to refresh cache weekly', 'Only cache providers actually used by Kognai agents'],
    },
    {
      id: 'C4',
      name: 'Annotation/Feedback Loop',
      description: 'Can agents learn from past sessions and improve docs?',
      weight: 0.20,
      score: 4,
      evidence: 'chub annotate saves agent notes to local registry — next session auto-appends. chub feedback rates docs (up/down, labels: accurate/outdated/wrong-examples). This maps well to Kognai swarm learning: Sherlock supervisor could annotate docs after finding API issues, and all future sprints benefit. Persistent learning across sessions without LLM memory.',
      risks: ['Annotations are local only — not shared across machines', 'No integration with Kognai event bus (Supabase kognai_events)'],
      mitigations: ['Sync annotations via git (commit chub local registry)', 'Build bridge: chub annotations → kognai_events for cross-agent visibility'],
    },
    {
      id: 'C5',
      name: 'Production Readiness',
      description: 'Stability, documentation quality, community activity',
      weight: 0.15,
      score: 4,
      evidence: 'MIT license — fully compatible. 6.1K stars in 2 weeks (Mar 2026). 68 API providers in registry. Active community contributions. Backed by Andrew Ng / AI Fund. Well-documented README with examples. Node.js ecosystem — same as Kognai stack. No breaking changes yet (v1.x).',
      risks: ['Very new (Mar 2026) — may have undiscovered bugs', 'Rapid growth may lead to breaking API changes', 'Dependency on external registry availability'],
      mitigations: ['Pin version in package.json', 'Local cache provides resilience', 'MIT license allows forking if project stalls'],
    },
  ];

  const { weighted_score, verdict } = computeVerdict(criteria);

  const report: EvalReport = {
    eval_id: 'EVAL-003',
    title: 'Context Hub (chub CLI) Evaluation for AMD-02 Skill Bank Retrieval',
    library_name: 'andrewyng/context-hub',
    library_url: 'https://github.com/andrewyng/context-hub',
    library_license: 'MIT',
    library_stars: 6100,
    evaluated_by: 'CTO Agent (claude-sonnet)',
    evaluated_at: new Date().toISOString(),
    criteria,
    weighted_score,
    verdict,
    verdict_reasoning: verdict === 'ADOPT'
      ? 'Context Hub is a strong documentation layer for Kognai agents. ADOPT for API docs retrieval. NOT a replacement for Skill Bank — use alongside OpenClaw skill registry. Key value: annotation/feedback loop enables swarm learning across sessions.'
      : verdict === 'PARTIAL'
        ? 'Context Hub provides good API docs retrieval but is docs-only, not a skill registry. PARTIAL adopt: use for API documentation layer alongside OpenClaw Skill Bank. Do not conflate with AMD-02 skill orchestration.'
        : 'Does not meet minimum criteria for Kognai integration.',
    next_steps: verdict !== 'REJECT' ? [
      'Install chub CLI on dev machine: npm install -g @aisuite/chub',
      'Pre-fetch Kognai-relevant providers: Stripe, Supabase, Anthropic, ElevenLabs',
      'Build thin TypeScript wrapper: scripts/lib/chub-adapter.ts',
      'Wire into swarm: Messi coder agent gets chub docs before writing API code',
      'Test annotation persistence across sprint sessions',
    ] : [
      'Evaluate alternative: custom docs registry or MCP-based approach',
    ],
    blockers: [
      'No TypeScript SDK — CLI wrapper needed',
      'Docs-only — does not replace OpenClaw Skill Bank for skill orchestration',
    ],
  };

  return report;
}

if (require.main === module) {
  const report = runEval003();
  printEvalReport(report);

  const { valid, errors } = validateReport(report);
  if (!valid) {
    console.error('Validation errors:', errors);
    process.exitCode = 1;
  }
}
