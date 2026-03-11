/**
 * model-router.ts — Expertise routing matrix for ClawRouter model selection
 *
 * Maps task types to specialist models. Includes 3 Kognai-specific types
 * beyond the Invoica base (refactor-complex, agent-framework, codebase-scan).
 */

// ── Task Types ────────────────────────────────────────────────────────────────

export type TaskType =
  | 'code' | 'reason' | 'lang' | 'util' | 'audit' | 'content' | 'data'
  | 'refactor-complex' | 'agent-framework' | 'codebase-scan';

// ── Expertise Routing Matrix ──────────────────────────────────────────────────

interface ModelRoute { primary: string; fallback: string; }

const EXPERTISE_MODELS: Record<TaskType, ModelRoute> = {
  // Base types (same as Invoica)
  code:             { primary: 'deepseek/deepseek-chat',       fallback: 'anthropic/claude-haiku-4.5' },
  reason:           { primary: 'deepseek/deepseek-reasoner',   fallback: 'anthropic/claude-sonnet-4.6' },
  lang:             { primary: 'anthropic/claude-haiku-4.5',   fallback: 'google/gemini-2.5-flash' },
  util:             { primary: 'google/gemini-2.5-flash-lite', fallback: 'anthropic/claude-haiku-4.5' },
  audit:            { primary: 'anthropic/claude-sonnet-4.6',  fallback: 'deepseek/deepseek-chat' },
  content:          { primary: 'anthropic/claude-haiku-4.5',   fallback: 'google/gemini-2.5-flash' },
  data:             { primary: 'deepseek/deepseek-chat',       fallback: 'anthropic/claude-haiku-4.5' },
  // Kognai-specific extensions
  'refactor-complex': { primary: 'anthropic/claude-sonnet-4.6', fallback: 'deepseek/deepseek-reasoner' },
  'agent-framework':  { primary: 'deepseek/deepseek-chat',      fallback: 'anthropic/claude-haiku-4.5' },
  'codebase-scan':    { primary: 'google/gemini-2.5-flash',     fallback: 'deepseek/deepseek-chat' },
};

// ── Legacy Aliases ─────────────────────────────────────────────────────────────

const MODEL_ALIASES: Record<string, string> = {
  'MiniMax-M2.5':              'minimax/minimax-m2.5',
  'minimax-m2.5':              'minimax/minimax-m2.5',
  'minimax-m2.5-lightning':    'minimax/minimax-m2.5',
  'minimax':                   'minimax/minimax-m2.5',
  'coding':                    'deepseek/deepseek-chat',
  'claude-haiku-4-5':          'anthropic/claude-haiku-4.5',
  'claude-haiku-4.5':          'anthropic/claude-haiku-4.5',
  'claude-sonnet-4':           'anthropic/claude-sonnet-4.6',
  'claude-sonnet-4.6':         'anthropic/claude-sonnet-4.6',
  'claude-3-haiku-20240307':   'anthropic/claude-haiku-4.5',
  'claude-3-5-sonnet-20241022':'anthropic/claude-sonnet-4.6',
  'claude-sonnet-4-20250514':  'anthropic/claude-sonnet-4.6',
};

// ── Task Classification ────────────────────────────────────────────────────────

const TASK_PATTERNS: Array<{ type: TaskType; keywords: RegExp }> = [
  { type: 'refactor-complex', keywords: /\b(refactor|restructure|migration|redesign|rewrite|overhaul)\b/i },
  { type: 'agent-framework',  keywords: /\b(agent|swarm|orchestrat|pipeline|workflow|framework\s+\w+)\b/i },
  { type: 'codebase-scan',    keywords: /\b(scan|codebase|search|index|inventory|dependency\s+audit|grep)\b/i },
  { type: 'code',    keywords: /\b(code|function|debug|implement|typescript|javascript|python|fix\s+bug|compile|syntax|class\s+\w+|import\s+|async\s+function|interface\s+\w+)\b/i },
  { type: 'audit',   keywords: /\b(security|audit|review|compliance|vulnerability|penetration|cve|owasp|exploit|threat|risk\s+assess)\b/i },
  { type: 'data',    keywords: /\b(query|sql|database|aggregate|join|select\s+|group\s+by|csv|dataframe|pandas|analytics|metrics)\b/i },
  { type: 'lang',    keywords: /\b(translate|translation|french|arabic|spanish|german|chinese|japanese|locali[sz]e|multilingual|i18n)\b/i },
  { type: 'reason',  keywords: /\b(why|explain|analy[sz]e|tradeoff|compare|evaluate|pros\s+and\s+cons|reasoning|think\s+through)\b/i },
  { type: 'content', keywords: /\b(write|draft|compose|blog|caption|essay|article|tweet|post|newsletter|marketing|creative\s+writ)\b/i },
  { type: 'util',    keywords: /\b(classify|tag|format|parse|extract|convert|summarize|json|xml|regex|validate|clean|normalize)\b/i },
];

export function classifyTask(prompt: string): TaskType {
  for (const { type, keywords } of TASK_PATTERNS) {
    if (keywords.test(prompt)) return type;
  }
  return 'util';
}

export function selectModel(prompt: string, requestedModel?: string): {
  model: string;
  taskType: TaskType;
  autoClassified: boolean;
} {
  if (requestedModel && requestedModel.includes('/')) {
    return { model: requestedModel, taskType: classifyTask(prompt), autoClassified: false };
  }
  if (requestedModel && MODEL_ALIASES[requestedModel]) {
    return { model: MODEL_ALIASES[requestedModel], taskType: classifyTask(prompt), autoClassified: false };
  }
  if (requestedModel && requestedModel in EXPERTISE_MODELS) {
    const taskType = requestedModel as TaskType;
    return { model: EXPERTISE_MODELS[taskType].primary, taskType, autoClassified: false };
  }
  const taskType = classifyTask(prompt);
  return { model: EXPERTISE_MODELS[taskType].primary, taskType, autoClassified: true };
}

export function getFallbackModel(taskType: TaskType): string {
  return EXPERTISE_MODELS[taskType].fallback;
}

export { EXPERTISE_MODELS };
