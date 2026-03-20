/**
 * sophie-optimizer — Prompt optimization for Kognai agents
 * T1 Foundation Skill
 *
 * Analyzes and optimizes prompts for token efficiency.
 * Reduces prompt size while preserving semantic intent.
 *
 * Usage:
 *   npx tsx skills/sophie-optimizer/optimize.ts --file <path>
 *   npx tsx skills/sophie-optimizer/optimize.ts --text "prompt text"
 *   npx tsx skills/sophie-optimizer/optimize.ts --file <path> --model qwen3:4b
 */

import * as fs from 'fs';

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

interface OptimizationResult {
  original: string;
  optimized: string;
  original_tokens: number;
  optimized_tokens: number;
  reduction_pct: number;
  actions: string[];
}

function optimize(prompt: string, model?: string): OptimizationResult {
  const actions: string[] = [];
  let optimized = prompt;

  // 1. Remove excessive whitespace
  const beforeWS = optimized.length;
  optimized = optimized.replace(/\n{3,}/g, '\n\n');
  optimized = optimized.replace(/[ \t]{2,}/g, ' ');
  optimized = optimized.replace(/^\s+$/gm, '');
  if (optimized.length < beforeWS) {
    actions.push(`Whitespace cleanup: saved ${beforeWS - optimized.length} chars`);
  }

  // 2. Remove redundant "Please" / "Please note that" / "It is important to"
  const politePatterns = [
    /\bPlease note that\b/gi,
    /\bIt is important to note that\b/gi,
    /\bPlease make sure to\b/gi,
    /\bPlease ensure that\b/gi,
    /\bKindly\b/gi,
  ];
  for (const pattern of politePatterns) {
    if (pattern.test(optimized)) {
      optimized = optimized.replace(pattern, '');
      actions.push(`Removed filler: ${pattern.source}`);
    }
  }

  // 3. Compress repeated bullet point patterns
  const lines = optimized.split('\n');
  const seen = new Set<string>();
  const dedupedLines: string[] = [];
  let dupsRemoved = 0;
  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    if (normalized.length > 20 && seen.has(normalized)) {
      dupsRemoved++;
      continue;
    }
    if (normalized.length > 20) seen.add(normalized);
    dedupedLines.push(line);
  }
  if (dupsRemoved > 0) {
    optimized = dedupedLines.join('\n');
    actions.push(`Removed ${dupsRemoved} duplicate lines`);
  }

  // 4. Model-specific optimizations
  if (model?.includes('qwen3')) {
    // Qwen prefers concise instructions
    optimized = optimized.replace(/\bFor example,?\s*/gi, 'e.g. ');
    optimized = optimized.replace(/\bIn other words,?\s*/gi, '');
    if (prompt !== optimized) actions.push('Qwen-specific: shortened examples');
  }

  // 5. Trim trailing whitespace
  optimized = optimized.trim();

  const origTokens = estimateTokens(prompt);
  const optTokens = estimateTokens(optimized);
  const reduction = origTokens > 0 ? Math.round((1 - optTokens / origTokens) * 100) : 0;

  return {
    original: prompt,
    optimized,
    original_tokens: origTokens,
    optimized_tokens: optTokens,
    reduction_pct: reduction,
    actions,
  };
}

function main() {
  const args = process.argv.slice(2);
  const reportOnly = args.includes('--report');
  const modelIdx = args.indexOf('--model');
  const model = modelIdx >= 0 ? args[modelIdx + 1] : undefined;

  let prompt: string;

  if (args.includes('--file')) {
    const fileIdx = args.indexOf('--file');
    const filePath = args[fileIdx + 1];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      process.exit(1);
    }
    prompt = fs.readFileSync(filePath, 'utf-8');
  } else if (args.includes('--text')) {
    const textIdx = args.indexOf('--text');
    prompt = args.slice(textIdx + 1).filter(a => !a.startsWith('--')).join(' ');
  } else {
    console.log('Usage: npx tsx skills/sophie-optimizer/optimize.ts --file <path> | --text "..."');
    console.log('Options: --model <model> --report');
    process.exit(0);
  }

  const result = optimize(prompt, model);

  console.log('=== Sophie Optimizer ===\n');
  console.log(`  Original:  ${result.original_tokens} tokens`);
  console.log(`  Optimized: ${result.optimized_tokens} tokens`);
  console.log(`  Reduction: ${result.reduction_pct}%`);
  console.log(`  Model:     ${model || 'generic'}`);

  if (result.actions.length > 0) {
    console.log('\n  Actions:');
    for (const a of result.actions) {
      console.log(`    - ${a}`);
    }
  } else {
    console.log('\n  No optimizations needed.');
  }

  if (!reportOnly) {
    console.log('\n--- Optimized Output ---');
    console.log(result.optimized);
  }
}

main();
