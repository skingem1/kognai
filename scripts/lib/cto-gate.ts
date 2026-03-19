// AMD-14 — CTO Gate: Dynamic Model Selection per Sprint Complexity
//
// Evaluates sprint JSON and selects optimal model tier:
//   T0 NANO  (qwen3:0.6b) — formatting, tagging only
//   T1 LOCAL (qwen3:4b)   — simple sprints: ≤2 tasks, single file, no API
//   T2 POWER (qwen3:14b)  — standard sprints: 3-5 tasks, multi-file, local
//   T3 CLOUD (Sonnet)     — complex sprints: API integration, multi-agent, >5 tasks
//   T4 APEX  (Opus)       — architecture decisions, gate evaluations (rarely used)
//
// Complexity factors: task count, file count, task types, external deps, API calls

export type ModelTier = 'T0_NANO' | 'T1_LOCAL' | 'T2_POWER' | 'T3_CLOUD' | 'T4_APEX';

export interface SprintTask {
  id: string;
  title: string;
  type: string;       // 'feature' | 'test' | 'bugfix' | 'refactor'
  task_type?: string;  // 'code' | 'research' | 'eval'
  agent?: string;
}

export interface SprintSpec {
  sprint_id: string;
  title: string;
  description: string;
  tasks: SprintTask[];
}

export interface ComplexityAnalysis {
  score: number;              // 1-10
  factors: string[];          // What drove the score
  task_count: number;
  unique_files: number;
  has_api_integration: boolean;
  has_external_deps: boolean;
  has_multi_agent: boolean;
  has_evaluation: boolean;
}

export interface CTOGateDecision {
  sprint_id: string;
  tier: ModelTier;
  model_name: string;
  cost_per_1k: number;        // USD
  complexity: ComplexityAnalysis;
  reasoning: string;
  overrides: string[];         // Manual overrides applied
}

// Model tier configs
const TIER_CONFIGS: Record<ModelTier, { model: string; cost: number }> = {
  T0_NANO:  { model: 'qwen3:0.6b',  cost: 0.00 },
  T1_LOCAL: { model: 'qwen3:4b',    cost: 0.00 },
  T2_POWER: { model: 'qwen3:14b',   cost: 0.00 },
  T3_CLOUD: { model: 'claude-sonnet-4-6', cost: 0.003 },
  T4_APEX:  { model: 'claude-opus-4-6',   cost: 0.015 },
};

// Complexity signals in task titles/descriptions
const COMPLEXITY_SIGNALS = {
  high: ['api', 'integration', 'multi-platform', 'orchestrat', 'pipeline', 'migration', 'auth', 'payment', 'stripe', 'deploy'],
  medium: ['refactor', 'validate', 'test', 'module', 'agent', 'evaluation', 'eval-', 'dashboard'],
  low: ['fix', 'rename', 'update', 'typo', 'comment', 'format', 'config', 'env'],
};

export function analyzeComplexity(sprint: SprintSpec): ComplexityAnalysis {
  const factors: string[] = [];
  let score = 3; // baseline

  const taskCount = sprint.tasks.length;
  factors.push(taskCount + ' tasks');

  // Task count scoring
  if (taskCount <= 2) { score -= 1; factors.push('few tasks (-1)'); }
  else if (taskCount >= 5) { score += 2; factors.push('many tasks (+2)'); }
  else if (taskCount >= 4) { score += 1; factors.push('moderate tasks (+1)'); }

  // Scan text for complexity signals
  const allText = (sprint.title + ' ' + sprint.description + ' ' + sprint.tasks.map(t => t.title).join(' ')).toLowerCase();

  let highSignals = 0;
  let lowSignals = 0;
  for (const signal of COMPLEXITY_SIGNALS.high) {
    if (allText.includes(signal)) highSignals++;
  }
  for (const signal of COMPLEXITY_SIGNALS.low) {
    if (allText.includes(signal)) lowSignals++;
  }

  if (highSignals >= 2) { score += 2; factors.push('high-complexity signals: ' + highSignals + ' (+2)'); }
  else if (highSignals >= 1) { score += 1; factors.push('high-complexity signal (+1)'); }

  if (lowSignals >= 2 && highSignals === 0) { score -= 1; factors.push('low-complexity signals (-1)'); }

  // Detect features
  const hasApi = allText.includes('api') || allText.includes('rest') || allText.includes('endpoint');
  const hasExternalDeps = allText.includes('npm') || allText.includes('install') || allText.includes('package');
  const hasMultiAgent = sprint.tasks.some(t => t.agent && t.agent !== sprint.tasks[0]?.agent);
  const hasEvaluation = allText.includes('eval') || allText.includes('evaluation');

  if (hasApi) { score += 1; factors.push('API integration (+1)'); }
  if (hasMultiAgent) { score += 1; factors.push('multi-agent (+1)'); }

  // Unique files estimate from task deliverables
  const uniqueFiles = new Set(sprint.tasks.map(t => t.id)).size;

  // Clamp score
  score = Math.max(1, Math.min(10, score));

  return {
    score,
    factors,
    task_count: taskCount,
    unique_files: uniqueFiles,
    has_api_integration: hasApi,
    has_external_deps: hasExternalDeps,
    has_multi_agent: hasMultiAgent,
    has_evaluation: hasEvaluation,
  };
}

export function selectTier(complexity: ComplexityAnalysis): ModelTier {
  if (complexity.score <= 2) return 'T1_LOCAL';
  if (complexity.score <= 4) return 'T2_POWER';
  if (complexity.score <= 7) return 'T2_POWER';  // Stay local for most work
  if (complexity.score <= 9) return 'T3_CLOUD';
  return 'T4_APEX';
}

export function evaluateSprint(sprint: SprintSpec, overrides?: { forceTier?: ModelTier }): CTOGateDecision {
  const complexity = analyzeComplexity(sprint);
  let tier = selectTier(complexity);
  const appliedOverrides: string[] = [];

  if (overrides?.forceTier) {
    appliedOverrides.push('Force tier: ' + overrides.forceTier + ' (was ' + tier + ')');
    tier = overrides.forceTier;
  }

  const config = TIER_CONFIGS[tier];

  const reasoning = [
    'Complexity score: ' + complexity.score + '/10',
    'Selected tier: ' + tier + ' (' + config.model + ')',
    'Cost: $' + config.cost + '/1K tokens',
    'Factors: ' + complexity.factors.join(', '),
  ].join('. ');

  return {
    sprint_id: sprint.sprint_id,
    tier,
    model_name: config.model,
    cost_per_1k: config.cost,
    complexity,
    reasoning,
    overrides: appliedOverrides,
  };
}

export function printDecision(decision: CTOGateDecision): void {
  console.log('');
  console.log('🎯 CTO Gate Decision: ' + decision.sprint_id);
  console.log('  Tier: ' + decision.tier + ' (' + decision.model_name + ')');
  console.log('  Cost: $' + decision.cost_per_1k + '/1K tokens');
  console.log('  Complexity: ' + decision.complexity.score + '/10');
  console.log('  Factors: ' + decision.complexity.factors.join(', '));
  if (decision.overrides.length > 0) {
    console.log('  Overrides: ' + decision.overrides.join(', '));
  }
}
