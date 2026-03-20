// Achiri Context Window Manager — Sprint 306
// Token-budget based turn selector for Ollama models.
// Ensures conversation history fits within model context limits.
// Uses char-based token estimation (1 token ≈ 4 chars for multilingual).
//
// Strategy:
//   1. Always include the most recent N turns (RECENCY_MIN)
//   2. Fill remaining budget with older turns, preferring user turns with facts
//   3. Never exceed TOKEN_BUDGET

import type { ConversationTurn } from './index';

// Token budget per model tier (conservative estimates for system prompt + response headroom)
// These represent the MAX tokens for conversation history only
const TIER_BUDGETS: Record<string, number> = {
  'qwen3:0.6b': 1500,   // ~6K context, minus system prompt + response
  'qwen3:4b':   3000,    // ~16K context
  'qwen3:14b':  6000,    // ~32K context
  'deepseek-r1:14b': 6000,
  'claude-haiku-4-5-20251001': 8000,
  'claude-sonnet-4-6-20250514': 12000,
};

const DEFAULT_BUDGET = 3000;
const RECENCY_MIN = 6;      // Always include last 6 turns (3 exchanges)
const CHARS_PER_TOKEN = 4;   // Conservative for multilingual (Derja + French + English)

/** Estimate token count from text using char-based heuristic */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Get token budget for a given model */
export function getTokenBudget(model: string): number {
  return TIER_BUDGETS[model] ?? DEFAULT_BUDGET;
}

/**
 * Select turns that fit within the token budget.
 * Always includes the most recent RECENCY_MIN turns.
 * Fills remaining budget with older turns (newest-first).
 */
export function selectTurnsWithinBudget(
  history: ConversationTurn[],
  model: string,
): ConversationTurn[] {
  if (history.length === 0) return [];

  const budget = getTokenBudget(model);

  // If history is small enough, check if it all fits
  const totalTokens = history.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  if (totalTokens <= budget) return history;

  // Phase 1: Always include the most recent turns
  const recentCount = Math.min(RECENCY_MIN, history.length);
  const recentTurns = history.slice(-recentCount);
  let usedTokens = recentTurns.reduce((sum, t) => sum + estimateTokens(t.content), 0);

  // If even recent turns exceed budget, trim from the oldest of the recent
  if (usedTokens > budget) {
    const trimmed: ConversationTurn[] = [];
    let tokens = 0;
    for (let i = recentTurns.length - 1; i >= 0; i--) {
      const t = estimateTokens(recentTurns[i].content);
      if (tokens + t > budget) break;
      tokens += t;
      trimmed.unshift(recentTurns[i]);
    }
    return trimmed;
  }

  // Phase 2: Fill remaining budget with older turns (newest-first from the older set)
  const olderTurns = history.slice(0, -recentCount);
  const selected: ConversationTurn[] = [];
  const remainingBudget = budget - usedTokens;
  let filled = 0;

  for (let i = olderTurns.length - 1; i >= 0; i--) {
    const t = estimateTokens(olderTurns[i].content);
    if (filled + t > remainingBudget) break;
    filled += t;
    selected.unshift(olderTurns[i]);
  }

  return [...selected, ...recentTurns];
}
