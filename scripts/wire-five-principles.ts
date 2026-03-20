#!/usr/bin/env npx ts-node
/**
 * wire-five-principles.ts — Sprint 492
 * Adds Five Principles mandate block to all agent prompts that
 * have the Constitution mandate but lack Five Principles reference.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

const FIVE_PRINCIPLES_BLOCK = `
> **Five Principles Mandate** — This agent is bound by the Five Seed Principles
> (\`workspace/shared-context/FIVE_PRINCIPLES.md\`). Every decision must be traceable
> to at least one principle: Seek Knowledge, Tolerance, Protect Dignity, Critical
> Thinking, Benefit to Others. When rules don't cover an edge case, these principles do.
`;

const AGENT_DIRS = [
  path.join(ROOT, 'kognai-agents'),
  path.join(ROOT, 'agents'),
];

let wired = 0;
let skipped = 0;
let alreadyHas = 0;

for (const agentDir of AGENT_DIRS) {
  if (!fs.existsSync(agentDir)) continue;

  const agents = fs.readdirSync(agentDir).filter(d => {
    const promptPath = path.join(agentDir, d, 'prompt.md');
    return fs.existsSync(promptPath);
  });

  for (const agent of agents) {
    const promptPath = path.join(agentDir, agent, 'prompt.md');
    let content = fs.readFileSync(promptPath, 'utf-8');

    // Skip if already has Five Principles
    if (content.includes('FIVE_PRINCIPLES') || content.includes('Five Principles Mandate') || content.includes('Five Seed Principles')) {
      alreadyHas++;
      continue;
    }

    // Skip if no Constitution mandate (shouldn't wire principles without constitution)
    if (!content.includes('CONSTITUTION') && !content.includes('Constitutional Mandate')) {
      skipped++;
      continue;
    }

    // Insert Five Principles block after the Constitution block
    // Find the end of the Constitution mandate (after the closing `>` line)
    const constitutionPattern = /> \*\*Constitutional Mandate\*\*.*?(?:\n>.*)*\n/;
    const match = content.match(constitutionPattern);

    if (match) {
      const insertPos = (match.index ?? 0) + match[0].length;
      content = content.slice(0, insertPos) + FIVE_PRINCIPLES_BLOCK + content.slice(insertPos);
    } else {
      // Fallback: insert at the very top
      content = FIVE_PRINCIPLES_BLOCK.trim() + '\n\n' + content;
    }

    fs.writeFileSync(promptPath, content);
    wired++;
    console.log(`  ✅ ${path.relative(ROOT, promptPath)}`);
  }
}

console.log(`\n=== Five Principles Wiring Report ===`);
console.log(`Wired: ${wired}`);
console.log(`Already had: ${alreadyHas}`);
console.log(`Skipped (no constitution): ${skipped}`);
console.log(`Total prompts processed: ${wired + alreadyHas + skipped}`);
console.log(`\n✅ PASS — Five Principles wired into ${wired} agent prompts`);
