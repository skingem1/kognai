/**
 * context-compressor — Token reduction for Kognai agents
 * T1 Foundation Skill
 *
 * Compresses context, code, and conversation to fit within
 * target token budgets while preserving critical information.
 *
 * Usage:
 *   npx tsx skills/context-compressor/compress.ts --file <path> --target <tokens>
 *   npx tsx skills/context-compressor/compress.ts --code <path> --target <tokens>
 *   npx tsx skills/context-compressor/compress.ts --text "..." --target <tokens>
 */

import * as fs from 'fs';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface CompressionResult {
  original: string;
  compressed: string;
  original_tokens: number;
  compressed_tokens: number;
  target_tokens: number;
  ratio: number;
  preserved: string[];
  dropped: string[];
}

function compressText(text: string, targetTokens: number): CompressionResult {
  const origTokens = estimateTokens(text);
  const preserved: string[] = [];
  const dropped: string[] = [];

  if (origTokens <= targetTokens) {
    return {
      original: text, compressed: text,
      original_tokens: origTokens, compressed_tokens: origTokens,
      target_tokens: targetTokens, ratio: 1,
      preserved: ['All content (within budget)'], dropped: [],
    };
  }

  const lines = text.split('\n');
  const scoredLines: Array<{ line: string; score: number; idx: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let score = 0;

    // Recency bias: later lines score higher
    score += (i / lines.length) * 3;

    // Headers and structure markers
    if (/^#{1,3}\s/.test(line)) score += 5;
    if (/^(import|export|function|class|interface|type|const|let|var)\b/.test(line.trim())) score += 4;

    // Key information markers
    if (/\b(TODO|FIXME|IMPORTANT|NOTE|WARNING|ERROR|CRITICAL)\b/i.test(line)) score += 5;
    if (/\b(must|required|mandatory|never|always)\b/i.test(line)) score += 3;

    // File paths and references
    if (/\b[\w/]+\.(ts|js|py|json|md|yaml)\b/.test(line)) score += 2;

    // Numbers and data
    if (/\d{2,}/.test(line)) score += 1;

    // Empty lines get lowest score
    if (line.trim() === '') score = -1;

    // Very long lines (likely data, not instructions)
    if (line.length > 200) score -= 2;

    scoredLines.push({ line, score, idx: i });
  }

  // Sort by score descending, take top lines until target reached
  scoredLines.sort((a, b) => b.score - a.score);

  let tokenBudget = targetTokens;
  const keptIndices = new Set<number>();

  for (const item of scoredLines) {
    const lineTokens = estimateTokens(item.line);
    if (tokenBudget - lineTokens >= 0) {
      keptIndices.add(item.idx);
      tokenBudget -= lineTokens;
    } else {
      dropped.push(`Line ${item.idx + 1}: ${item.line.substring(0, 50)}...`);
    }
  }

  // Reconstruct in original order
  const compressedLines: string[] = [];
  let lastKept = -1;
  for (let i = 0; i < lines.length; i++) {
    if (keptIndices.has(i)) {
      if (lastKept >= 0 && i - lastKept > 1) {
        compressedLines.push(`[... ${i - lastKept - 1} lines compressed ...]`);
      }
      compressedLines.push(lines[i]);
      lastKept = i;
    }
  }

  const compressed = compressedLines.join('\n');
  const compressedTokens = estimateTokens(compressed);

  preserved.push(`${keptIndices.size}/${lines.length} lines kept`);
  preserved.push(`Headers, imports, critical markers prioritized`);

  return {
    original: text, compressed,
    original_tokens: origTokens, compressed_tokens: compressedTokens,
    target_tokens: targetTokens, ratio: Math.round((compressedTokens / origTokens) * 100) / 100,
    preserved, dropped: dropped.slice(0, 10),
  };
}

function compressCode(code: string, targetTokens: number): CompressionResult {
  const origTokens = estimateTokens(code);
  if (origTokens <= targetTokens) {
    return {
      original: code, compressed: code,
      original_tokens: origTokens, compressed_tokens: origTokens,
      target_tokens: targetTokens, ratio: 1,
      preserved: ['All code (within budget)'], dropped: [],
    };
  }

  // For code: keep structure, compress function bodies
  const lines = code.split('\n');
  const compressedLines: string[] = [];
  let inBody = false;
  let bodyDepth = 0;
  let bodyStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Always keep: imports, exports, type defs, class/function signatures
    if (/^(import|export|type|interface)\b/.test(trimmed) ||
        /^(\/\*\*|\/\/\s*(---|\*\*|TODO|FIXME))/.test(trimmed) ||
        /^(async\s+)?function\s/.test(trimmed) ||
        /^(export\s+)?(async\s+)?function\s/.test(trimmed) ||
        /^(class|enum)\s/.test(trimmed)) {
      compressedLines.push(line);
      continue;
    }

    // Track depth for body compression
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;

    if (opens > closes && !inBody) {
      inBody = true;
      bodyDepth = opens - closes;
      bodyStart = i;
      compressedLines.push(line);
      continue;
    }

    if (inBody) {
      bodyDepth += opens - closes;
      if (bodyDepth <= 0) {
        inBody = false;
        if (i - bodyStart > 5) {
          compressedLines.push(`  // ... ${i - bodyStart - 1} lines of implementation ...`);
        }
        compressedLines.push(line);
      }
      continue;
    }

    compressedLines.push(line);
  }

  let compressed = compressedLines.join('\n');
  let compressedTokens = estimateTokens(compressed);

  // If still over budget, apply text compression on top
  if (compressedTokens > targetTokens) {
    const result = compressText(compressed, targetTokens);
    return { ...result, original: code, original_tokens: origTokens };
  }

  return {
    original: code, compressed,
    original_tokens: origTokens, compressed_tokens: compressedTokens,
    target_tokens: targetTokens, ratio: Math.round((compressedTokens / origTokens) * 100) / 100,
    preserved: ['Imports, exports, signatures, type defs'],
    dropped: ['Function bodies compressed to summaries'],
  };
}

function main() {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf('--target');
  const target = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : 2000;

  let result: CompressionResult;

  if (args.includes('--file')) {
    const fileIdx = args.indexOf('--file');
    const filePath = args[fileIdx + 1];
    if (!filePath || !fs.existsSync(filePath)) { console.error('File not found'); process.exit(1); }
    result = compressText(fs.readFileSync(filePath, 'utf-8'), target);
  } else if (args.includes('--code')) {
    const codeIdx = args.indexOf('--code');
    const codePath = args[codeIdx + 1];
    if (!codePath || !fs.existsSync(codePath)) { console.error('File not found'); process.exit(1); }
    result = compressCode(fs.readFileSync(codePath, 'utf-8'), target);
  } else if (args.includes('--text')) {
    const textIdx = args.indexOf('--text');
    const text = args.slice(textIdx + 1).filter(a => !a.startsWith('--')).join(' ');
    result = compressText(text, target);
  } else {
    console.log('Usage: npx tsx skills/context-compressor/compress.ts --file|--code|--text <input> --target <tokens>');
    process.exit(0);
  }

  console.log('=== Context Compressor ===\n');
  console.log(`  Original:   ${result.original_tokens} tokens`);
  console.log(`  Compressed: ${result.compressed_tokens} tokens`);
  console.log(`  Target:     ${result.target_tokens} tokens`);
  console.log(`  Ratio:      ${result.ratio}`);

  if (result.preserved.length > 0) {
    console.log('\n  Preserved:');
    for (const p of result.preserved) console.log(`    + ${p}`);
  }
  if (result.dropped.length > 0) {
    console.log('\n  Dropped (first 10):');
    for (const d of result.dropped) console.log(`    - ${d}`);
  }

  console.log('\n--- Compressed Output ---');
  console.log(result.compressed);
}

main();
