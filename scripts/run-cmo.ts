#!/usr/bin/env ts-node
/**
 * run-cmo.ts — Manus CMO runner
 *
 * Sends three tasks to Manus AI (web browsing agent) and writes results to
 * reports/cmo/ for the CEO weekly planner to consume.
 *
 * Outputs:
 *   reports/cmo/market-watch.md      — model/API/competitive landscape
 *   reports/cmo/opportunity-watch.md — leads, pain points, business opportunities
 *   reports/cmo/strategy.md          — sprint strategy brief
 *
 * Usage:
 *   source .env && npx ts-node scripts/run-cmo.ts [options]
 *   (or via run-weekly.sh which pre-sources .env)
 *
 * Options:
 *   --sprint <NNN>     Sprint number (default: auto-detected)
 *   --focus <text>     Strategic focus override
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';

dotenvConfig({ path: resolve(__dirname, '..', '.env'), override: false });
dotenvConfig({ path: resolve(process.cwd(), '.env'), override: false });

import { ManusClient } from './lib/manus-client';

const KOGNAI_ROOT = resolve(__dirname, '..');
const REPORT_DIR = resolve(KOGNAI_ROOT, 'reports', 'cmo');
const SPRINT_DIR = resolve(KOGNAI_ROOT, 'workspace', 'sprints');
const today = new Date().toISOString().split('T')[0];

function parseArgs(): { sprint: string; focus: string } {
  const args = process.argv.slice(2);
  let sprint = '';
  let focus = 'sovereign AI runtime, multi-agent orchestration, local-first developer tooling';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sprint' && args[i + 1]) sprint = args[++i];
    if (args[i] === '--focus' && args[i + 1]) focus = args[++i];
  }
  if (!sprint) {
    try {
      const files = readdirSync(SPRINT_DIR)
        .filter(f => /^sprint-\d+\.json$/.test(f))
        .sort();
      if (files.length > 0)
        sprint = files[files.length - 1].replace('sprint-', '').replace('.json', '');
    } catch { sprint = '000'; }
  }
  return { sprint, focus };
}

// ===== PROMPT 1: Market Watch (web research) =====

function buildMarketWatchPrompt(sprint: string, focus: string): string {
  return `You are the CMO of Kognai — a sovereign AI runtime company building a multi-agent swarm OS for developers.

Today is ${today}. Sprint: ${sprint}. Focus: ${focus}.

**YOUR TASK: Browse the web and produce a structured Market Watch report.**

BROWSE THESE SOURCES NOW:
1. **X/Twitter** — Search for: "AI agents 2026", "autonomous coding agent", "MCP protocol", "local LLM", "sovereign AI", "multi-agent swarm", "AI devtools". Find the most-engaged posts from the last 7 days.
2. **Hacker News** — Browse https://news.ycombinator.com and search for "AI agent", "LLM orchestration", "autonomous agent". Get top stories from this week.
3. **GitHub Trending** — Browse https://github.com/trending — note top AI/agent repos trending this week.
4. **Model releases** — Check Anthropic, OpenAI, Google, Mistral, Groq official blogs/X accounts for any new model or API announcements in the last 7 days.
5. **Competitor moves** — Check AutoGen, CrewAI, LangGraph, Mastra, Swarm, Composio, e2b.dev for recent releases or blog posts.

OUTPUT FORMAT (strict markdown, no intro text — start with the header):

# Market Watch — Sprint ${sprint} (${today})

## Executive Summary
[3–4 sentences on the single most important signal this week and what it means for Kognai]

## Model & API Landscape
[Bulleted list — specific model names, version numbers, pricing changes, API updates. Cite sources.]

## Competitive Intelligence
[What competitors shipped. What they're positioning around. Gaps we can exploit.]

## Developer Sentiment (from X/HN/Reddit)
[What developers are excited about. What they're frustrated with. Direct quotes if you found any.]

## GitHub Trending
[Top 3–5 agent/AI repos trending this week with star counts if available]

## Risk & Regulatory
[EU AI Act, US executive orders, data residency issues relevant to sovereign AI]

## CMO Signal — Top Action Items
[2–3 concrete, sprint-specific recommendations based on what you found]

Be specific. Real names, real URLs, real dates. If you can't verify something, mark it "(unconfirmed)".`;
}

// ===== PROMPT 2: Opportunity Watch (leads + pain points) =====

function buildOpportunityWatchPrompt(sprint: string, focus: string): string {
  return `You are the CMO of Kognai — a sovereign AI runtime company building a multi-agent swarm OS for developers.

Today is ${today}. Sprint: ${sprint}. Focus: ${focus}.

**YOUR TASK: Hunt for business opportunities, leads, and pain points by browsing the web.**

BROWSE THESE SOURCES NOW:
1. **X/Twitter pain points** — Search: "CrewAI broken", "AutoGen doesn't work", "LangChain too complex", "AI agent fails", "orchestration nightmare", "MCP issues". Find developers publicly frustrated with current tools.
2. **GitHub Issues** — Browse open issues on: github.com/microsoft/autogen, github.com/crewAIInc/crewAI, github.com/langchain-ai/langgraph. What are users begging for that isn't being built?
3. **Indie Hackers / ProductHunt** — Browse https://www.indiehackers.com and https://www.producthunt.com/topics/artificial-intelligence — who is building AI agent products? What problems are they solving?
4. **YC / VC-backed startups** — Search for recently funded AI agent companies (YC W26, S25 batch, recent Sequoia/a16z investments). What are VCs betting on?
5. **Job postings** — Search LinkedIn or Hacker News "Who is Hiring?" for companies posting "AI agent", "multi-agent", "LLM orchestration" roles — these are companies actively investing in this space.
6. **Developer communities** — Browse r/LocalLLaMA, r/MachineLearning, Discord servers for LangChain/AutoGen — what features/tools are devs asking for?

OUTPUT FORMAT (strict markdown, start with the header):

# Opportunity Watch — Sprint ${sprint} (${today})

## Hottest Pain Points
[Top 5 specific developer complaints you found, with context on how many people share this pain]

## Lead Signals (companies/people to watch)
[10 specific names — companies or developers actively building in our space. Include URLs where possible.]

## Feature Gaps in Competitors
[Specific missing features users are begging for that Kognai could build]

## Partnership / Integration Opportunities
[3 specific tools, platforms, or communities Kognai should integrate with or partner with, and why]

## Business Model Signal
[What pricing models are working? What are devs willing to pay for? Any open-source → paid conversion signals?]

## Immediate Outreach Targets
[3–5 specific people or communities to engage this sprint — their handle/URL + what to say]

Be specific. Real names, real URLs, real quotes. Mark unverified info as "(unconfirmed)".`;
}

// ===== PROMPT 3: Strategy Brief =====

function buildStrategyPrompt(sprint: string, focus: string): string {
  return `You are the CMO of Kognai — a sovereign AI runtime company building a multi-agent swarm OS for developers.

Today is ${today}. Sprint: ${sprint}. Focus: ${focus}.

**YOUR TASK: Produce a Sprint Strategy Brief for the CEO.**

This brief will be read by Harvey (CEO) to plan the sprint. It must be concrete and decision-ready.

OUTPUT FORMAT (strict markdown, start with the header):

# Sprint ${sprint} Strategy Brief (${today})

## Positioning Statement
[One paragraph — our sharp edge vs competitors RIGHT NOW. What's the one thing we do that no one else does?]

## Ideal Customer Profile (this sprint)
**Role:** [specific job title]
**Company type:** [size, stage, industry]
**Stack:** [what they're using today]
**Pain point:** [exactly what they're struggling with]
**Why Kognai now:** [why this is the moment]

## Content Plan
| # | Format | Topic | Channel | Goal |
|---|--------|-------|---------|------|
| 1 | [type] | [specific topic] | [channel] | [metric] |
| 2 | [type] | [specific topic] | [channel] | [metric] |
| 3 | [type] | [specific topic] | [channel] | [metric] |

## Growth Experiment
**Hypothesis:** [measurable prediction]
**Action:** [exactly what to do, step by step]
**Metric:** [how we know it worked]
**Owner:** CMO
**Deadline:** End of sprint

## Partnership / Integration Signal
[One specific partnership to pursue this sprint — company name, contact approach, what we'd offer]

## Sprint Narrative (external)
> [One sentence that captures the story of this sprint for press/community]

## Harvey's Decision Inputs
[3 bullet points of the most important strategic context Harvey needs to plan this sprint]

No generic advice. Every item must be actionable in the next 7 days.`;
}

// ===== Helpers =====

function writeReport(filename: string, content: string): void {
  const filepath = resolve(REPORT_DIR, filename);
  writeFileSync(filepath, content, 'utf8');
  console.log(`  ✅  Written: ${filepath}`);
}

function writePlaceholder(filename: string, taskName: string, error: string): void {
  writeReport(filename, `# ${taskName} — FAILED (${today})\n\n**Error:** ${error}\n\nCheck MANUS_API_KEY and Manus API status.\n`);
}

function handleResult(
  result: PromiseSettledResult<any>,
  filename: string,
  label: string,
): void {
  if (result.status === 'fulfilled' && result.value.status === 'completed') {
    writeReport(filename, result.value.output);
  } else {
    const err = result.status === 'rejected'
      ? result.reason?.message || String(result.reason)
      : (result.value as any).output || 'Task error';
    console.error(`  ❌  ${label} failed: ${err}`);
    writePlaceholder(filename, label, err);
  }
}

// ===== Main =====

async function main(): Promise<void> {
  const { sprint, focus } = parseArgs();
  console.log(`\n🎯  Kognai CMO — Sprint ${sprint} (${today})`);
  console.log(`    Focus: ${focus}\n`);

  mkdirSync(REPORT_DIR, { recursive: true });

  let client: ManusClient;
  try {
    client = new ManusClient({});
  } catch (err: any) {
    console.error(`❌  Manus client init failed: ${err.message}`);
    ['market-watch.md', 'opportunity-watch.md', 'strategy.md'].forEach(f =>
      writePlaceholder(f, f.replace('.md', ''), err.message)
    );
    process.exit(1);
  }

  const tasks = [
    { prompt: buildMarketWatchPrompt(sprint, focus),     label: 'market-watch',     file: 'market-watch.md' },
    { prompt: buildOpportunityWatchPrompt(sprint, focus), label: 'opportunity-watch', file: 'opportunity-watch.md' },
    { prompt: buildStrategyPrompt(sprint, focus),         label: 'strategy',          file: 'strategy.md' },
  ];

  console.log('📡  Sending 3 tasks to Manus AI in parallel...\n');

  const results = await Promise.allSettled(
    tasks.map(t =>
      client.executeTask({ prompt: t.prompt }).then(r => {
        console.log(`  [${t.label}] Done in ${(r.durationMs / 1000).toFixed(1)}s (${r.pollAttempts} polls)`);
        return r;
      })
    )
  );

  console.log('\n📝  Writing reports...');
  results.forEach((result, i) => handleResult(result, tasks[i].file, tasks[i].label));

  console.log('\n✅  CMO reports complete.');
  console.log(`    → ${REPORT_DIR}/market-watch.md`);
  console.log(`    → ${REPORT_DIR}/opportunity-watch.md`);
  console.log(`    → ${REPORT_DIR}/strategy.md\n`);
}

main().catch(err => { console.error('Fatal:', err.message || err); process.exit(1); });
