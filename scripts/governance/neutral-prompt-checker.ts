/**
 * neutral-prompt-checker.ts — Sprint TICKET-005-RULE1
 * Rule 1 (Neutral Prompts): detects answer-seeding in sprint descriptions.
 *
 * Answer-seeding = embedding specific implementation choices in a brief that
 * should remain open-ended: code fences, import statements, copy-X patterns.
 *
 * Usage:
 *   npx ts-node scripts/governance/neutral-prompt-checker.ts --file=workspace/sprint-brief.md
 *   echo "description text" | npx ts-node scripts/governance/neutral-prompt-checker.ts
 *
 * Exit 0 = clean, Exit 1 = violations found
 */

import * as fs from 'fs';

export interface NeutralCheckResult {
  clean: boolean;
  violations: Array<{ line: number; pattern: string; text: string }>;
}

// Patterns that indicate answer-seeding
const SEEDING_RULES: Array<{ pattern: string; regex: RegExp; description: string }> = [
  {
    pattern: 'code-fence',
    regex: /^```/,
    description: 'Code fence in brief — implementation details should not be pre-seeded',
  },
  {
    pattern: 'import-statement',
    regex: /^\s*(import |from ['"]|require\()/,
    description: 'Import statement — specific module choices should not be pre-seeded',
  },
  {
    pattern: 'code-statement',
    regex: /^\s*(const |let |var |function |class |export |async function )\w+/,
    description: 'Code statement — implementation should not be pre-seeded',
  },
  {
    pattern: 'copy-pattern',
    regex: /\b(copy from|same as Sprint|exactly like|same pattern|use the same code|port from)\b/i,
    description: 'Copy-from instruction — should describe intent, not implementation',
  },
  {
    pattern: 'hardcoded-identifier',
    regex: /\b([a-z][a-zA-Z]{14,}|[a-z]+(_[a-z]+){4,})\b/,
    description: 'Very long identifier — may indicate pre-seeded variable/function name',
  },
];

export function checkText(text: string): NeutralCheckResult {
  const lines = text.split('\n');
  const violations: NeutralCheckResult['violations'] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code fence state
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
      // Flag the opening fence itself (but not closing)
      if (inCodeFence) {
        violations.push({ line: i + 1, pattern: 'code-fence', text: line.trim().slice(0, 60) });
      }
      continue;
    }

    // Skip lines inside code fences (already flagged by opening)
    if (inCodeFence) continue;

    for (const rule of SEEDING_RULES) {
      if (rule.pattern === 'code-fence') continue; // handled above
      if (rule.regex.test(line)) {
        violations.push({ line: i + 1, pattern: rule.pattern, text: line.trim().slice(0, 80) });
        break; // one violation per line
      }
    }
  }

  return { clean: violations.length === 0, violations };
}

// CLI entrypoint
if (require.main === module) {
  let text = '';

  const fileArg = process.argv.find(a => a.startsWith('--file='));
  if (fileArg) {
    text = fs.readFileSync(fileArg.split('=')[1], 'utf-8');
  } else {
    text = fs.readFileSync('/dev/stdin', 'utf-8');
  }

  const result = checkText(text);

  if (result.clean) {
    console.log('✓ Rule 1 check PASS — no answer-seeding detected');
    process.exit(0);
  } else {
    console.error(`✗ Rule 1 check FAIL — ${result.violations.length} violation(s):`);
    result.violations.forEach(v => {
      console.error(`  Line ${v.line} [${v.pattern}]: ${v.text}`);
    });
    process.exit(1);
  }
}
