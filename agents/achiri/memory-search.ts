// Achiri — Memory Search T3 Skill (Sprint 128)
// Semantic memory search layer on top of AchiriMemoryStore JSONL.
// No external deps — keyword-overlap scoring ($0.00).
// searchMemory: finds relevant past turns by TF-IDF-like keyword match.
// getMemorySummary: extracts top recurring topics from user messages.
// injectMemoryContext: returns formatted context block for system prompt.

import type { ConversationTurn } from './index';
import { AchiriMemoryStore } from './memory-store';

export interface MemorySearchResult {
  turn: ConversationTurn;
  score: number;
  turn_index: number;
}

const store = new AchiriMemoryStore();

// Arabic + French + English stopwords (common in Tunisian messages)
const STOPWORDS = new Set([
  // English
  'i', 'me', 'my', 'you', 'your', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'it', 'its', 'this', 'that', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to',
  'for', 'with', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no',
  // French
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'les', 'le', 'la', 'un', 'une', 'des',
  'du', 'de', 'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'est',
  'en', 'dans', 'sur', 'avec', 'par', 'pour', 'pas', 'ne', 'se', 'ce', 'cet',
  // Arabic (Darija + MSA common particles)
  'في', 'من', 'على', 'إلى', 'مع', 'هو', 'هي', 'هم', 'أنا', 'أنت', 'كان',
  'يكون', 'هذا', 'هذه', 'ال', 'و', 'أو', 'لا', 'لكن', 'إن', 'أن',
]);

function tokenize(text: string): string[] {
  // Split on whitespace + punctuation, lowercase, remove stopwords, min 2 chars
  return text
    .toLowerCase()
    .split(/[\s\u0600-\u0605\u060C\u061B\u061F\u0640.,!?;:()\[\]{}<>"""'''\/\\|@#$%^&*+=~`\-_]+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function scoreTurn(turn: ConversationTurn, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const turnTokens = tokenize(turn.content);
  const turnSet = new Set(turnTokens);
  let matches = 0;
  for (const qt of queryTokens) {
    if (turnSet.has(qt)) matches++;
    // Partial match for longer tokens (prefix match)
    else if (qt.length > 4) {
      for (const tt of turnSet) {
        if (tt.startsWith(qt.slice(0, 4))) { matches += 0.5; break; }
      }
    }
  }
  // Normalize by query length, boost shorter turns (more focused)
  const precision = matches / queryTokens.length;
  const lengthPenalty = Math.min(1, 30 / Math.max(10, turnTokens.length));
  return precision * (0.7 + 0.3 * lengthPenalty);
}

// Search user's memory for turns relevant to the query.
// Returns top topK results sorted by score descending.
// Only searches user-role turns (not assistant).
export function searchMemory(
  userId: string,
  query: string,
  topK: number = 3,
): MemorySearchResult[] {
  const history = store.loadHistory(userId);
  if (history.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const results: MemorySearchResult[] = [];
  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const score = scoreTurn(turn, queryTokens);
    if (score > 0) results.push({ turn, score, turn_index: i });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

// Extracts the top recurring topics from a user's conversation history.
// Returns a human-readable summary string.
export function getMemorySummary(userId: string): string {
  const history = store.loadHistory(userId);
  const userTurns = history.filter(t => t.role === 'user');
  if (userTurns.length === 0) return 'No conversation history yet.';

  // Count token frequencies across all user messages
  const freq: Record<string, number> = {};
  for (const turn of userTurns) {
    for (const token of tokenize(turn.content)) {
      freq[token] = (freq[token] ?? 0) + 1;
    }
  }

  const topTopics = Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([token]) => token);

  const turnCount = userTurns.length;
  if (topTopics.length === 0) {
    return `${turnCount} messages exchanged. Topics still emerging.`;
  }
  return `${turnCount} messages exchanged. Key topics: ${topTopics.join(', ')}.`;
}

// Returns a context block to inject into the system prompt if relevant history exists.
// Returns null if no relevant history found (don't inject empty context).
export function injectMemoryContext(
  userId: string,
  currentMessage: string,
  topK: number = 3,
): string | null {
  const results = searchMemory(userId, currentMessage, topK);
  if (results.length === 0) return null;

  // Only inject if the best result has a meaningful score
  if (results[0].score < 0.15) return null;

  const excerpts = results
    .map(r => `- "${r.turn.content.slice(0, 100).trim()}${r.turn.content.length > 100 ? '...' : ''}"`)
    .join('\n');

  return `Based on our previous conversations, the user has mentioned:\n${excerpts}`;
}
