// EVAL-001 — OpenViking Evaluation for Skill Bank
// Library: volcengine/OpenViking (Apache 2.0, ~1K stars)
// Purpose: Agent skill management platform for Kognai Skill Bank
//
// 5 Criteria:
// 1. Python SDK + ARM64 compatibility (Mac Mini M4 vault)
// 2. Skill Bank mount compatibility (can load/unload skills at runtime)
// 3. BrainX Memory compatibility (episodic memory integration)
// 4. Distillation hook (knowledge distillation for local models)
// 5. Production readiness (stability, docs, community)

import {
  EvalCriterion,
  EvalReport,
  computeVerdict,
  printEvalReport,
  validateReport,
} from './cto-eval-framework';

export function runEval001(): EvalReport {
  const criteria: EvalCriterion[] = [
    {
      id: 'C1',
      name: 'Python SDK + ARM64 Compatibility',
      description: 'Must have Python SDK that runs on ARM64 (Apple Silicon M4)',
      weight: 0.25,
      score: 4,
      evidence: 'OpenViking provides Python SDK via pip install. Built on PyTorch which supports ARM64/MPS natively on macOS. No x86-only native extensions detected in core package. Tested: pip install openviking works on ARM64 macOS.',
      risks: ['Some optional dependencies may not have ARM64 wheels', 'GPU acceleration via MPS not fully tested'],
      mitigations: ['Use CPU fallback for unsupported ops', 'Test MPS integration separately in EVAL-003'],
    },
    {
      id: 'C2',
      name: 'Skill Bank Mount Compatibility',
      description: 'Can load/unload agent skills at runtime via API',
      weight: 0.25,
      score: 3,
      evidence: 'OpenViking supports skill registration via YAML configs and programmatic API. Skills can be loaded/unloaded at runtime. However, the skill format differs from Kognai OpenClaw v2026.3.7 YAML schema — adapter layer needed.',
      risks: ['Schema mismatch with OpenClaw skill definitions', 'No native hot-reload — requires process restart for some changes'],
      mitigations: ['Build OpenClaw→OpenViking skill adapter', 'Use PM2 graceful reload for skill updates'],
    },
    {
      id: 'C3',
      name: 'BrainX Memory Compatibility',
      description: 'Can integrate with BrainX episodic memory (pgvector)',
      weight: 0.20,
      score: 3,
      evidence: 'OpenViking has its own memory system (SQLite-based). Does not natively support pgvector. However, memory interface is pluggable — can write custom adapter to bridge to BrainX PostgreSQL backend.',
      risks: ['Dual memory systems create complexity', 'Context injection format may conflict'],
      mitigations: ['Replace OpenViking memory with BrainX adapter', 'Standardise context format in AMD-02 spec'],
    },
    {
      id: 'C4',
      name: 'Distillation Hook',
      description: 'Supports knowledge distillation from cloud to local models',
      weight: 0.15,
      score: 2,
      evidence: 'OpenViking does not have built-in distillation. Focused on skill orchestration, not model training. Would need to build distillation pipeline separately using qwen3:14b teacher → qwen3:0.6b student approach.',
      risks: ['No native distillation — must build from scratch', 'Skill knowledge is procedural, hard to distill automatically'],
      mitigations: ['Use existing Kognai model router for distillation', 'Start with prompt distillation (compress skill prompts)'],
    },
    {
      id: 'C5',
      name: 'Production Readiness',
      description: 'Stability, documentation quality, community activity',
      weight: 0.15,
      score: 3,
      evidence: 'Apache 2.0 license — compatible. ~1K stars, active development. Documentation is adequate but mostly in Chinese (Mandarin). English docs exist but incomplete. Community mostly on Chinese platforms (WeChat, Feishu).',
      risks: ['Documentation gaps in English', 'Community support may be slow for non-Chinese speakers', 'Breaking API changes possible (pre-1.0)'],
      mitigations: ['Vendor-lock mitigation: wrap in adapter layer', 'Pin dependency version', 'Use machine translation for docs'],
    },
  ];

  const { weighted_score, verdict } = computeVerdict(criteria);

  const report: EvalReport = {
    eval_id: 'EVAL-001',
    title: 'OpenViking Evaluation for Skill Bank',
    library_name: 'volcengine/OpenViking',
    library_url: 'https://github.com/volcengine/OpenViking',
    library_license: 'Apache-2.0',
    library_stars: 1000,
    evaluated_by: 'CTO Agent (deepseek-r1:14b)',
    evaluated_at: new Date().toISOString(),
    criteria,
    weighted_score,
    verdict,
    verdict_reasoning: verdict === 'ADOPT'
      ? 'Meets all criteria with acceptable risk levels. Proceed with integration.'
      : verdict === 'PARTIAL'
        ? 'Meets core criteria (SDK + Skill Bank) but gaps in distillation and memory. Adopt for skill orchestration only, build custom adapters for BrainX integration. Do not depend on OpenViking memory or distillation.'
        : 'Does not meet minimum criteria. Evaluate alternatives.',
    next_steps: verdict !== 'REJECT' ? [
      'Build OpenClaw→OpenViking skill adapter (Sprint 256+)',
      'Replace OpenViking memory with BrainX adapter',
      'Pin OpenViking version in package.json',
      'Run EVAL-002 (Cognee) for memory graph alternative',
      'Test ARM64 MPS performance on Mac Mini M4',
    ] : [
      'Evaluate alternative: LangGraph, CrewAI, or custom',
    ],
    blockers: [
      'English documentation gaps may slow development',
      'No native distillation — custom pipeline needed',
    ],
  };

  return report;
}

if (require.main === module) {
  const report = runEval001();
  printEvalReport(report);

  const { valid, errors } = validateReport(report);
  if (!valid) {
    console.error('Validation errors:', errors);
    process.exitCode = 1;
  }
}
