// Achiri Conversation Summarizer — Sprint 302
// Extracts key facts from older conversation turns before they're trimmed.
// Persists as workspace/achiri/summaries/<userId>.json.
// Zero LLM cost — pattern-based fact extraction ($0.00).
//
// Called by memory-store.ts during saveHistory() when turns > SUMMARY_THRESHOLD.
// Injected into system prompt by index.ts buildSystemPrompt().

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ConversationTurn } from './index';

const SUMMARIES_DIR = join('workspace', 'achiri', 'summaries');

export interface ConversationSummary {
  userId: string;
  facts: string[];           // key facts extracted (max 15)
  total_turns_summarized: number;
  last_updated: string;      // ISO datetime
}

// Patterns that indicate a user sharing personal info worth remembering
const FACT_PATTERNS: Array<{ pattern: RegExp; extract: (match: RegExpMatchArray, msg: string) => string | null }> = [
  // Name introduction
  { pattern: /(?:my name is|i'm|je m'appelle|ana|esmi|ismi)\s+(\w+)/i,
    extract: (m) => `User's name: ${m[1]}` },
  // Age
  { pattern: /(?:i'm|i am|ana|3omri|j'ai)\s+(\d{1,2})\s*(?:years?|ans?|sne?)/i,
    extract: (m) => `User is ${m[1]} years old` },
  // Location
  { pattern: /(?:i live in|ana min|ana fi|j'habite|je vis à?)\s+(\w[\w\s]{1,20})/i,
    extract: (m) => `User is from/lives in ${m[1].trim()}` },
  // Studies/work
  { pattern: /(?:i study|i'm studying|na9ra|naqra|j'étudie)\s+([\w\s]{3,30})/i,
    extract: (m) => `User studies ${m[1].trim()}` },
  { pattern: /(?:i work|nakhdhem|je travaille)\s+(?:at|fi|à|chez)\s+([\w\s]{3,30})/i,
    extract: (m) => `User works at ${m[1].trim()}` },
  // Family
  { pattern: /(?:i have|3andi|j'ai)\s+(\d+)\s+(?:brother|sister|khouya|okhti|frère|soeur|enfant|child|kid|weld|bent)/i,
    extract: (m, msg) => {
      const relation = msg.match(/(?:brother|khouya|frère)s?/i) ? 'brother(s)' :
                       msg.match(/(?:sister|okhti|soeur)s?/i) ? 'sister(s)' :
                       msg.match(/(?:child|kid|enfant|weld|bent)/i) ? 'child(ren)' : 'sibling(s)';
      return `User has ${m[1]} ${relation}`;
    }
  },
  // Preferences expressed strongly
  { pattern: /(?:i love|i really like|n7eb barcha|j'adore)\s+([\w\s]{3,30})/i,
    extract: (m) => `User loves ${m[1].trim()}` },
  // Goals
  { pattern: /(?:i want to|7ab|je veux|my dream|my goal)\s+([\w\s]{5,40})/i,
    extract: (m) => `User wants to ${m[1].trim()}` },
];

// Extract memorable assistant commitments (things Achiri promised)
const ASSISTANT_PATTERNS: Array<{ pattern: RegExp; extract: (match: RegExpMatchArray) => string | null }> = [
  { pattern: /(?:I'll|I will|nwda3ek|nsa3dek)\s+(.{5,40})/i,
    extract: (m) => `Achiri offered: ${m[1].trim()}` },
];

function ensureSummariesDir(): void {
  if (!existsSync(SUMMARIES_DIR)) mkdirSync(SUMMARIES_DIR, { recursive: true });
}

function summaryPath(userId: string): string {
  return join(SUMMARIES_DIR, userId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
}

export function loadSummary(userId: string): ConversationSummary | null {
  const fp = summaryPath(userId);
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, 'utf8')) as ConversationSummary;
  } catch {
    return null;
  }
}

function saveSummary(summary: ConversationSummary): void {
  ensureSummariesDir();
  writeFileSync(summaryPath(summary.userId), JSON.stringify(summary, null, 2), 'utf8');
}

// Extract key facts from a batch of turns about to be trimmed.
function extractFacts(turns: ConversationTurn[]): string[] {
  const facts: string[] = [];

  for (const turn of turns) {
    const patterns = turn.role === 'user' ? FACT_PATTERNS : ASSISTANT_PATTERNS;
    for (const { pattern, extract } of patterns) {
      const match = turn.content.match(pattern);
      if (match) {
        const fact = (extract as (m: RegExpMatchArray, msg: string) => string | null)(match, turn.content);
        if (fact && !facts.includes(fact)) facts.push(fact);
      }
    }
  }

  return facts;
}

// Called when turns are about to be trimmed. Extracts facts from the turns
// that will be removed and merges them into the persistent summary.
export function summarizeBeforeTrim(
  userId: string,
  turnsToRemove: ConversationTurn[],
): void {
  if (turnsToRemove.length === 0) return;

  const existing = loadSummary(userId);
  const newFacts = extractFacts(turnsToRemove);

  // Merge with existing facts, deduplicate
  const allFacts = existing ? [...existing.facts] : [];
  for (const fact of newFacts) {
    // Skip if we already have a similar fact (same prefix match)
    const isDuplicate = allFacts.some(f =>
      f.toLowerCase().startsWith(fact.toLowerCase().slice(0, 20)) ||
      fact.toLowerCase().startsWith(f.toLowerCase().slice(0, 20))
    );
    if (!isDuplicate) allFacts.push(fact);
  }

  // Cap at 15 facts (keep most recent if overflow)
  const capped = allFacts.slice(-15);

  const summary: ConversationSummary = {
    userId,
    facts: capped,
    total_turns_summarized: (existing?.total_turns_summarized ?? 0) + turnsToRemove.length,
    last_updated: new Date().toISOString(),
  };

  saveSummary(summary);
}

// Extract user's name from summary facts, if known.
export function getUserName(userId: string): string | null {
  const summary = loadSummary(userId);
  if (!summary) return null;
  for (const fact of summary.facts) {
    const match = fact.match(/User's name:\s*(\w+)/i);
    if (match) return match[1];
  }
  return null;
}

// Build a context block for the system prompt from the persistent summary.
// Returns null if no summary exists.
// Sprint 305: isNewSession flag triggers a personalized greeting hint.
export function buildSummaryContext(userId: string, isNewSession: boolean = false): string | null {
  const summary = loadSummary(userId);
  if (!summary || summary.facts.length === 0) return null;

  const lines = [
    '## Conversation Memory (from past sessions)',
    `You have spoken with this user across ${summary.total_turns_summarized} past messages. Key facts:`,
    ...summary.facts.map(f => `- ${f}`),
    '',
    'Use these facts naturally — don\'t list them back. Reference them when relevant.',
  ];

  // Sprint 305: Personalized greeting for returning users at session start
  if (isNewSession) {
    const name = getUserName(userId);
    if (name) {
      lines.push('');
      lines.push(`IMPORTANT: This is a new session with a returning user. Greet them warmly by name ("${name}") and briefly reference something from your shared history. Be natural, not robotic.`);
    } else {
      lines.push('');
      lines.push('IMPORTANT: This is a returning user starting a new session. Greet them warmly and show you remember past conversations.');
    }
  }

  return lines.join('\n');
}
