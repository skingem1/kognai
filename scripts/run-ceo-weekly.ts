#!/usr/bin/env ts-node
/**
 * run-ceo-weekly.ts — Harvey CEO Weekly Planner
 *
 * Reads CMO reports from reports/cmo/, the current sprint state, and roadmap
 * context, then calls Claude Sonnet (Harvey persona) to:
 *   1. Produce a weekly decision brief
 *   2. Draft the next sprint JSON for human review
 *
 * Outputs:
 *   reports/ceo/weekly-decision-YYYY-MM-DD.md   — strategic brief
 *   workspace/sprints/draft-sprint-NNN.json      — draft sprint (awaiting user approval)
 *
 * Usage:
 *   source .env && npx ts-node scripts/run-ceo-weekly.ts [--sprint NNN]
 *   (or via run-weekly.sh)
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import {
  mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync,
} from 'fs';
import * as https from 'https';

dotenvConfig({ path: resolve(__dirname, '..', '.env'), override: false });
dotenvConfig({ path: resolve(process.cwd(), '.env'), override: false });

// ===== Config =====

const KOGNAI_ROOT   = resolve(__dirname, '..');
const CMO_DIR       = resolve(KOGNAI_ROOT, 'reports', 'cmo');
const CEO_DIR       = resolve(KOGNAI_ROOT, 'reports', 'ceo');
const SPRINT_DIR    = resolve(KOGNAI_ROOT, 'workspace', 'sprints');
const MEMORY_DIR    = resolve(KOGNAI_ROOT, 'workspace', 'memory');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';
const today = new Date().toISOString().split('T')[0];

// ===== Helpers =====

function readIfExists(filepath: string, label: string): string {
  try {
    if (existsSync(filepath)) {
      const content = readFileSync(filepath, 'utf8').trim();
      if (content) return content;
    }
  } catch { /* ignore */ }
  return `[${label} not available]`;
}

function getLatestSprintNumber(): number {
  try {
    const files = readdirSync(SPRINT_DIR)
      .filter(f => /^sprint-\d+\.json$/.test(f))
      .sort();
    if (files.length === 0) return 0;
    const latest = files[files.length - 1];
    return parseInt(latest.replace('sprint-', '').replace('.json', ''), 10);
  } catch {
    return 0;
  }
}

function getLatestSprintSummary(num: number): string {
  if (num === 0) return '[No prior sprint found]';
  const filepath = resolve(SPRINT_DIR, `sprint-${String(num).padStart(3, '0')}.json`);
  try {
    const raw = JSON.parse(readFileSync(filepath, 'utf8'));
    const tasks = (raw.tasks || []) as any[];
    const done  = tasks.filter((t: any) => t.status === 'done').length;
    const total = tasks.length;
    const blocked = tasks.filter((t: any) => t.status === 'blocked').length;
    return `Sprint ${num}: "${raw.title || ''}" — ${done}/${total} tasks done, ${blocked} blocked.\nGoal: ${raw.goal || 'n/a'}`;
  } catch {
    return `Sprint ${num}: [could not read]`;
  }
}

function getMemoryContext(): string {
  try {
    const files = readdirSync(MEMORY_DIR)
      .filter(f => f.endsWith('.md'))
      .slice(0, 3); // last 3 memory files
    return files.map(f => {
      const content = readFileSync(resolve(MEMORY_DIR, f), 'utf8').slice(0, 800);
      return `--- ${f} ---\n${content}`;
    }).join('\n\n');
  } catch {
    return '[No memory files found]';
  }
}

function httpPost(body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': buf.length,
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Anthropic API ${res.statusCode}: ${data.slice(0, 300)}`));
          return;
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(120_000, () => { req.destroy(); reject(new Error('Anthropic timeout (120s)')); });
    req.write(buf);
    req.end();
  });
}

// ===== CEO System Prompt =====

const CEO_SYSTEM_PROMPT = `You are Harvey Specter — CEO of Kognai, a sovereign AI runtime company.

Your job RIGHT NOW: Read the CMO weekly intelligence reports and decide what to build next. Then draft the next sprint.

**KOGNAI** is a multi-agent swarm OS for software development. We have:
- A 9-layer sovereign AI architecture running locally on Mac Mini vault
- An agent swarm (Harvey/CEO, Messi/coder, Sherlock/reviewer, Guardiola, Manus/CMO) 
- A real-time routing system (local POWER tier + cloud models via ClawRouter)
- Phase 0 (Foundation Hardening) now complete — we are entering Phase 1 (Product)

**YOUR DECISION FRAMEWORK:**
1. What market signal from the CMO reports is most urgent to act on?
2. What do developers need RIGHT NOW that competitors aren't providing?
3. What can we build in one sprint (7 days) that creates real business value?
4. Is there anything from the last sprint that must be addressed before moving forward?

**OUTPUT FORMAT — you must output EXACTLY this structure:**

<WEEKLY_DECISION>
# Weekly Decision Brief — ${today}

## Market Read
[2–3 sentences on the most important signal from the CMO reports]

## Strategic Call
[What we are doing this sprint and why. One clear paragraph. No hedging.]

## What We're NOT Doing
[1–2 things explicitly deprioritized this sprint and why]

## Sprint Goal
[One sentence — the single most important outcome of this sprint]

## Success Metrics
- [Metric 1 with target]
- [Metric 2 with target]
- [Metric 3 with target]
</WEEKLY_DECISION>

<SPRINT_JSON>
{
  "sprint": "SPRINT_NUMBER",
  "title": "SPRINT_TITLE",
  "phase": "1",
  "goal": "SPRINT_GOAL_ONE_SENTENCE",
  "created": "${today}",
  "strategic_basis": "WHAT_CMO_SIGNAL_DROVE_THIS",
  "tasks": [
    {
      "id": "S{NUM}-001",
      "title": "TASK_TITLE",
      "agent": "coder",
      "type": "feature",
      "priority": "critical",
      "dependencies": [],
      "status": "pending",
      "task_target": "cloud-code",
      "context": "DETAILED_IMPLEMENTATION_CONTEXT_FOR_THE_CODING_AGENT_300_WORDS_MINIMUM",
      "deliverables": {
        "code": ["path/to/file.ts"]
      }
    }
  ]
}
</SPRINT_JSON>

SPRINT JSON RULES:
- Sprint number must be the correct next number (I'll tell you what it is)
- 4–8 tasks per sprint. Each must be completable in one coding session.
- task_target: "cloud-code" for code generation, "local" for local vault tasks, "cloud-exec" for scripts to run
- context field: detailed enough that a coding agent can implement it without asking questions (300+ words for complex tasks, 100+ for simple ones)
- All file paths must be relative to ~/kognai/
- Status is always "pending" for all tasks
- No tasks that require human input mid-sprint`;

// ===== Main =====

async function main(): Promise<void> {
  if (!ANTHROPIC_API_KEY) {
    console.error('❌  ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const latestSprintNum = getLatestSprintNumber();
  const nextSprintNum   = latestSprintNum + 1;
  const nextSprintId    = String(nextSprintNum).padStart(3, '0');

  console.log(`\n🤵  Harvey CEO Weekly Planner — ${today}`);
  console.log(`    Latest sprint: ${latestSprintNum} → drafting sprint ${nextSprintNum}\n`);

  mkdirSync(CEO_DIR, { recursive: true });

  // Read CMO reports
  const marketWatch     = readIfExists(resolve(CMO_DIR, 'market-watch.md'),      'Market Watch');
  const opportunityWatch = readIfExists(resolve(CMO_DIR, 'opportunity-watch.md'), 'Opportunity Watch');
  const strategy        = readIfExists(resolve(CMO_DIR, 'strategy.md'),           'Strategy Brief');
  const sprintSummary   = getLatestSprintSummary(latestSprintNum);
  const memoryContext   = getMemoryContext();

  const userMessage = `Here is the full weekly intelligence package. Your job: read it all, make the call, and output the decision brief + sprint JSON.

## Last Sprint Status
${sprintSummary}

## Memory Context (recent agent notes)
${memoryContext}

---

## CMO Market Watch Report
${marketWatch}

---

## CMO Opportunity Watch Report
${opportunityWatch}

---

## CMO Strategy Brief
${strategy}

---

Now make the call. Next sprint number is ${nextSprintNum} (ID: ${nextSprintId}).

Output the <WEEKLY_DECISION> block followed by the <SPRINT_JSON> block. The sprint JSON must use sprint number "${nextSprintNum}" and task IDs starting with "S${nextSprintId}-001".`;

  console.log('📡  Calling Claude (Harvey CEO)...');

  const requestBody = JSON.stringify({
    model: MODEL,
    max_tokens: 8000,
    system: CEO_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  let rawResponse: string;
  try {
    rawResponse = await httpPost(requestBody);
  } catch (err: any) {
    console.error(`❌  Claude API error: ${err.message}`);
    process.exit(1);
  }

  const parsed = JSON.parse(rawResponse);
  const text: string = parsed.content?.[0]?.text || '';

  if (!text) {
    console.error('❌  Empty response from Claude');
    process.exit(1);
  }

  // Extract <WEEKLY_DECISION>
  const decisionMatch = text.match(/<WEEKLY_DECISION>([\s\S]*?)<\/WEEKLY_DECISION>/);
  const decisionBrief = decisionMatch ? decisionMatch[1].trim() : text.slice(0, 2000);

  // Extract <SPRINT_JSON>
  const sprintMatch = text.match(/<SPRINT_JSON>([\s\S]*?)<\/SPRINT_JSON>/);
  let sprintJson: any = null;
  if (sprintMatch) {
    try {
      sprintJson = JSON.parse(sprintMatch[1].trim());
    } catch (e: any) {
      console.warn(`  ⚠️  Sprint JSON parse error: ${e.message}`);
    }
  }

  // Write decision brief
  const decisionPath = resolve(CEO_DIR, `weekly-decision-${today}.md`);
  writeFileSync(decisionPath, decisionBrief, 'utf8');
  console.log(`  ✅  Decision brief: ${decisionPath}`);

  // Write draft sprint JSON
  if (sprintJson) {
    // Ensure sprint number is correct even if Claude got it wrong
    sprintJson.sprint = nextSprintId;
    const draftPath = resolve(SPRINT_DIR, `draft-sprint-${nextSprintId}.json`);
    writeFileSync(draftPath, JSON.stringify(sprintJson, null, 2), 'utf8');
    console.log(`  ✅  Draft sprint:    ${draftPath}`);
    console.log(`\n  ⚠️  REVIEW REQUIRED: Check draft-sprint-${nextSprintId}.json before running the swarm.`);
    console.log(`      Rename to sprint-${nextSprintId}.json when approved.\n`);
  } else {
    console.warn('  ⚠️  Could not extract valid sprint JSON — check the decision brief manually.');
    const rawPath = resolve(CEO_DIR, `sprint-draft-raw-${today}.txt`);
    writeFileSync(rawPath, text, 'utf8');
    console.log(`  Raw response saved to: ${rawPath}`);
  }

  console.log('\n✅  CEO weekly planning complete.\n');
}

main().catch(err => { console.error('Fatal:', err.message || err); process.exit(1); });
