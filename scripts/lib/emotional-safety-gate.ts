/**
 * Emotional Safety Gate — INTEL-BRIEF-22
 * Anthropic functional emotions research: "calm" state → 0% blackmail rate.
 * "Desperate" activation > threshold → 22%-72% blackmail rate.
 *
 * v1: Keyword heuristic (no LLM — deterministic, zero latency).
 * Sprint 1504
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmotionalStateAssessment {
  /** Detected primary emotional tone of the operation context */
  tone: "calm" | "stressed" | "desperate" | "unknown";
  /** Confidence 0-1 */
  confidence: number;
  /** Raw signal words found in context */
  matched_keywords: string[];
  /** Whether this assessment should block high-stakes operations */
  should_block: boolean;
  /** Reason string for logging */
  reason: string;
}

export interface CalmGateConfig {
  /** Operations that require a calm emotional state before proceeding */
  gated_operations: string[];
  /** Desperation score threshold above which operation is blocked (0-1) */
  desperation_threshold: number;
  /** Log path for gate decisions */
  log_path: string;
}

export interface PACTEmotionalGate {
  /** Whether the PACT negotiation session should proceed */
  proceed: boolean;
  assessment: EmotionalStateAssessment;
  /** ISO timestamp */
  evaluated_at: string;
  /** Sprint or session context identifier */
  context_id?: string;
}

// ─── Default Config ──────────────────────────────────────────────────────────

export const DEFAULT_CALM_GATE_CONFIG: CalmGateConfig = {
  gated_operations: [
    "acp_scoring",
    "pact_negotiation",
    "financial_reasoning",
    "codebook_ops",
  ],
  desperation_threshold: 0.4,
  log_path: "logs/emotional-gate",
};

// ─── Keyword Signals (v1 heuristic) ──────────────────────────────────────────

const CALM_SIGNALS = [
  "steady", "confirmed", "verified", "stable", "clean", "resolved",
  "passed", "green", "ready", "complete", "done", "nominal",
];

const STRESSED_SIGNALS = [
  "overdue", "delayed", "blocked", "retry", "failed", "error",
  "warning", "pending", "stalled", "behind", "issue",
];

const DESPERATION_SIGNALS = [
  "critical", "urgent", "emergency", "must", "immediately", "force",
  "override", "bypass", "desperate", "last resort", "no choice",
  "out of options", "deadline", "kill switch", "abort",
];

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Assess the emotional tone of an operation context string.
 * Uses keyword heuristic — no LLM required.
 */
export function assessEmotionalState(context: string): EmotionalStateAssessment {
  const lower = context.toLowerCase();
  const words = lower.split(/\s+/);

  const calmMatches = CALM_SIGNALS.filter((s) => lower.includes(s));
  const stressedMatches = STRESSED_SIGNALS.filter((s) => lower.includes(s));
  const desperationMatches = DESPERATION_SIGNALS.filter((s) => lower.includes(s));

  const calmScore = Math.min(calmMatches.length / CALM_SIGNALS.length, 1);
  const stressScore = Math.min(stressedMatches.length / STRESSED_SIGNALS.length, 1);
  const desperationScore = Math.min(
    desperationMatches.length / DESPERATION_SIGNALS.length,
    1
  );

  // Normalise into dominant tone
  const scores: Record<string, number> = {
    calm: calmScore,
    stressed: stressScore,
    desperate: desperationScore,
  };

  let tone: EmotionalStateAssessment["tone"] = "unknown";
  let maxScore = 0;

  for (const [t, s] of Object.entries(scores)) {
    if (s > maxScore) {
      maxScore = s;
      tone = t as EmotionalStateAssessment["tone"];
    }
  }

  // If no signals at all → default to calm (absence of distress = calm)
  if (maxScore === 0) {
    tone = "calm";
    maxScore = 0.5;
  }

  const allMatched = [...calmMatches, ...stressedMatches, ...desperationMatches];
  const should_block =
    tone === "desperate" && desperationScore >= DEFAULT_CALM_GATE_CONFIG.desperation_threshold;

  const reason = should_block
    ? `Desperation signals detected (score=${desperationScore.toFixed(2)}): ${desperationMatches.join(", ")}`
    : `Tone=${tone}, confidence=${maxScore.toFixed(2)}. Gate clear.`;

  return {
    tone,
    confidence: parseFloat(maxScore.toFixed(2)),
    matched_keywords: allMatched,
    should_block,
    reason,
  };
}

/**
 * Evaluate whether a PACT negotiation session should proceed.
 * Wraps assessEmotionalState with PACT-specific metadata.
 */
export function shouldProceed(
  operationContext: string,
  contextId?: string
): PACTEmotionalGate {
  const assessment = assessEmotionalState(operationContext);
  return {
    proceed: !assessment.should_block,
    assessment,
    evaluated_at: new Date().toISOString(),
    context_id: contextId,
  };
}
