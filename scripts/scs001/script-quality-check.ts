/**
 * script-quality-check.ts — Sprint 560
 * Post-generation quality checker for video scripts.
 * Flags/fixes scripts containing banned vague phrases.
 *
 * Usage:
 *   import { checkScript, BANNED_PHRASES } from './script-quality-check';
 *   const result = checkScript(scriptText);
 *   if (!result.pass) console.log('Banned:', result.violations);
 */

// Banned phrases from insight agent prompt + additional vague patterns
export const BANNED_PHRASES = [
  'changes everything',
  'nobody is talking about',
  'insiders have been warning',
  'challenges conventional wisdom',
  'reshaping the field',
  'accelerating faster than projected',
  'game changer',
  'revolutionary breakthrough',
  'paradigm shift',
  'the implications are',
  'this could change',
  'experts say',
  'sources confirm',
  'a major player',
  'unprecedented move',
  'industry insiders',
  'behind the scenes',
  'what they don\'t want you to know',
  'the real story',
];

export interface QualityResult {
  pass: boolean;
  score: number; // 0-100
  violations: string[];
  suggestions: string[];
}

/**
 * Check a script text for banned vague phrases.
 * Returns pass/fail + violations list.
 */
export function checkScript(text: string): QualityResult {
  const lower = text.toLowerCase();
  const violations: string[] = [];
  const suggestions: string[] = [];

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      violations.push(phrase);
    }
  }

  // Check for specificity: should contain at least one number, name, or date
  const hasNumber = /\d+/.test(text);
  const hasQuote = text.includes('"') || text.includes("'");
  const hasProperNoun = /[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/.test(text);

  if (!hasNumber && !hasProperNoun) {
    suggestions.push('Add specific details: names, numbers, or dates');
  }

  // Score: start at 100, deduct for each violation
  const score = Math.max(0, 100 - (violations.length * 15) - (suggestions.length * 5));

  return {
    pass: violations.length === 0,
    score,
    violations,
    suggestions,
  };
}

/**
 * Check all fields of an InsightBrief-like object.
 */
export function checkBriefQuality(brief: {
  hook?: { text: string };
  pre_clip_commentary?: string;
  post_clip_commentary?: string;
  insight_statement?: string;
  why_does_this_matter?: string;
}): QualityResult {
  const texts = [
    brief.hook?.text,
    brief.pre_clip_commentary,
    brief.post_clip_commentary,
    brief.insight_statement,
    brief.why_does_this_matter,
  ].filter(Boolean) as string[];

  const combined = texts.join(' ');
  return checkScript(combined);
}

// CLI mode: check SRT files in recent pipeline runs
if (require.main === module) {
  const { readdirSync, readFileSync, existsSync } = require('fs');
  const { join } = require('path');

  const ROOT = join(__dirname, '..', '..');
  const runsDir = join(ROOT, 'workspace', 'scs001');

  const runDirs = readdirSync(runsDir).filter((d: string) => d.startsWith('run-')).sort();
  let total = 0, passed = 0, failed = 0;
  const allViolations: string[] = [];

  for (const runDir of runDirs.slice(-3)) { // Check last 3 runs
    const captionDir = join(runsDir, runDir, 'caption');
    if (!existsSync(captionDir)) continue;

    const srtFiles = readdirSync(captionDir).filter((f: string) => f.endsWith('.srt'));
    for (const srt of srtFiles) {
      const content = readFileSync(join(captionDir, srt), 'utf-8');
      const result = checkScript(content);
      total++;
      if (result.pass) {
        passed++;
      } else {
        failed++;
        allViolations.push(...result.violations);
      }
    }
  }

  console.log(`=== Script Quality Check ===`);
  console.log(`Checked: ${total} scripts (last 3 runs)`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);
  if (allViolations.length > 0) {
    const counts = new Map<string, number>();
    for (const v of allViolations) counts.set(v, (counts.get(v) || 0) + 1);
    console.log(`\nViolations:`);
    for (const [phrase, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  "${phrase}": ${count}x`);
    }
  } else {
    console.log(`\nNo violations found!`);
  }
}
