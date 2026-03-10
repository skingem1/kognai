#!/usr/bin/env ts-node
/**
 * run-cmo.ts — Manus CMO runner
 *
 * Sends two tasks to Manus AI in parallel and writes results to reports/cmo/
 * for the swarm orchestrator to pick up in Phase 3 (CTO analysis / CEO review).
 *
 * Outputs:
 *   reports/cmo/market-watch.md
 *   reports/cmo/strategy.md
 *
 * Usage:
 *   ./scripts/run-swarm.sh       (env pre-loaded)
 *   source .env && npx ts-node scripts/run-cmo.ts [options]
 *
 * Options:
 *   --sprint <NNN>     Sprint number (default: auto-detected from latest sprint file)
 *   --focus <text>     Strategic focus for this sprint (default: generic)
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';

// Load .env — two attempts to handle npx __dirname resolution quirk
dotenvConfig({ path: resolve(__dirname, '..', '.env'), override: false });
dotenvConfig({ path: resolve(process.cwd(), '.env'), override: false });

import { ManusClient } from './lib/manus-client';

// ===== Config =====

const KOGNAI_ROOT = resolve(__dirname, '..');
const REPORT_DIR = resolve(KOGNAI_ROOT, 'reports', 'cmo');
const SPRINT_DIR = resolve(KOGNAI_ROOT, 'workspace', 'sprints');

const today = new Date().toISOString().split('T')[0];

// ===== CLI Args =====

function parseArgs(): { sprint: string; focus: string } {
  const args = process.argv.slice(2);
  let sprint = '';
  let focus = 'product-market fit, developer tooling, and AI-native workflows';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sprint' && args[i + 1]) sprint = args[++i];
    if (args[i] === '--focus' && args[i + 1]) focus = args[++i];
  }

  if (!sprint) {
    try {
      const files = readdirSync(SPRINT_DIR)
        .filter(f => /^sprint-\d+\.json$/.test(f))
        .sort();
      if (files.length > 0) {
        sprint = files[files.length - 1].replace('sprint-', '').replace('.json', '');
      }
    } catch {
      sprint = '000';
    }
  }

  return { sprint, focus };
}

// ===== Prompts =====

function buildMarketWatchPrompt(sprint: string, focus: string): string {
  return `You are the CMO of Kognai, a sovereign AI runtime company.

Today is ${today}. This is Sprint ${sprint}.

Your task: Produce a structured **Market Watch Report** (markdown format).

Strategic focus for this sprint: ${focus}

Research and analyze:
1. **Developer AI tools market** — What's shipping this week? New model releases, API changes, pricing shifts from Anthropic, OpenAI, Google, Mistral, Groq, Together.ai.
2. **Agent orchestration landscape** — What competing products (AutoGen, CrewAI, LangGraph, Swarm, Mastra) are doing. Feature gaps we can exploit.
3. **Talent and community signals** — Reddit r/LocalLLaMA, HackerNews, Twitter/X threads trending in AI devtools. What developers are frustrated with? What are they excited about?
4. **Regulatory and risk signals** — Any EU AI Act updates, US EO enforcement, data residency changes that affect sovereign AI positioning.

Output format (strict markdown):
# Market Watch — Sprint ${sprint} (${today})

## Executive Summary
[3-4 sentence summary of the most important signal this week]

## Model & API Landscape
[Bullet points with specific updates]

## Competitive Intelligence
[Competitor moves, positioning shifts]

## Developer Sentiment
[Community signals, pain points, opportunities]

## Risk & Regulatory
[Anything relevant to sovereign AI / data privacy]

## CMO Recommendation
[Top 1-2 action items for this sprint based on market signals]

Be specific. Use real company names, real product names, real dates where you know them. Do not fabricate facts — if you are uncertain, say "unconfirmed as of ${today}".`;
}

function buildStrategyPrompt(sprint: string, focus: string): string {
  return `You are the CMO of Kognai, a sovereign AI runtime company building a multi-agent swarm OS for software development teams.

Today is ${today}. This is Sprint ${sprint}.

Strategic focus: ${focus}

Your task: Produce a **Sprint Strategy Brief** (markdown format) that the CEO and CTO will use to align sprint priorities.

Produce:
1. **Positioning statement** — One paragraph on how Kognai should be positioned this sprint relative to competitors. What's our sharp edge?
2. **ICP update** — Who is our ideal customer RIGHT NOW (job title, company size, stack, pain point)? Has it shifted since last sprint?
3. **Content & distribution** — What 3 pieces of content should we produce this sprint and on which channels (GitHub, Twitter, HN, LinkedIn, dev.to)?
4. **Growth lever** — One specific, executable growth experiment for this sprint (not vague advice — a concrete action with a measurable outcome).
5. **Partnership signal** — Any integration or co-marketing opportunity worth pursuing this sprint?
6. **Sprint narrative** — A single sentence that captures the story of this sprint for external communication.

Output format (strict markdown):
# Sprint ${sprint} Strategy Brief (${today})

## Positioning Statement
[paragraph]

## ICP Update
[structured description: role, company, stack, pain point]

## Content Plan
| # | Format | Topic | Channel | Owner |
|---|--------|-------|---------|-------|
[3 rows]

## Growth Experiment
**Hypothesis:** [what we expect]
**Action:** [what to do]
**Metric:** [how we measure success]
**Timeline:** [by end of sprint]

## Partnership Signal
[specific company or community + what we'd propose]

## Sprint Narrative
> [one sentence]

Be concrete. No generic advice. Every recommendation must be actionable this sprint.`;
}

// ===== Write helpers =====

function writeReport(filename: string, content: string): void {
  const filepath = resolve(REPORT_DIR, filename);
  writeFileSync(filepath, content, 'utf8');
  console.log(`  ✅  Written: ${filepath}`);
}

function writePlaceholder(filename: string, taskName: string, error: string): void {
  const content = `# ${taskName} — FAILED (${today})\n\n**Error:** ${error}\n\nThis report could not be generated. Check MANUS_API_KEY and Manus API status.\n`;
  writeReport(filename, content);
}

// ===== Main =====

async function main(): Promise<void> {
  const { sprint, focus } = parseArgs();
  console.log(`\n🎯  Kognai CMO Runner — Sprint ${sprint} (${today})`);
  console.log(`    Focus: ${focus}\n`);

  mkdirSync(REPORT_DIR, { recursive: true });

  let client: ManusClient;
  try {
    client = new ManusClient({});
  } catch (err: any) {
    console.error(`❌  Manus client init failed: ${err.message}`);
    writePlaceholder('market-watch.md', 'Market Watch', err.message);
    writePlaceholder('strategy.md', 'Strategy Brief', err.message);
    process.exit(1);
  }

  const marketWatchPrompt = buildMarketWatchPrompt(sprint, focus);
  const strategyPrompt = buildStrategyPrompt(sprint, focus);

  console.log('📡  Sending tasks to Manus AI in parallel...\n');

  const [marketResult, strategyResult] = await Promise.allSettled([
    client.executeTask({ prompt: marketWatchPrompt }).then(r => {
      console.log(`  [market-watch] Completed in ${(r.durationMs / 1000).toFixed(1)}s (${r.pollAttempts} polls)`);
      return r;
    }),
    client.executeTask({ prompt: strategyPrompt }).then(r => {
      console.log(`  [strategy]     Completed in ${(r.durationMs / 1000).toFixed(1)}s (${r.pollAttempts} polls)`);
      return r;
    }),
  ]);

  console.log('\n📝  Writing reports...');

  if (marketResult.status === 'fulfilled' && marketResult.value.status === 'completed') {
    writeReport('market-watch.md', marketResult.value.output);
  } else {
    const err = marketResult.status === 'rejected'
      ? marketResult.reason?.message || String(marketResult.reason)
      : (marketResult.value as any).output || 'Task error';
    console.error(`  ❌  market-watch failed: ${err}`);
    writePlaceholder('market-watch.md', 'Market Watch', err);
  }

  if (strategyResult.status === 'fulfilled' && strategyResult.value.status === 'completed') {
    writeReport('strategy.md', strategyResult.value.output);
  } else {
    const err = strategyResult.status === 'rejected'
      ? strategyResult.reason?.message || String(strategyResult.reason)
      : (strategyResult.value as any).output || 'Task error';
    console.error(`  ❌  strategy failed: ${err}`);
    writePlaceholder('strategy.md', 'Strategy Brief', err);
  }

  console.log('\n✅  CMO reports complete.');
  console.log(`    → ${REPORT_DIR}/market-watch.md`);
  console.log(`    → ${REPORT_DIR}/strategy.md\n`);
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
