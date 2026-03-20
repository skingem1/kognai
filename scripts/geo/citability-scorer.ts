/**
 * citability-scorer.ts — Score content for GEO citability
 *
 * Evaluates text blocks for AI engine citation readiness:
 * - Word count: 134-167 words (optimal citation range)
 * - Entity density: named entities per block
 * - Specificity: numbers, dates, proper nouns
 * - Structure: clear topic sentence + supporting detail
 *
 * Scores 0-100. Blocks below 60 are flagged for rewrite.
 *
 * Usage: npx tsx scripts/geo/citability-scorer.ts [--file path/to/content.json]
 *        npx tsx scripts/geo/citability-scorer.ts --text "Your content here..."
 */

import * as fs from 'fs';
import * as path from 'path';

const CITABLE_BLOCKS_PATH = path.join(__dirname, '../../workspace/geo/citable-blocks.json');
const SCORES_PATH = path.join(__dirname, '../../workspace/geo/citability-scores.json');

interface ScoreResult {
  id: string;
  title: string;
  score: number;
  word_count: number;
  breakdown: {
    word_count_score: number;    // 0-30: optimal at 134-167
    entity_density: number;      // 0-20: named entities per 100 words
    specificity: number;         // 0-20: numbers, dates, proper nouns
    structure: number;           // 0-15: starts with topic sentence
    completeness: number;        // 0-15: self-contained block
  };
  flagged: boolean;
  issues: string[];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function scoreWordCount(wc: number): number {
  // Optimal: 134-167 words → 30 points
  if (wc >= 134 && wc <= 167) return 30;
  // Close range: 120-133 or 168-180 → 20 points
  if ((wc >= 120 && wc < 134) || (wc > 167 && wc <= 180)) return 20;
  // Acceptable: 100-119 or 181-200 → 10 points
  if ((wc >= 100 && wc < 120) || (wc > 180 && wc <= 200)) return 10;
  // Too short or too long
  return 0;
}

function scoreEntityDensity(text: string): number {
  const wc = countWords(text);
  if (wc === 0) return 0;

  // Count capitalized multi-word terms (likely named entities)
  const entityPatterns = [
    /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g,  // Multi-word proper nouns
    /\b[A-Z]{2,}(?:-[A-Z0-9]+)*\b/g,         // Acronyms (SCS-001, ACP, etc.)
    /\bKognai\b/g, /\bAchiri\b/g, /\bClawRouter\b/g, /\bOpenClaw\b/g,
    /\bSCS-001\b/g, /\bx402\b/g, /\bPiper TTS\b/g, /\bFFmpeg\b/g,
  ];

  let entityCount = 0;
  for (const pattern of entityPatterns) {
    const matches = text.match(pattern);
    entityCount += matches ? matches.length : 0;
  }

  const density = (entityCount / wc) * 100;
  if (density >= 8) return 20;
  if (density >= 5) return 15;
  if (density >= 3) return 10;
  if (density >= 1) return 5;
  return 0;
}

function scoreSpecificity(text: string): number {
  let score = 0;

  // Numbers and statistics
  const numbers = text.match(/\b\d+(\.\d+)?(%|x|s|ms|MB|GB|K|M)?\b/g);
  if (numbers && numbers.length >= 3) score += 10;
  else if (numbers && numbers.length >= 1) score += 5;

  // Technical terms (specific > generic)
  const techTerms = text.match(/\b(API|SDK|protocol|framework|pipeline|router|agent|cron|webhook|OAuth|USDC|JSON-LD|FFmpeg|PM2|Supabase|PostgreSQL|Tailscale|VPN)\b/gi);
  if (techTerms && techTerms.length >= 3) score += 10;
  else if (techTerms && techTerms.length >= 1) score += 5;

  return Math.min(20, score);
}

function scoreStructure(text: string): number {
  let score = 0;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // Has clear topic sentence (first sentence < 30 words, defines subject)
  if (sentences.length > 0) {
    const firstSentence = sentences[0].trim();
    const firstWc = countWords(firstSentence);
    if (firstWc <= 30 && firstWc >= 5) score += 8;
    // First sentence contains "is" or "are" (definitional)
    if (/\b(is|are)\b/i.test(firstSentence)) score += 4;
  }

  // Multiple sentences (not a wall of text)
  if (sentences.length >= 3 && sentences.length <= 8) score += 3;

  return Math.min(15, score);
}

function scoreCompleteness(text: string): number {
  let score = 0;

  // Self-contained: doesn't start with "However", "Also", "Additionally" (depends on context)
  if (!/^(However|Also|Additionally|Furthermore|Moreover|But|And)\b/.test(text.trim())) {
    score += 5;
  }

  // Ends with a complete thought (period, not trailing off)
  if (/[.!?]$/.test(text.trim())) score += 5;

  // Contains at least one concrete claim (not all hedging)
  const hedges = text.match(/\b(might|maybe|possibly|could|perhaps|sometimes)\b/gi);
  if (!hedges || hedges.length <= 1) score += 5;

  return Math.min(15, score);
}

function scoreBlock(id: string, title: string, content: string): ScoreResult {
  const wc = countWords(content);
  const breakdown = {
    word_count_score: scoreWordCount(wc),
    entity_density: scoreEntityDensity(content),
    specificity: scoreSpecificity(content),
    structure: scoreStructure(content),
    completeness: scoreCompleteness(content),
  };

  const score = breakdown.word_count_score + breakdown.entity_density +
    breakdown.specificity + breakdown.structure + breakdown.completeness;

  const issues: string[] = [];
  if (breakdown.word_count_score < 20) issues.push(`Word count ${wc} outside optimal 134-167 range`);
  if (breakdown.entity_density < 10) issues.push('Low entity density — add more named entities');
  if (breakdown.specificity < 10) issues.push('Low specificity — add numbers, technical terms');
  if (breakdown.structure < 8) issues.push('Weak structure — start with definitional topic sentence');
  if (breakdown.completeness < 10) issues.push('Incomplete — ensure self-contained block');

  return {
    id, title, score, word_count: wc,
    breakdown, flagged: score < 60, issues,
  };
}

function main() {
  const args = process.argv.slice(2);

  // Single text scoring
  if (args[0] === '--text' && args[1]) {
    const text = args.slice(1).join(' ');
    const result = scoreBlock('inline', 'Inline Text', text);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.flagged ? 1 : 0);
  }

  // File scoring
  const filePath = args[0] === '--file' && args[1] ? args[1] : CITABLE_BLOCKS_PATH;

  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: ${filePath} not found`);
    process.exit(1);
  }

  console.log('=== Kognai GEO Citability Scorer ===');
  console.log(`File: ${filePath}`);
  console.log();

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const blocks = data.blocks || [];
  const results: ScoreResult[] = [];

  for (const block of blocks) {
    const result = scoreBlock(block.id, block.title, block.content);
    results.push(result);
    const flag = result.flagged ? ' ** FLAGGED **' : '';
    console.log(`  [${result.score}/100] ${result.id} (${result.word_count} words)${flag}`);
    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        console.log(`           - ${issue}`);
      }
    }
  }

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;
  const flagged = results.filter(r => r.flagged);

  console.log();
  console.log(`  Average score: ${avgScore}/100`);
  console.log(`  Flagged blocks (<60): ${flagged.length}/${results.length}`);

  // Save scores
  const output = {
    scan_date: new Date().toISOString(),
    source_file: filePath,
    average_score: avgScore,
    total_blocks: results.length,
    flagged_count: flagged.length,
    results,
  };

  fs.writeFileSync(SCORES_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`  Scores saved: ${SCORES_PATH}`);

  process.exit(flagged.length > 0 ? 1 : 0);
}

main();
