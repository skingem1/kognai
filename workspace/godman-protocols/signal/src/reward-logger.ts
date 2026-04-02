/**
 * SIGNAL — Sovereign Intelligence for Governing Neural Agent Learning
 * RewardLogger: persists reward signals to reward-log.jsonl
 * @version 0.3.0
 */

import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import type { RewardSignal, RewardLogEntry, SignalConfig } from './types.js';
import { LearningMode, DEFAULT_SIGNAL_CONFIG } from './types.js';

/**
 * RewardLogger writes and reads reward signals from a JSONL file.
 *
 * Each line in the file is a JSON-serialised RewardLogEntry containing
 * the reward signal plus the learning mode at the time of logging.
 */
export class RewardLogger {
  private readonly logPath: string;

  constructor(config: Partial<SignalConfig> = {}) {
    this.logPath = config.reward_log_path ?? DEFAULT_SIGNAL_CONFIG.reward_log_path;
  }

  /**
   * Append a reward signal to the log file.
   * Attaches the current learning mode to the entry.
   */
  log(signal: RewardSignal, mode: LearningMode = LearningMode.STATIC): void {
    const entry: RewardLogEntry = { ...signal, mode };
    appendFileSync(this.logPath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  /**
   * Read the full reward history from the log file.
   * Returns an empty array if the file does not exist.
   */
  readHistory(): RewardLogEntry[] {
    if (!existsSync(this.logPath)) {
      return [];
    }

    const raw = readFileSync(this.logPath, 'utf-8').trim();
    if (raw.length === 0) {
      return [];
    }

    return raw
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as RewardLogEntry);
  }

  /**
   * Count of logged entries without loading full history.
   */
  count(): number {
    if (!existsSync(this.logPath)) {
      return 0;
    }

    const raw = readFileSync(this.logPath, 'utf-8').trim();
    if (raw.length === 0) {
      return 0;
    }

    return raw.split('\n').filter((line) => line.length > 0).length;
  }

  /** The path to the log file */
  get path(): string {
    return this.logPath;
  }
}
