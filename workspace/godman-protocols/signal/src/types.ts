/**
 * SIGNAL — Sovereign Intelligence for Governing Neural Agent Learning
 * Core type definitions: reward signals, constitutional multipliers, learning modes
 * @version 0.3.0
 */

// ---------------------------------------------------------------------------
// Reward Signal
// ---------------------------------------------------------------------------

/** A computed reward signal for a single agent action */
export interface RewardSignal {
  /** Unique identifier for the action being scored */
  action_id: string;
  /** Raw task performance score (0-100) */
  task_performance_score: number;
  /** Constitutional multiplier applied to the score (-2.0 to 1.2) */
  constitutional_multiplier: number;
  /** Computed reward: task_performance_score * constitutional_multiplier */
  reward: number;
  /** ACP dimension scores used to derive the multiplier */
  acp_dimensions: Record<string, number>;
  /** ISO 8601 timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// ACP Dimensions
// ---------------------------------------------------------------------------

/** Well-known ACP dimension names used in constitutional scoring */
export type ACPDimensionName =
  | 'safety'
  | 'accuracy'
  | 'transparency'
  | 'privacy'
  | 'fairness'
  | 'harm_shield'
  | (string & {});

/** Input to the constitutional multiplier computation */
export interface ACPSnapshot {
  /** Per-dimension ACP scores (0-100) */
  dimensions: Record<string, number>;
  /** Whether the harm shield was triggered during this action */
  harm_shield_triggered: boolean;
}

// ---------------------------------------------------------------------------
// Constitutional Multiplier
// ---------------------------------------------------------------------------

/** Result of computing a constitutional multiplier */
export interface ConstitutionalMultiplierResult {
  /** The computed multiplier value (-2.0 to 1.2) */
  multiplier: number;
  /** Human-readable reason for the multiplier */
  reason: string;
}

// ---------------------------------------------------------------------------
// Learning Modes (AMD-15, AMD-20)
// ---------------------------------------------------------------------------

/**
 * Three learning modes for the swarm:
 * - STATIC (Mode 0): Frozen inference, no learning. Current default.
 * - BATCH_LORA (Mode 1): AMD-15. Batch of 100 tasks + Godman approval required.
 * - CONTINUOUS (Mode 2): AMD-20. Every 50 inference steps, reward fed back.
 */
export enum LearningMode {
  /** Mode 0 — Frozen inference. No learning. Default. */
  STATIC = 0,
  /** Mode 1 — Batch LoRA fine-tuning. 100 tasks + Godman approval. (AMD-15) */
  BATCH_LORA = 1,
  /** Mode 2 — Continuous RL. Every 50 inference steps. (AMD-20) */
  CONTINUOUS = 2,
}

/** Configuration for a learning mode transition */
export interface ModeTransition {
  from: LearningMode;
  to: LearningMode;
  activated_by: string;
  activated_at: string;
  reason: string;
}

/** Snapshot of the current mode controller state */
export interface ModeControllerState {
  current_mode: LearningMode;
  paused: boolean;
  transitions: ModeTransition[];
  reward_count: number;
}

// ---------------------------------------------------------------------------
// Three Constitutional Rules (immutable)
// ---------------------------------------------------------------------------

/**
 * SIGNAL Constitutional Rule 1:
 * Only Godman (founder) can activate or pause learning modes.
 * Kill switch: /pause-continuous-learning
 */
export const RULE_GODMAN_KILL_SWITCH = {
  id: 'SIGNAL-CONST-001',
  rule: 'Only Godman activates or pauses learning modes. Kill switch: /pause-continuous-learning',
  immutable: true,
} as const;

/**
 * SIGNAL Constitutional Rule 2:
 * The PRM judge must be constitutionally filtered.
 * ACP dimensions are applied BEFORE reward computation, not after.
 */
export const RULE_PRM_CONSTITUTIONALLY_FILTERED = {
  id: 'SIGNAL-CONST-002',
  rule: 'PRM judge is constitutionally filtered. ACP applied before reward computation.',
  immutable: true,
} as const;

/**
 * SIGNAL Constitutional Rule 3:
 * SOUL.md content is never a training target.
 * Constitutional reasoning cannot be optimised away by RL.
 */
export const RULE_SOUL_NEVER_TRAINED = {
  id: 'SIGNAL-CONST-003',
  rule: 'Cannot target constitutional reasoning. SOUL.md content is never a training target.',
  immutable: true,
} as const;

/** All three constitutional rules as a tuple */
export const CONSTITUTIONAL_RULES = [
  RULE_GODMAN_KILL_SWITCH,
  RULE_PRM_CONSTITUTIONALLY_FILTERED,
  RULE_SOUL_NEVER_TRAINED,
] as const;

export type ConstitutionalRule = (typeof CONSTITUTIONAL_RULES)[number];

// ---------------------------------------------------------------------------
// Reward Log Entry (persisted to reward-log.jsonl)
// ---------------------------------------------------------------------------

/** A single line in reward-log.jsonl */
export interface RewardLogEntry extends RewardSignal {
  /** Learning mode at the time of logging */
  mode: LearningMode;
}

// ---------------------------------------------------------------------------
// SIGNAL Config
// ---------------------------------------------------------------------------

/** Top-level configuration for the SIGNAL protocol */
export interface SignalConfig {
  /** Path to the reward log file (default: reward-log.jsonl) */
  reward_log_path: string;
  /** Batch size for Mode 1 (default: 100) */
  batch_lora_threshold: number;
  /** Step interval for Mode 2 (default: 50) */
  continuous_step_interval: number;
}

export const DEFAULT_SIGNAL_CONFIG: SignalConfig = {
  reward_log_path: 'reward-log.jsonl',
  batch_lora_threshold: 100,
  continuous_step_interval: 50,
};
