/**
 * SIGNAL — Sovereign Intelligence for Governing Neural Agent Learning
 * ModeController: manages learning mode transitions with Godman kill switch
 * @version 0.3.0
 */

import {
  LearningMode,
  RULE_GODMAN_KILL_SWITCH,
  type ModeTransition,
  type ModeControllerState,
  type RewardSignal,
} from './types.js';

/**
 * ModeController governs learning mode transitions.
 *
 * Constitutional Rule 1 (SIGNAL-CONST-001): Only Godman can activate
 * or pause learning. The kill switch `/pause-continuous-learning`
 * immediately drops to Mode 0 (STATIC).
 *
 * The controller maintains a transition log for auditability.
 */
export class ModeController {
  private mode: LearningMode = LearningMode.STATIC;
  private paused = false;
  private transitions: ModeTransition[] = [];
  private rewardLog: RewardSignal[] = [];

  /**
   * Get the current active learning mode.
   * If paused, returns STATIC regardless of the configured mode.
   */
  getCurrentMode(): LearningMode {
    if (this.paused) {
      return LearningMode.STATIC;
    }
    return this.mode;
  }

  /**
   * Activate a learning mode.
   * Only Godman (founder) can call this — enforcement is the caller's
   * responsibility, but the transition is logged with the activator identity.
   *
   * @param target - The learning mode to activate
   * @param activatedBy - Identity of the activator (must be Godman)
   * @param reason - Why this transition is happening
   */
  activate(
    target: LearningMode,
    activatedBy: string,
    reason: string
  ): ModeTransition {
    const transition: ModeTransition = {
      from: this.mode,
      to: target,
      activated_by: activatedBy,
      activated_at: new Date().toISOString(),
      reason,
    };

    this.mode = target;
    this.paused = false;
    this.transitions.push(transition);
    return transition;
  }

  /**
   * Pause all learning — drops to Mode 0 (STATIC) immediately.
   * This is the kill switch (SIGNAL-CONST-001).
   *
   * @param pausedBy - Identity of the pauser (must be Godman)
   * @param reason - Why learning is being paused
   */
  pause(pausedBy: string, reason: string): ModeTransition {
    const transition: ModeTransition = {
      from: this.mode,
      to: LearningMode.STATIC,
      activated_by: pausedBy,
      activated_at: new Date().toISOString(),
      reason: `[KILL SWITCH] ${reason}`,
    };

    this.paused = true;
    this.transitions.push(transition);
    return transition;
  }

  /**
   * Record a reward signal in the in-memory log.
   * Used for batch accumulation in Mode 1 (BATCH_LORA).
   */
  recordReward(signal: RewardSignal): void {
    this.rewardLog.push(signal);
  }

  /**
   * Get the in-memory reward log.
   */
  getRewardLog(): ReadonlyArray<RewardSignal> {
    return [...this.rewardLog];
  }

  /**
   * Check whether the batch threshold has been reached (Mode 1).
   * @param threshold - Number of tasks required (default: 100)
   */
  batchReady(threshold = 100): boolean {
    return this.rewardLog.length >= threshold;
  }

  /** Whether learning is currently paused */
  get isPaused(): boolean {
    return this.paused;
  }

  /** Full transition history */
  getTransitions(): ReadonlyArray<ModeTransition> {
    return [...this.transitions];
  }

  /** Export current state for persistence or inspection */
  getState(): ModeControllerState {
    return {
      current_mode: this.getCurrentMode(),
      paused: this.paused,
      transitions: [...this.transitions],
      reward_count: this.rewardLog.length,
    };
  }

  /** The constitutional rule governing this controller */
  static readonly KILL_SWITCH_RULE = RULE_GODMAN_KILL_SWITCH;
}
