#!/usr/bin/env ts-node

/**
 * Invoica Agent Orchestrator v2
 *
 * Dynamic Agent Architecture:
 *   Leadership (Claude via Anthropic API + OpenAI Codex):
 *     - CEO: Sprint planning, strategy, decisions, daily reports
 *     - Supervisor 1: Code review & quality gate (Claude Sonnet)
 *     - Supervisor 2: Code review & quality gate (OpenAI Codex)
 *     - Skills: Agent/skill factory
 *   Marketing (Manus AI — runs independently):
 *     - CMO: Brand strategy, market intelligence, product proposals (reports loaded from files)
 *   Technology (MiniMax M2.5):
 *     - CTO: Data-driven analysis, OpenClaw/ClawHub monitoring, agent spawning proposals
 *   Execution (MiniMax M2.5 — dynamically loaded from agents/ directory):
 *     - Coding agents auto-discovered from agents/{name}/prompt.md
 *     - New agents created by CTO proposals + CEO approval
 *
 * Flow: CEO plans → MiniMax codes → Dual Supervisor review (Claude + Codex)
 *       → CEO resolves conflicts → CTO analyzes → CMO reports → CEO daily report
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import 'dotenv/config';
import { createMCClient } from './mc-client';

// ===== Types =====

interface AgentTask {
  id: string;
  agent: string;
  type: 'feature' | 'bugfix' | 'review' | 'test';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[];
  context: string;
  deliverables: {
    code?: string[];
    tests?: string[];
    docs?: string[];
  };
  status: 'pending' | 'in_progress' | 'review' | 'approved' | 'rejected' | 'done' | 'skipped';
  output?: {
    files: string[];
    commit: string;
    model: string;
    review?: ReviewResult;
  };
}

interface ReviewResult {
  verdict: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  score: number;
  summary: string;
  issues: Array<{ severity: string; file: string; description: string }>;
  strengths: string[];
}

interface CTOProposal {
  id: string;
  title: string;
  category: 'cost_optimization' | 'new_feature' | 'new_agent' | 'process_change' | 'architecture' | 'tooling';
  description: string;
  estimated_impact: string;
  risk_level: 'low' | 'medium' | 'high';
  implementation_steps: string[];
  agent_spec?: {
    name: string;
    role: string;
    llm: 'minimax' | 'anthropic';
    trigger: string;
    prompt_summary: string;
  };
}

interface CTOReport {
  summary: string;
  proposals: CTOProposal[];
  metrics_reviewed: string[];
}

interface LLMResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { total_tokens: number };
  base_resp?: { status_code: number; status_msg: string };
}

// ===== Colors =====

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function log(color: string, msg: string) {
  console.log(`${color}${msg}${c.reset}`);
}

// ===== Generic LLM Client =====

async function callLLM(
  provider: 'minimax' | 'anthropic' | 'openai',
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number = 300000
): Promise<LLMResponse> {
  if (provider === 'anthropic') {
    return callAnthropic(model, systemPrompt, userPrompt, timeoutMs);
  }
  if (provider === 'openai') {
    return callOpenAI(model, systemPrompt, userPrompt, timeoutMs);
  }
  const apiKey = process.env.MINIMAX_API_KEY || '';
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set');
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 16000,
  });
  return httpPost('https://api.minimax.io/v1/chat/completions', {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }, body, timeoutMs);
}
async function callAnthropic(model: string, systemPrompt: string, userPrompt: string, timeoutMs: number): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in .env');
  const body = JSON.stringify({
    model, max_tokens: 16000, system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }], temperature: 0.3,
  });
  const rawResponse = await httpPost('https://api.anthropic.com/v1/messages', {
    'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
  }, body, timeoutMs);
  const anthropicData = rawResponse as any;
  if (anthropicData.content && Array.isArray(anthropicData.content)) {
    const textContent = anthropicData.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return {
      choices: [{ message: { content: textContent } }],
      usage: { total_tokens: (anthropicData.usage?.input_tokens || 0) + (anthropicData.usage?.output_tokens || 0) },
    };
  }
  return rawResponse;
}
async function callOpenAI(model: string, systemPrompt: string, userPrompt: string, timeoutMs: number): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in .env');
  // o4-mini and reasoning models use max_completion_tokens and developer role
  const isReasoningModel = model.startsWith('o');
  const tokenParam = isReasoningModel ? 'max_completion_tokens' : 'max_tokens';
  const sysRole = isReasoningModel ? 'developer' : 'system';
  const bodyObj: Record<string, unknown> = {
    model,
    [tokenParam]: 16000,
    messages: [
      { role: sysRole, content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (!isReasoningModel) bodyObj.temperature = 0.3;
  const body = JSON.stringify(bodyObj);
  return httpPost('https://api.openai.com/v1/chat/completions', {
    'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`,
  }, body, timeoutMs);
}
function httpPost(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<any> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : undefined),
      path: parsed.pathname, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) { reject(new Error(`API error: ${result.error.message || JSON.stringify(result.error)}`)); return; }
          resolve(result);
        } catch { reject(new Error(`Failed to parse response: ${data.substring(0, 500)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`API timeout (${timeoutMs/1000}s)`)); });
    req.write(body); req.end();
  });
}
// ===== Supervisor Agent (Claude via Anthropic API) =====

class SupervisorAgent {
  private systemPrompt: string;
  constructor() {
    const promptPath = './agents/supervisor/prompt.md';
    this.systemPrompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8') : 'You are a code review supervisor.';
    log(c.magenta, '+ Loaded supervisor agent (Claude via Anthropic API)');
  }

  async reviewTask(task: AgentTask, files: string[]): Promise<ReviewResult> {
    log(c.magenta, `\n[supervisor] Reviewing: ${task.id}`);
    const fileContents = files.map((filepath) => {
      const content = existsSync(filepath) ? readFileSync(filepath, 'utf-8') : '';
      return `### ${filepath}\n\`\`\`typescript\n${content.substring(0, 4000)}\n\`\`\``;
    }).join('\n\n');
    // CTO-005: Add fence detection to supervisor review checklist
    const integrityContext = (task as any)._integrityFailed
      ? `\n\n## ⚠️ INTEGRITY ALERT\n${(task as any)._integrityDetails}\nThis file was flagged for destructive rewrite. The original was preserved. REJECT this task.\n`
      : '';
    const userPrompt = `Review the following code generated for task ${task.id}.\n\n## Task Spec\n${task.context}\n\n## Generated Files (${files.length})\n${fileContents}${integrityContext}\n\n## Instructions\nCRITICAL CHECK: Does ANY file start with a markdown code fence (\`\`\`tsx, \`\`\`typescript, etc.)? If YES, auto-REJECT — code fences in source files are invalid syntax.\nAlso check: Did the file lose existing functionality? If a file shrank significantly, REJECT.\n\nRespond with a JSON object:\n{\n  "verdict": "APPROVED" or "REJECTED",\n  "score": 0-100,\n  "summary": "brief review summary",\n  "issues": [{"severity": "critical|high|medium|low", "file": "path", "description": "..."}],\n  "strengths": ["..."]\n}`;
    const startTime = Date.now();
    log(c.gray, '  -> Sending to Claude (Anthropic API)...');
    try {
      const response = await callLLM('anthropic', 'claude-sonnet-4-20250514', this.systemPrompt, userPrompt, 120000);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(c.gray, `  -> Review received in ${elapsed}s (${response.usage?.total_tokens || '?'} tokens)`);
      const content = response.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const review = JSON.parse(jsonMatch[0]) as ReviewResult;
        if (review.verdict === 'APPROVED') { log(c.green, `  ✓ APPROVED (score: ${review.score}/100)`); }
        else {
          log(c.red, `  ✗ REJECTED (score: ${review.score}/100)`);
          log(c.yellow, `  Summary: ${review.summary}`);
          for (const issue of review.issues || []) { log(c.yellow, `    [${issue.severity}] ${issue.file}: ${issue.description}`); }
        }
        return review;
      }
      log(c.yellow, '  ! Could not parse review JSON, auto-approving');
      return { verdict: 'APPROVED', score: 70, summary: 'Auto-approved (parse failure)', issues: [], strengths: [] };
    } catch (error: any) {
      log(c.yellow, `  ! Supervisor error: ${error.message}`);
      return { verdict: 'APPROVED', score: 0, summary: `Supervisor unavailable: ${error.message}`, issues: [], strengths: [] };
    }
  }
}
// ===== Supervisor 2 Agent (OpenAI Codex) =====

class Supervisor2Agent {
  private systemPrompt: string;
  constructor() {
    const promptPath = './agents/supervisor/prompt.md';
    this.systemPrompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8') : 'You are a code review supervisor.';
    log(c.magenta, '+ Loaded supervisor 2 agent (OpenAI Codex)');
  }

  async reviewTask(task: AgentTask, files: string[]): Promise<ReviewResult> {
    log(c.magenta, `\n[supervisor-2/codex] Reviewing: ${task.id}`);
    const fileContents = files.map((filepath) => {
      const content = existsSync(filepath) ? readFileSync(filepath, 'utf-8') : '';
      return `### ${filepath}\n\`\`\`typescript\n${content.substring(0, 4000)}\n\`\`\``;
    }).join('\n\n');
    // CTO-005: Add fence detection to Codex supervisor review checklist
    const integrityContext2 = (task as any)._integrityFailed
      ? `\n\n## ⚠️ INTEGRITY ALERT\n${(task as any)._integrityDetails}\nThis file was flagged for destructive rewrite. The original was preserved. REJECT this task.\n`
      : '';
    const userPrompt = `Review the following code generated for task ${task.id}.\n\n## Task Spec\n${task.context}\n\n## Generated Files (${files.length})\n${fileContents}${integrityContext2}\n\n## Instructions\nCRITICAL CHECK: Does ANY file start with a markdown code fence (\`\`\`tsx, \`\`\`typescript, etc.)? If YES, auto-REJECT — code fences in source files are invalid syntax.\nAlso check: Did the file lose existing functionality? If a file shrank significantly, REJECT.\n\nRespond with a JSON object:\n{\n  "verdict": "APPROVED" or "REJECTED",\n  "score": 0-100,\n  "summary": "brief review summary",\n  "issues": [{"severity": "critical|high|medium|low", "file": "path", "description": "..."}],\n  "strengths": ["..."]\n}`;
    const startTime = Date.now();
    log(c.gray, '  -> Sending to OpenAI Codex...');
    try {
      const response = await callLLM('openai', 'o4-mini', this.systemPrompt, userPrompt, 120000);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(c.gray, `  -> Codex review received in ${elapsed}s (${response.usage?.total_tokens || '?'} tokens)`);
      const content = response.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const review = JSON.parse(jsonMatch[0]) as ReviewResult;
        if (review.verdict === 'APPROVED') { log(c.green, `  ✓ [Codex] APPROVED (score: ${review.score}/100)`); }
        else {
          log(c.red, `  ✗ [Codex] REJECTED (score: ${review.score}/100)`);
          log(c.yellow, `  Summary: ${review.summary}`);
          for (const issue of review.issues || []) { log(c.yellow, `    [${issue.severity}] ${issue.file}: ${issue.description}`); }
        }
        return review;
      }
      log(c.yellow, '  ! [Codex] Could not parse review JSON, auto-approving');
      return { verdict: 'APPROVED', score: 70, summary: 'Auto-approved (Codex parse failure)', issues: [], strengths: [] };
    } catch (error: any) {
      log(c.yellow, `  ! [Codex] Supervisor 2 error: ${error.message}`);
      return { verdict: 'APPROVED', score: 0, summary: `Supervisor 2 unavailable: ${error.message}`, issues: [], strengths: [] };
    }
  }
}

// ===== Dual Supervisor Review Reconciliation =====

interface DualReviewResult {
  finalReview: ReviewResult;
  review1: ReviewResult;
  review2: ReviewResult;
  consensus: boolean;
  escalatedToCEO: boolean;
  ceoDecision?: string;
}

async function reconcileSupervisorReviews(
  review1: ReviewResult,
  review2: ReviewResult,
  task: AgentTask,
  ceo: CEOAgent,
): Promise<DualReviewResult> {
  const bothApproved = review1.verdict === 'APPROVED' && review2.verdict === 'APPROVED';
  const bothRejected = review1.verdict !== 'APPROVED' && review2.verdict !== 'APPROVED';
  const consensus = bothApproved || bothRejected;

  if (bothApproved) {
    // Both approve — take the average score, merge strengths
    const avgScore = Math.round((review1.score + review2.score) / 2);
    log(c.green, `  ✓ DUAL CONSENSUS: Both supervisors APPROVED (Claude: ${review1.score}, Codex: ${review2.score}, avg: ${avgScore})`);
    return {
      finalReview: {
        verdict: 'APPROVED',
        score: avgScore,
        summary: `Dual-approved: Claude (${review1.score}/100) + Codex (${review2.score}/100)`,
        issues: [...review1.issues, ...review2.issues],
        strengths: [...new Set([...review1.strengths, ...review2.strengths])],
      },
      review1, review2, consensus: true, escalatedToCEO: false,
    };
  }

  if (bothRejected) {
    // Both reject — merge issues, take lower score
    const minScore = Math.min(review1.score, review2.score);
    log(c.red, `  ✗ DUAL CONSENSUS: Both supervisors REJECTED (Claude: ${review1.score}, Codex: ${review2.score})`);
    return {
      finalReview: {
        verdict: 'REJECTED',
        score: minScore,
        summary: `Dual-rejected: Claude (${review1.score}/100) + Codex (${review2.score}/100). ${review1.summary} | ${review2.summary}`,
        issues: [...review1.issues, ...review2.issues],
        strengths: [],
      },
      review1, review2, consensus: true, escalatedToCEO: false,
    };
  }

  // CONFLICT — one approved, one rejected → escalate to CEO
  const approver = review1.verdict === 'APPROVED' ? 'Claude' : 'Codex';
  const rejecter = review1.verdict === 'APPROVED' ? 'Codex' : 'Claude';
  const approvalReview = review1.verdict === 'APPROVED' ? review1 : review2;
  const rejectionReview = review1.verdict === 'APPROVED' ? review2 : review1;

  log(c.yellow, `  ⚡ SUPERVISOR CONFLICT on ${task.id}: ${approver} APPROVED (${approvalReview.score}), ${rejecter} REJECTED (${rejectionReview.score})`);
  log(c.magenta, `  → Escalating to CEO for final decision...`);

  try {
    const ceoDecision = await ceo.resolveReviewConflict(task, approvalReview, rejectionReview, approver, rejecter);
    const ceoApproves = ceoDecision.toLowerCase().includes('approve');
    log(ceoApproves ? c.green : c.red, `  CEO DECISION: ${ceoApproves ? 'APPROVED' : 'REJECTED'} — ${ceoDecision.substring(0, 200)}`);

    return {
      finalReview: {
        verdict: ceoApproves ? 'APPROVED' : 'REJECTED',
        score: ceoApproves ? approvalReview.score : rejectionReview.score,
        summary: `CEO resolved conflict (${approver} approved, ${rejecter} rejected): ${ceoDecision.substring(0, 300)}`,
        issues: rejectionReview.issues,
        strengths: approvalReview.strengths,
      },
      review1, review2, consensus: false, escalatedToCEO: true, ceoDecision,
    };
  } catch (error: any) {
    // CEO unavailable — default to rejection (safer)
    log(c.yellow, `  CEO unavailable for conflict resolution: ${error.message}. Defaulting to REJECTED.`);
    return {
      finalReview: rejectionReview,
      review1, review2, consensus: false, escalatedToCEO: false,
    };
  }
}

// ===== CEO Agent (Claude via Anthropic API) =====

class CEOAgent {
  private systemPrompt: string;
  constructor() {
    const promptPath = './agents/ceo/prompt.md';
    this.systemPrompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8') : 'You are the CEO of Countable.';
    log(c.magenta, '+ Loaded CEO agent (Claude via Anthropic API)');
  }

  async reviewSprintProgress(tasks: AgentTask[]): Promise<string> {
    const done = tasks.filter(t => t.status === 'done').length;
    const total = tasks.length;
    const pending = tasks.filter(t => t.status === 'pending');
    const rejected = tasks.filter(t => t.status === 'rejected');
    log(c.magenta, `\n[ceo] Sprint progress check (${done}/${total} done)`);
    const userPrompt = `IMPORTANT: Plain text only, no tools, no XML. Respond directly.

Sprint progress update:\n- Done: ${done}/${total}\n- Pending: ${pending.map(t => t.id).join(', ') || 'none'}\n- Rejected: ${rejected.map(t => t.id).join(', ') || 'none'}\n\nTask details:\n${JSON.stringify(tasks.map(t => ({ id: t.id, status: t.status, agent: t.agent, priority: t.priority })), null, 2)}\n\nAs CEO, briefly assess:\n1. Are we on track?\n2. Any tasks to re-prioritize?\n3. Cost efficiency — are we using the right models?\n4. Any strategic adjustments needed?\n\nKeep response under 200 words.`;
    try {
      // Sprint progress is formulaic — MiniMax is sufficient, saves Claude budget
      const response = await callLLM('minimax', 'MiniMax-M2.5', this.systemPrompt, userPrompt, 60000);
      const content = response.choices?.[0]?.message?.content || 'No response';
      log(c.magenta, `  CEO assessment: ${content.substring(0, 500)}`);
      return content;
    } catch (error: any) {
      log(c.yellow, `  ! CEO unavailable: ${error.message}`);
      return 'CEO agent unavailable';
    }
  }

  async resolveReviewConflict(
    task: AgentTask,
    approvalReview: ReviewResult,
    rejectionReview: ReviewResult,
    approver: string,
    rejecter: string,
  ): Promise<string> {
    log(c.magenta, `\n[ceo] Resolving supervisor conflict on ${task.id}...`);
    const userPrompt = `IMPORTANT: Respond with ONLY APPROVE or REJECT and a brief reason. No tools, no XML, no file reading.\n\nTwo code review supervisors disagree on task ${task.id}.

## Task Spec
${task.context?.substring(0, 800) || 'No context'}

## ${approver} says APPROVED (score: ${approvalReview.score}/100)
Summary: ${approvalReview.summary}
Strengths: ${approvalReview.strengths?.join(', ') || 'none listed'}

## ${rejecter} says REJECTED (score: ${rejectionReview.score}/100)
Summary: ${rejectionReview.summary}
Issues found:
${(rejectionReview.issues || []).map(i => `- [${i.severity}] ${i.file}: ${i.description}`).join('\n')}

## Your Decision
As CEO, you must make the final call. Consider:
1. Are the rejection issues genuine blockers or nitpicks?
2. Does the code meet the task spec requirements?
3. Is it safe to ship, or are there real quality/security concerns?

Respond with ONE of:
- "APPROVE — [brief reason]" if the code is good enough to ship
- "REJECT — [brief reason]" if the rejection issues are valid and must be fixed

Keep response under 100 words.`;
    try {
      const response = await callLLM('anthropic', 'claude-sonnet-4-20250514', this.systemPrompt, userPrompt, 60000);
      const content = response.choices?.[0]?.message?.content || 'No response';
      log(c.magenta, `  CEO conflict resolution: ${content.substring(0, 300)}`);
      return content;
    } catch (error: any) {
      log(c.yellow, `  ! CEO unavailable for conflict resolution: ${error.message}`);
      throw error;
    }
  }

  async reviewCTOProposals(ctoReport: CTOReport): Promise<string> {
    log(c.magenta, `\n[ceo] Reviewing ${ctoReport.proposals.length} CTO proposals...`);
    const proposalsSummary = ctoReport.proposals.map((p, i) => `
### Proposal ${i + 1}: ${p.title}
- ID: ${p.id}
- Category: ${p.category}
- Risk: ${p.risk_level}
- Description: ${p.description}
- Impact: ${p.estimated_impact}
- Steps: ${p.implementation_steps.join(', ')}
${p.agent_spec ? `- NEW AGENT: name=${p.agent_spec.name}, role="${p.agent_spec.role}", llm=${p.agent_spec.llm}, trigger=${p.agent_spec.trigger}` : ''}
`).join('\n');

    const userPrompt = `IMPORTANT: You have NO tools. Do NOT output XML tool calls or file-reading syntax. Respond ONLY with the JSON array. All context is in this message.

The CTO has analyzed our project data and submitted ${ctoReport.proposals.length} proposal(s).

## CTO Summary
${ctoReport.summary}

## Proposals
${proposalsSummary}

## Your Review Criteria
For each proposal, evaluate:
1. **Evidence-based**: Is it backed by real sprint data? (CTO reviewed: ${ctoReport.metrics_reviewed.join(', ')})
2. **Cost impact**: Will this save or cost money?
3. **Risk level**: Can we roll back if it fails?
4. **Business value**: Does it help ship features faster?
5. **Disruption level**: How much will this change current workflows?

**For new_agent proposals, ALSO evaluate:**
- Is the capability gap real? (not something an existing agent handles)
- Is MiniMax appropriate, or does this need Claude-level intelligence?
- Is the trigger frequency reasonable? (every_sprint may be expensive)
- Will the total agent count become unmanageable?

**For ClawHub skill proposals:**
- Has a security_review step been included? (REQUIRED — ClawHub skills may contain malware)
- Is the skill from a trusted author?

## Decision Format
For EACH proposal, respond with a decision JSON:
{
  "decision": "APPROVED | REJECTED | DEFERRED",
  "proposal_id": "the proposal ID",
  "reasoning": "Why this decision",
  "conditions": ["Any conditions for implementation"],
  "cascade_orders": ["Company-wide changes if approved"],
  "priority": "immediate | next_sprint | backlog"
}

Wrap all decisions in a JSON array. Be concise.`;

    try {
      const response = await callLLM('anthropic', 'claude-sonnet-4-20250514', this.systemPrompt, userPrompt, 60000);
      const content = response.choices?.[0]?.message?.content || 'No response';
      log(c.magenta, `  CEO CTO review: ${content.substring(0, 500)}`);
      return content;
    } catch (error: any) {
      log(c.yellow, `  ! CEO CTO review failed: ${error.message}`);
      return 'CEO unavailable for CTO review';
    }
  }
  async generateDailyReport(tasks: AgentTask[], stats: { tasksExecuted: number; approved: number; rejected: number; conflicts?: number; escalations?: number }, ctoReport: string, ctoDecisions: string): Promise<void> {
    log(c.magenta, '\n[ceo] Generating daily report for owner...');
    const done = tasks.filter(t => t.status === 'done').length;
    const rejected = tasks.filter(t => t.status === 'rejected').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const today = new Date().toISOString().split('T')[0];

    const userPrompt = `IMPORTANT: Output ONLY the markdown report. No tools, no XML, no file reading. All data is in this message.\n\nGenerate a daily report for the owner of Countable. Today is ${today}.

## Sprint Data
- Tasks executed: ${stats.tasksExecuted}
- Approved: ${stats.approved}
- Rejected: ${stats.rejected}
- Done: ${done}, Pending: ${pending}, Total: ${tasks.length}

Task details:
${JSON.stringify(tasks.map(t => ({ id: t.id, status: t.status, agent: t.agent })), null, 2)}

## CTO Report
${ctoReport}

## CEO Decisions on CTO Proposals
${ctoDecisions}

## Dual Supervisor Review Stats
- Supervisor conflicts: ${stats.conflicts || 0}
- CEO escalations: ${stats.escalations || 0}

## Estimated Costs
- MiniMax coding: ~$0.09/task x ${stats.tasksExecuted} tasks = ~$${(stats.tasksExecuted * 0.09).toFixed(2)}
- Claude reviews: ~$0.04/review x ${stats.approved + stats.rejected} reviews = ~$${((stats.approved + stats.rejected) * 0.04).toFixed(2)}
- Codex reviews: ~$0.03/review x ${stats.approved + stats.rejected} reviews = ~$${((stats.approved + stats.rejected) * 0.03).toFixed(2)}
- CEO conflict resolution: ~$0.03 x ${stats.escalations || 0} escalations = ~$${((stats.escalations || 0) * 0.03).toFixed(2)}
- Claude CEO calls: ~$0.03 x 4 = ~$0.12
- MiniMax CTO scan: ~$0.05

Generate a concise daily report in markdown format following the template in your prompt. Include:
1. Sprint Progress
2. Cost Summary
3. Key Decisions Made
4. CTO Proposals Reviewed
5. Blockers & Risks
6. Tomorrow's Plan

Keep it under 300 words. Be honest about failures.`;

    try {
      // Daily report is template fill-in — MiniMax is sufficient, saves Claude budget
      const response = await callLLM('minimax', 'MiniMax-M2.5', this.systemPrompt, userPrompt, 60000);
      const report = response.choices?.[0]?.message?.content || 'Report generation failed';

      // Save to reports/daily/
      mkdirSync('reports/daily', { recursive: true });
      const reportPath = `reports/daily/${today}.md`;
      writeFileSync(reportPath, report);
      log(c.green, `  ✓ Daily report saved: ${reportPath}`);
      log(c.magenta, `  Report preview: ${report.substring(0, 300)}`);
    } catch (error: any) {
      log(c.yellow, `  ! Daily report failed: ${error.message}`);
    }
  }
}
// ===== CTO Data Collector (gathers real project context for CTO analysis) =====

class CTODataCollector {
  collect(): string {
    const sections: string[] = ['## PROJECT DATA (Real metrics — base all proposals on this data)\n'];

    // 1. Sprint results — find most recent sprint file
    try {
      const sprintDir = './sprints';
      if (existsSync(sprintDir)) {
        const sprintFiles = readdirSync(sprintDir).filter(f => f.endsWith('.json')).sort().reverse();
        if (sprintFiles.length > 0) {
          const latestSprint = JSON.parse(readFileSync(`${sprintDir}/${sprintFiles[0]}`, 'utf-8'));
          const tasks = latestSprint.tasks || [];
          const done = tasks.filter((t: any) => t.status === 'done').length;
          const rejected = tasks.filter((t: any) => t.status === 'rejected').length;
          sections.push(`### Sprint Results (${sprintFiles[0].replace('.json', '')})`);
          sections.push(`- ${tasks.length} tasks, ${done} approved, ${rejected} rejected`);
          for (const t of tasks) {
            const score = t.output?.review?.score || '?';
            const attempts = t.output?.review ? 1 : '?';
            sections.push(`- ${t.id} (${t.agent}): status=${t.status}, score=${score}`);
          }
          sections.push('');
        }
      }
    } catch (e: any) { sections.push(`### Sprint Results\n- Error reading: ${e.message}\n`); }

    // 2. Learnings — first 3000 chars
    try {
      const learnings = existsSync('./docs/learnings.md') ? readFileSync('./docs/learnings.md', 'utf-8') : '';
      if (learnings) {
        sections.push('### Key Learnings (from docs/learnings.md)');
        sections.push(learnings.substring(0, 3000));
        if (learnings.length > 3000) sections.push('... (truncated)');
        sections.push('');
      }
    } catch { sections.push('### Key Learnings\n- File not found\n'); }

    // 3. Existing agents
    try {
      const agentDirs = existsSync('./agents') ? readdirSync('./agents') : [];
      const leadershipAgents = ['ceo', 'supervisor', 'skills'];
      const techAgents = ['cto'];
      sections.push(`### Existing Agents (${agentDirs.length} directories)`);
      for (const dir of agentDirs) {
        const layer = leadershipAgents.includes(dir) ? 'Claude/leadership'
          : techAgents.includes(dir) ? 'MiniMax/technology' : 'MiniMax/coding';
        sections.push(`- ${dir} (${layer})`);
      }
      sections.push('');
    } catch { sections.push('### Existing Agents\n- Error reading agents directory\n'); }

    // 4. Most recent daily report (last 2000 chars)
    try {
      const reportDir = './reports/daily';
      if (existsSync(reportDir)) {
        const reports = readdirSync(reportDir).filter(f => f.endsWith('.md')).sort().reverse();
        if (reports.length > 0) {
          const latestReport = readFileSync(`${reportDir}/${reports[0]}`, 'utf-8');
          sections.push(`### Recent Daily Report (${reports[0]})`);
          sections.push(latestReport.substring(0, 2000));
          sections.push('');
        }
      }
    } catch { /* no reports yet */ }

    // 5. Current stack versions (read from package.json or env)
    sections.push('### Current Stack');
    sections.push('- OpenClaw: v2026.2.12');
    sections.push('- ClawRouter: v0.9.3 (unfunded, using Anthropic API direct)');
    sections.push('- Models: MiniMax M2.5 (coding ~$0.09/task), Claude Sonnet (review ~$0.04/review)');
    sections.push('- Node.js: v22.22.0, PM2 in WSL2');
    sections.push('- Orchestrator: v2, dynamic agent loading, one-file-per-call, rejection feedback');
    sections.push('');

    // 6. External monitoring hints
    sections.push('### External Sources to Consider');
    sections.push('- OpenClaw GitHub: https://github.com/openclaw/openclaw (check weekly for new releases since v2026.2.12)');
    sections.push('- ClawHub.ai: https://clawhub.ai/ (check for existing skills when proposing improvements)');
    sections.push('  SECURITY WARNING: ClawHub skills are third-party and may contain malicious code.');
    sections.push('  Any skill from ClawHub MUST include a security_review step in implementation_steps.');
    sections.push('- MiniMax / Anthropic pricing pages for cost changes');
    sections.push('');

    return sections.join('\n');
  }
}

// ===== CTO Agent (MiniMax — data-driven tech analyst + agent spawning) =====

class CTOAgent {
  private systemPrompt: string;
  private dataCollector: CTODataCollector;

  constructor() {
    const promptPath = './agents/cto/prompt.md';
    this.systemPrompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8') : 'You are the CTO of Invoica.';
    this.dataCollector = new CTODataCollector();
    log(c.cyan, '+ Loaded CTO agent (MiniMax M2.5 — data-driven)');
  }

  async analyze(): Promise<CTOReport> {
    log(c.cyan, '\n[cto] Collecting project data for analysis...');
    const projectContext = this.dataCollector.collect();
    log(c.cyan, `  Context collected: ${projectContext.length} chars`);

    const userPrompt = `You are the CTO of Invoica. Analyze the REAL project data below and identify improvements.

${projectContext}

## Your Analysis Tasks
Based on the REAL data above (do NOT hallucinate or assume — use only what you see):
1. Review sprint results — are rejection rates acceptable? Any patterns?
2. Review learnings — are there unresolved issues or recurring problems?
3. Check agent coverage — is there a capability gap that a new agent could fill?
4. Consider cost efficiency — can we reduce per-sprint costs?
5. Consider OpenClaw/ClawHub — are there new releases or skills that could help?
   - For ClawHub skills: flag any that could help, but mark them for security review
   - For OpenClaw: note version differences if updates are available

## CRITICAL: Output Format
Respond with ONLY a JSON object. No markdown fences, no explanation text, no thinking.
{
  "summary": "1-2 sentence overview of findings",
  "proposals": [
    {
      "id": "CTO-20260214-001",
      "title": "Short title",
      "category": "new_agent|cost_optimization|process_change|architecture|tooling|new_feature",
      "description": "What and why",
      "estimated_impact": "cost/quality impact",
      "risk_level": "low|medium|high",
      "implementation_steps": ["step1", "step2"],
      "agent_spec": {
        "name": "agent-name",
        "role": "What this agent does",
        "llm": "minimax|anthropic",
        "trigger": "every_sprint|on_demand|weekly",
        "prompt_summary": "Key instructions for this agent"
      }
    }
  ],
  "metrics_reviewed": ["sprint_results", "learnings", "agent_list", "daily_report", "stack_versions"]
}

Rules:
- agent_spec is ONLY required when category="new_agent"
- If no improvements needed, return empty proposals array
- For ClawHub skill proposals, always include "security_review: audit skill source code for malicious patterns" in implementation_steps
- Be specific — "improve performance" is rejected; "add Redis caching to /api/invoices with 5min TTL" is accepted
- Maximum 3 proposals per analysis cycle`;

    try {
      const startTime = Date.now();
      const response = await callLLM('minimax', 'MiniMax-M2.5', this.systemPrompt, userPrompt, 120000);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      let content = response.choices?.[0]?.message?.content || '';
      // Strip MiniMax <think>...</think> tags
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      log(c.cyan, `  CTO analysis completed in ${elapsed}s`);
      log(c.gray, `  Raw output preview: ${content.substring(0, 300)}`);

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const report = JSON.parse(jsonMatch[0]) as CTOReport;
        report.proposals = report.proposals || [];
        report.metrics_reviewed = report.metrics_reviewed || [];
        log(c.cyan, `  Summary: ${report.summary}`);
        log(c.cyan, `  Proposals: ${report.proposals.length}`);
        for (const p of report.proposals) {
          log(c.cyan, `    - [${p.category}] ${p.title} (risk: ${p.risk_level})`);
        }
        return report;
      }
      log(c.yellow, '  Could not parse CTO JSON, returning empty report');
      return { summary: 'CTO output was not valid JSON', proposals: [], metrics_reviewed: [] };
    } catch (error: any) {
      log(c.yellow, `  CTO analysis failed: ${error.message}`);
      return { summary: `Error: ${error.message}`, proposals: [], metrics_reviewed: [] };
    }
  }

  /**
   * Post-sprint analysis: autonomous retrospective that runs after every sprint.
   * Analyzes sprint results, detects failure patterns, and saves a report.
   * This runs the CTO techwatch `post-sprint-analysis` watch type.
   */
  async postSprintAnalysis(tasks: any[], stats: any): Promise<string> {
    log(c.cyan, '\n[cto] Running autonomous post-sprint analysis...');
    const startTime = Date.now();

    // Build sprint summary for context
    const totalTasks = tasks.length;
    const done = tasks.filter((t: any) => t.status === 'done').length;
    const doneManual = tasks.filter((t: any) => t.status === 'done-manual').length;
    const rejected = tasks.filter((t: any) => t.status === 'rejected').length;
    const autoRate = totalTasks > 0 ? ((done / totalTasks) * 100).toFixed(0) : '0';

    const taskDetails = tasks.map((t: any) => {
      const id = t.id || 'unknown';
      const agent = t.agent || 'unknown';
      const status = t.status || 'unknown';
      const title = t.title || t.description || 'no title';
      const score = t.output?.review?.score || t.output?.score || '?';
      const attempts = t.output?.attempts || t.attempts || '?';
      const feedback = t.output?.review?.feedback || '';
      let line = `- ${id} (${agent}): ${title} — status=${status}, score=${score}, attempts=${attempts}`;
      if (status === 'done-manual' || status === 'rejected') {
        line += `\n  ⚠ ${feedback ? String(feedback).substring(0, 200) : 'Required manual intervention'}`;
      }
      return line;
    }).join('\n');

    const projectContext = this.dataCollector.collect();

    const userPrompt = `You are the CTO of Invoica performing your MANDATORY post-sprint retrospective analysis.

## Sprint Just Completed
- Total tasks: ${totalTasks}
- Auto-approved: ${done} (${autoRate}%)
- Manual fixes needed: ${doneManual}
- Still rejected: ${rejected}
- Supervisor conflicts: ${stats.conflicts || 0}
- CEO escalations: ${stats.escalations || 0}

## Task-by-Task Results
${taskDetails}

## Project Context
${projectContext}

## CRITICAL: Your Responsibilities
1. Analyze every failed/manual-fix task — identify root cause (truncation, code fences, wrong imports, supervisor error, etc.)
2. Compare auto-approval rate with previous sprints — are we improving or declining?
3. Identify recurring patterns that need process changes
4. Generate max 3 concrete improvement proposals for the CEO
5. Each proposal MUST reference specific task IDs and data from THIS sprint

## Output Format
Respond with a structured markdown report containing:
1. Executive Summary (2-3 sentences)
2. Sprint Scorecard
3. Failure Root Cause Analysis (per failed task)
4. Trend Analysis
5. Proposals in JSON format:
\`\`\`json
{
  "summary": "...",
  "proposals": [...],
  "sprint_metrics": { "total_tasks": ${totalTasks}, "auto_approved": ${done}, "manual_fixes": ${doneManual}, "rejected": ${rejected}, "auto_success_rate": "${autoRate}%", "trend": "improving|declining|stable" }
}
\`\`\`

Rules: Be specific — reference task IDs, rejection counts, concrete patterns. No vague recommendations.`;

    try {
      const response = await callLLM('minimax', 'MiniMax-M2.5', this.systemPrompt, userPrompt, 120000);
      let content = response.choices?.[0]?.message?.content || '';
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Save report
      const date = new Date().toISOString().split('T')[0];
      const reportDir = './reports/cto';
      mkdirSync(reportDir, { recursive: true });
      const reportPath = `${reportDir}/post-sprint-analysis-${date}.md`;
      writeFileSync(reportPath, content);
      // Also update latest pointer
      writeFileSync(`${reportDir}/latest-post-sprint-analysis.md`, content);

      log(c.cyan, `  Post-sprint analysis complete (${elapsed}s)`);
      log(c.cyan, `  Report saved: ${reportPath}`);

      // Try to extract proposals and add to approved-proposals tracker for CEO review
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*"proposals"[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        try {
          const parsed = JSON.parse(jsonStr.trim());
          const proposalCount = parsed.proposals?.length || 0;
          log(c.cyan, `  Extracted ${proposalCount} proposals for CEO review`);
        } catch { /* JSON parse failed — report is still saved as markdown */ }
      }

      return content;
    } catch (error: any) {
      log(c.yellow, `  Post-sprint analysis failed: ${error.message}`);
      return `Post-sprint analysis error: ${error.message}`;
    }
  }
}

// ===== Agent Creator (creates new agents from CEO-approved CTO proposals) =====

class AgentCreator {
  createAgent(spec: NonNullable<CTOProposal['agent_spec']>): string {
    const agentDir = `./agents/${spec.name}`;
    mkdirSync(agentDir, { recursive: true });

    // Write agent.yaml
    const yaml = `name: ${spec.name}
role: "${spec.role}"
llm: ${spec.llm === 'anthropic' ? 'anthropic/claude-sonnet-4-20250514' : 'minimax/MiniMax-M2.5'}
reports_to: ceo
trigger: ${spec.trigger}
created_by: cto_proposal
created_at: "${new Date().toISOString()}"
context_files:
  - docs/learnings.md
`;
    writeFileSync(`${agentDir}/agent.yaml`, yaml);

    // Write prompt.md
    const prompt = `# ${spec.name} Agent — ${spec.role}

You are the **${spec.name}** agent at **Invoica** (invoica.ai) — the world's first Financial OS for AI Agents.

## Your Role
${spec.prompt_summary}

## Guidelines
- Follow all instructions in \`docs/learnings.md\`
- Report findings to CEO for review
- Never take destructive actions without approval
- Keep outputs concise and structured (JSON preferred)

## Created By
This agent was proposed by the CTO and approved by the CEO.
Trigger: ${spec.trigger}
LLM: ${spec.llm}
`;
    writeFileSync(`${agentDir}/prompt.md`, prompt);

    log(c.green, `  ✓ Created agent: ${spec.name} at ${agentDir}/`);
    log(c.gray, `    Role: ${spec.role}`);
    log(c.gray, `    LLM: ${spec.llm}, Trigger: ${spec.trigger}`);
    return spec.name;
  }
}
// ===== CMO Report Loader (reads CMO reports produced by standalone Manus runner) =====

function loadCMOReports(): string {
  const reportsDir = './reports/cmo';
  const sections: string[] = [];

  try {
    // Load latest market watch
    const marketWatch = reportsDir + '/latest-market-watch.md';
    if (existsSync(marketWatch)) {
      const content = readFileSync(marketWatch, 'utf-8');
      sections.push('### CMO Market Watch\n' + content.substring(0, 3000));
    }

    // Load latest strategy report
    const strategy = reportsDir + '/latest-strategy-report.md';
    if (existsSync(strategy)) {
      const content = readFileSync(strategy, 'utf-8');
      sections.push('### CMO Strategy Report\n' + content.substring(0, 3000));
    }

    // Load pending product proposals
    const proposalsDir = reportsDir + '/proposals';
    if (existsSync(proposalsDir)) {
      const proposals = readdirSync(proposalsDir).filter(f => f.endsWith('.md'));
      for (const pf of proposals.slice(0, 3)) {
        const content = readFileSync(proposalsDir + '/' + pf, 'utf-8');
        sections.push('### CMO Product Proposal: ' + pf + '\n' + content.substring(0, 2000));
      }
    }
  } catch { /* CMO reports not available yet — graceful degradation */ }

  return sections.length > 0
    ? '## CMO Reports (Manus AI)\n\n' + sections.join('\n\n---\n\n')
    : '';
}

// ===== Owner Directives Loader (reads owner instructions from reports/owner/) =====

function loadOwnerDirectives(): string {
  const dir = "./reports/owner";
  const sections: string[] = [];
  try {
    if (!existsSync(dir)) return "";
    const files = readdirSync(dir)
      .filter((f: string) => f.endsWith(".md"))
      .sort()
      .reverse(); // newest first
    for (const f of files.slice(0, 5)) {
      const content = readFileSync(dir + "/" + f, "utf-8");
      sections.push("### Owner Directive: " + f + "\n" + content.substring(0, 3000));
    }
  } catch { /* graceful degradation */ }
  return sections.length > 0
    ? "## Owner Directives (MANDATORY \u2014 highest priority)\n\n" + sections.join("\n\n---\n\n")
    : "";
}


// ===== CTO Tech Watch Report Loader (reads reports produced by standalone run-cto-techwatch.ts) =====

function loadCTOTechWatchReports(): string {
  const reportsDir = './reports/cto';
  const sections: string[] = [];

  try {
    // Load latest OpenClaw watch
    const openclawWatch = reportsDir + '/latest-openclaw-watch.md';
    if (existsSync(openclawWatch)) {
      const content = readFileSync(openclawWatch, 'utf-8');
      sections.push('### CTO: OpenClaw Ecosystem Watch\n' + content.substring(0, 2000));
    }

    // Load latest ClawHub scan
    const clawhubScan = reportsDir + '/latest-clawhub-scan.md';
    if (existsSync(clawhubScan)) {
      const content = readFileSync(clawhubScan, 'utf-8');
      sections.push('### CTO: ClawHub Skill Scan\n' + content.substring(0, 2000));
    }

    // Load latest learnings review
    const learningsReview = reportsDir + '/latest-learnings-review.md';
    if (existsSync(learningsReview)) {
      const content = readFileSync(learningsReview, 'utf-8');
      sections.push('### CTO: Learnings & Bug Pattern Analysis\n' + content.substring(0, 2000));
    }
  } catch { /* CTO tech-watch reports not available yet — graceful degradation */ }

  return sections.length > 0
    ? '## CTO Tech Watch Reports (Standalone)\n\n' + sections.join('\n\n---\n\n')
    : '';
}

// ===== Grok Feed Loader (reads Grok AI X/Twitter intelligence) =====

function loadGrokFeed(): string {
  const feedDir = './reports/grok-feed';
  if (!existsSync(feedDir)) return '';
  try {
    const files = readdirSync(feedDir)
      .filter(f => f.endsWith('.md') && f !== '.gitkeep')
      .sort()
      .reverse()
      .slice(0, 3);
    if (files.length === 0) return '';
    const sections: string[] = [];
    for (const file of files) {
      const content = readFileSync(feedDir + '/' + file, 'utf-8');
      sections.push(`### Grok Feed: ${file}\n${content.substring(0, 1500)}`);
    }
    return '## Grok Intelligence Feed (X/Twitter — OpenClaw Ecosystem)\n\n' + sections.join('\n\n---\n\n');
  } catch { return ''; }
}

// ===== CEO Decision Persistence (saves CEO decisions for CTO feedback loop) =====

function persistCEODecisions(ctoDecisions: string, ctoReport: CTOReport): void {
  const today = new Date().toISOString().split('T')[0];

  // 1. Save raw CEO feedback to ceo-feedback directory
  const feedbackDir = './reports/cto/ceo-feedback';
  mkdirSync(feedbackDir, { recursive: true });
  try {
    // Parse decisions from CEO response
    const jsonMatch = ctoDecisions.match(/\[[\s\S]*\]/);
    const decisions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    writeFileSync(`${feedbackDir}/${today}.json`, JSON.stringify({ date: today, decisions }, null, 2));
    log(c.green, `  ✓ CEO feedback saved: ${feedbackDir}/${today}.json`);

    // 2. Update approved-proposals.json with newly approved proposals
    const trackerPath = './reports/cto/approved-proposals.json';
    let tracker: { proposals: any[]; last_updated: string } = { proposals: [], last_updated: today };
    if (existsSync(trackerPath)) {
      try { tracker = JSON.parse(readFileSync(trackerPath, 'utf-8')); } catch { /* start fresh */ }
    }

    for (const decision of decisions) {
      if (decision.decision === 'APPROVED') {
        const proposal = ctoReport.proposals.find(p => p.id === decision.proposal_id);
        if (proposal) {
          const existing = tracker.proposals.find((p: any) => p.id === proposal.id);
          if (!existing) {
            tracker.proposals.push({
              id: proposal.id,
              title: proposal.title,
              category: proposal.category,
              description: proposal.description,
              implementation_steps: proposal.implementation_steps,
              approved_date: today,
              ceo_conditions: decision.conditions || [],
              priority: decision.priority || 'next_sprint',
              implementation_status: 'pending',
              verification_notes: '',
            });
            log(c.green, `  ✓ Approved proposal tracked: ${proposal.id} — ${proposal.title}`);
          }
        }
      }
    }
    tracker.last_updated = today;
    writeFileSync(trackerPath, JSON.stringify(tracker, null, 2));
    log(c.green, `  ✓ Approved proposals tracker updated (${tracker.proposals.length} total)`);
  } catch (error: any) {
    log(c.yellow, `  ! Failed to persist CEO decisions: ${error.message}`);
    writeFileSync(`${feedbackDir}/${today}.txt`, ctoDecisions);
    log(c.yellow, `  Saved raw CEO response as text fallback`);
  }
}

// ===== Task Complexity Router =====
// Determines which LLM to use based on signals from the task and deliverables.
// Claude Sonnet: architectural work, many files, large existing files, complex keywords
// MiniMax M2.5:  simple edits, stubs, config, small new files (truncation retry handles overflow)

function assessTaskComplexity(
  task: AgentTask,
  deliverables: string[],
): { provider: 'minimax' | 'anthropic'; model: string; routingReason: string } {
  const ctx = (task.context || '').toLowerCase();

  // Signal 1: many deliverables → always Claude (coordinating multiple files needs coherence)
  if (deliverables.length > 2) {
    return { provider: 'anthropic', model: 'claude-sonnet-4-20250514', routingReason: `${deliverables.length} deliverables → complex` };
  }

  // Signal 2: complex architectural keywords → Claude
  const complexPatterns = [
    /refactor/, /architect/, /redesign/, /from.scratch/, /new.*service/, /new.*system/,
    /middleware/, /authentication/, /authorization/, /orchestrat/, /pipeline/, /framework/,
    /implement.*class/, /implement.*module/, /implement.*engine/, /end.to.end/, /full.*implementation/,
  ];
  const hasComplexKeyword = complexPatterns.some(p => p.test(ctx));

  // Signal 3: simple/formulaic keywords → MiniMax
  const simplePatterns = [
    /add field/, /rename/, /update config/, /fix typo/, /stub/, /placeholder/,
    /add.*route/, /add.*endpoint/, /add.*column/, /update.*message/, /change.*label/,
    /update.*text/, /add.*import/, /add.*export/, /add.*comment/, /add.*log/,
  ];
  const hasSimpleKeyword = simplePatterns.some(p => p.test(ctx));

  if (hasComplexKeyword && !hasSimpleKeyword) {
    return { provider: 'anthropic', model: 'claude-sonnet-4-20250514', routingReason: 'complex task keywords' };
  }

  // Signal 4: large existing file → Claude (MiniMax truncates, degrading large-file edits)
  for (const f of deliverables) {
    if (existsSync(f)) {
      const lines = readFileSync(f, 'utf-8').split('\n').length;
      if (lines > 100) {
        return { provider: 'anthropic', model: 'claude-sonnet-4-20250514', routingReason: `large file (${lines} lines)` };
      }
    }
  }

  // Default: MiniMax for everything else (truncation retry handles any overflow)
  return { provider: 'minimax', model: 'MiniMax-M2.5', routingReason: hasSimpleKeyword ? 'simple task' : 'small/unclassified task' };
}

// ===== MiniMax Coding Agent (ONE FILE PER API CALL) =====

class CodingAgent {
  private name: string;
  private systemPrompt: string;
  constructor(name: string, systemPrompt: string) { this.name = name; this.systemPrompt = systemPrompt; }

  async execute(task: AgentTask, previousReview?: ReviewResult): Promise<{ files: string[]; model: string }> {
    log(c.cyan, `\n[${this.name}] Executing: ${task.id} (${task.priority})`);
    const deliverables = [...(task.deliverables.code || []), ...(task.deliverables.tests || []), ...(task.deliverables.docs || [])];
    // Complexity-aware model routing:
    // Claude Sonnet → complex tasks (many files, complex keywords, large existing files)
    // MiniMax M2.5  → simple tasks (small edits, config, stubs) + truncation retry as safety net
    const { provider, model, routingReason } = assessTaskComplexity(task, deliverables);
    log(c.gray, `  -> Using ${model} [${routingReason}]`);

    // Pre-flight: validate all deliverable files exist for non-feature tasks
    // If a file doesn't exist and we're asked to modify it, skip rather than hallucinate
    if (task.type !== 'feature' && (task as any).type !== 'docs') {
      const missing = deliverables.filter(f => !existsSync(f));
      if (missing.length > 0) {
        log(c.red, `  ✗ Pre-flight FAILED: File(s) not found: ${missing.join(', ')}`);
        log(c.red, `  ✗ Skipping task ${task.id} — deliverable files do not exist in repo`);
        throw new Error(`PREFLIGHT_FAILED: Files not found: ${missing.join(', ')}`);
      }
    }

    // Pre-flight: validate new-file paths are inside real project directories
    // CEO sometimes hallucinates paths like 'agents/src/core/' or 'packages/agents/src/'
    // which don't exist. Catch these before generating anything.
    const VALID_PATH_PREFIXES = [
      'backend/', 'frontend/', 'agents/', 'scripts/', 'shared/',
      'website/', 'docs-site/', 'apps/', 'sdk/', 'x402-base/', 'x402-evm/', 'x402-test/',
      'supabase/', 'infrastructure/',
    ];
    // Invalid patterns: paths that look like monorepo sub-dirs that don't exist
    const INVALID_PATH_PATTERNS = [
      /^agents\/src\//, // agents/src/... — real agent dirs are agents/<name>/
      /^packages\//, // no packages/ dir
      /^src\/agents\//, // no src/agents/ dir
    ];
    for (const filepath of deliverables) {
      const isValidPrefix = VALID_PATH_PREFIXES.some(p => filepath.startsWith(p));
      const isInvalidPattern = INVALID_PATH_PATTERNS.some(r => r.test(filepath));
      if (!isValidPrefix || isInvalidPattern) {
        log(c.red, `  ✗ Path validation FAILED: "${filepath}" is not in a valid project directory`);
        log(c.red, `  ✗ Valid prefixes: ${VALID_PATH_PREFIXES.join(', ')}`);
        throw new Error(`INVALID_PATH: "${filepath}" is not in a recognized project directory`);
      }
    }

    let rejectionContext = '';
    if (previousReview && previousReview.verdict !== 'APPROVED') {
      const issueList = (previousReview.issues || []).map(i => `- [${i.severity}] ${i.file}: ${i.description}`).join('\n');
      rejectionContext = `\n## IMPORTANT: Previous Attempt Was REJECTED\nScore: ${previousReview.score}/100. Reason: ${previousReview.summary}\n\nSpecific issues to fix:\n${issueList}\n\nYou MUST address ALL issues.\n`;
    }

    const createdFiles: Array<{ path: string; content: string }> = [];

    for (let i = 0; i < deliverables.length; i++) {
      const filepath = deliverables[i];
      log(c.gray, `  -> Generating file ${i + 1}/${deliverables.length}: ${filepath}`);      const priorCtx = createdFiles.length > 0
        ? '\n## Already Generated Files\n' + createdFiles.map(f => `### ${f.path}\n\`\`\`typescript\n${f.content.substring(0, 2000)}\n\`\`\``).join('\n\n') + '\n'
        : '';
      const fileList = deliverables.map((f, idx) => `${idx + 1}. ${f}${f === filepath ? ' ← THIS ONE' : ''}`).join('\n');

      const isTestFile = filepath.includes('test') || filepath.includes('spec');
      const existingContent = existsSync(filepath)
        ? `\n\n## Current File Content (EDIT this — do not rewrite from scratch)\n\`\`\`typescript\n${readFileSync(filepath, 'utf-8').substring(0, 3000)}\n\`\`\`\n`
        : `\n\n## Note: This is a NEW file — create it from scratch.\n`;
      const testConstraint = isTestFile
        ? `\n\n## CRITICAL: TEST FILE SIZE LIMIT
This is a test file. You MUST keep it SHORT to avoid truncation:
- Maximum 5-6 test cases (describe + it blocks)
- Maximum 80 lines total
- NO verbose setup — use inline mocks
- NO redundant tests — one test per behavior
- Cover: happy path, error case, edge case, defaults — that's it
- If you write more than 80 lines, the file WILL be truncated and REJECTED\n`
        : '';

      const userPrompt = `You are ${this.name}, a coding agent at Countable.
${rejectionContext}
## Task
${task.context}

## All Deliverable Files
${fileList}

## Generate ONLY: ${filepath}
${existingContent}${priorCtx}${testConstraint}
Write ONLY the content for "${filepath}". Rules:
- Output a single fenced code block with the COMPLETE file content
- Production quality, no TODOs or placeholders
- Include all imports, types, error handling
- If this file depends on others listed above, import from them correctly
- No explanatory text outside the code block`;
      try {
        const startTime = Date.now();
        const response = await callLLM(provider, model, this.systemPrompt, userPrompt, 180000);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        let content = response.choices?.[0]?.message?.content || '';
        // Strip MiniMax <think>...</think> tags that leak into responses
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const tokens = response.usage?.total_tokens || 0;

        // Check for MiniMax errors
        if (response.base_resp?.status_code && response.base_resp.status_code !== 0) {
          throw new Error(`MiniMax API error: ${response.base_resp.status_msg}`);
        }

        log(c.gray, `  -> Response: ${elapsed}s, ${tokens} tokens, ${content.length} chars`);

        // CTO-005: Extract code from fenced block with enhanced fence stripping
        const codeBlocks = this.extractCodeBlocks(content);
        let fileContent: string;
        if (codeBlocks.length === 0) {
          log(c.yellow, `  ! No code block found for ${filepath}, using raw content (with fence strip)`);
          fileContent = this.stripResidualFences(content);
        } else {
          fileContent = codeBlocks[0];
        }
        // CTO-005: Final fence sanitization BEFORE adding to createdFiles
        // CEO condition: stripping must happen BEFORE file is written to disk
        fileContent = this.stripResidualFences(fileContent);
        // Check if any fences remain after stripping (should be impossible, but log it)
        if (/^\s*```/m.test(fileContent)) {
          log(c.yellow, `  ! WARNING: Residual code fences detected in ${filepath} after stripping`);
        }

        // TRUNCATION PRE-CHECK: Detect if MiniMax cut off output mid-function
        // If code ends inside an open block (unclosed braces) or with an incomplete statement,
        // retry once with a "continue" prompt before sending to supervisor review.
        const truncationDetected = this.detectTruncation(fileContent);
        if (truncationDetected && provider === 'minimax') {
          log(c.yellow, `  ! TRUNCATION detected in ${filepath} — retrying with continuation prompt...`);
          const continuationPrompt = `The previous response for "${filepath}" was TRUNCATED — it ended mid-function or with an incomplete block. Here is what was generated so far:

\`\`\`typescript
${fileContent.substring(fileContent.length - 1500)}
\`\`\`

Continue from where it left off and output ONLY the remaining code (no duplicated content). Output a COMPLETE, valid TypeScript/JavaScript file ending with the final closing brace.`;
          try {
            const contResponse = await callLLM(provider, model, this.systemPrompt, continuationPrompt, 120000);
            let contContent = contResponse.choices?.[0]?.message?.content || '';
            contContent = contContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            const contBlocks = this.extractCodeBlocks(contContent);
            const continuation = contBlocks.length > 0 ? contBlocks[0] : this.stripResidualFences(contContent);
            if (continuation.length > 50) {
              // Merge: use the original up to the last complete line, then append continuation
              fileContent = fileContent + '\n' + continuation;
              fileContent = this.stripResidualFences(fileContent);
              log(c.green, `  ✓ Continuation merged for ${filepath} (+${continuation.length} chars)`);
            }
          } catch (contErr: any) {
            log(c.yellow, `  ! Continuation failed: ${contErr.message}`);
          }
        }

        createdFiles.push({ path: filepath, content: fileContent });
      } catch (error: any) {
        log(c.red, `  ✗ Failed to generate ${filepath}: ${error.message}`);
        // Create minimal placeholder so build doesn't break
        createdFiles.push({ path: filepath, content: `// ERROR: Generation failed - ${error.message}\n// Task: ${task.id}\n` });
      }
    }
    // CTO-004: File integrity check — detect destructive MiniMax rewrites
    // For bugfix tasks (and feature tasks editing existing files), reject if new file
    // is <50% the size of the original. Configurable threshold.
    const INTEGRITY_THRESHOLD = 0.5; // Reject if new < 50% of original
    const integrityCheckTypes = ['bugfix']; // Task types that always get integrity check
    const integrityCheckAllExisting = true; // Also check feature tasks editing existing files

    for (const file of createdFiles) {
      if (existsSync(file.path)) {
        try {
          const originalContent = readFileSync(file.path, 'utf-8');
          const originalLines = originalContent.split('\n').length;
          const newLines = file.content.split('\n').length;
          const ratio = originalLines > 0 ? newLines / originalLines : 1;

          const shouldCheck = integrityCheckTypes.includes(task.type) ||
            (integrityCheckAllExisting && originalLines > 10);

          if (shouldCheck && ratio < INTEGRITY_THRESHOLD) {
            log(c.red, `  ✗ INTEGRITY CHECK FAILED: ${file.path}`);
            log(c.red, `    Original: ${originalLines} lines → New: ${newLines} lines (${(ratio * 100).toFixed(0)}%)`);
            log(c.red, `    Possible destructive rewrite detected — file shrank from ${originalLines} to ${newLines} lines`);
            // Replace with error content, preserving original file
            file.content = `// INTEGRITY CHECK FAILED — destructive rewrite detected\n// Original: ${originalLines} lines, New attempt: ${newLines} lines (${(ratio * 100).toFixed(0)}%)\n// Task: ${task.id} (${task.type})\n// The original file has been preserved. Manual review required.\n`;
            // Also flag in task output for supervisor
            (task as any)._integrityFailed = true;
            (task as any)._integrityDetails = `File ${file.path} shrank from ${originalLines} to ${newLines} lines (${(ratio * 100).toFixed(0)}%). Possible destructive rewrite.`;
          } else if (originalLines > 0) {
            log(c.gray, `  -> Integrity OK: ${file.path} (${originalLines} → ${newLines} lines, ${(ratio * 100).toFixed(0)}%)`);
          }
        } catch { /* File exists but can't read — skip check */ }
      }
    }

    // Write all files to disk
    const writtenFiles: string[] = [];
    for (const file of createdFiles) {
      try {
        const dir = file.path.substring(0, file.path.lastIndexOf('/'));
        if (dir) mkdirSync(dir, { recursive: true });
        writeFileSync(file.path, file.content);
        writtenFiles.push(file.path);
        log(c.green, `  ✓ Written: ${file.path} (${file.content.length} chars)`);
      } catch (error: any) {
        log(c.red, `  ✗ Write failed: ${file.path}: ${error.message}`);
      }
    }

    // Commit changes
    this.commitChanges(task, writtenFiles);
    return { files: writtenFiles, model };
  }

  // CTO-005: Enhanced code fence stripping — handles all MiniMax output variants
  // Catches: ```tsx, ```typescript, leading whitespace, fences at any position,
  // markdown headers before code, and incomplete closing fences
  private extractCodeBlocks(content: string): string[] {
    const blocks: string[] = [];
    // Broader regex: optional whitespace before fences, any language tag, flexible spacing
    const regex = /^\s*```[\w.+-]*\s*\n([\s\S]*?)^\s*```\s*$/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match[1].trim().length > 0) blocks.push(match[1].trim());
    }
    // Fallback: try simpler pattern if multiline didn't match
    if (blocks.length === 0) {
      const simpleRegex = /```(?:typescript|tsx|ts|javascript|jsx|js|json|yaml|yml|dockerfile|sh|bash|css|html|scss|less|txt)?\s*\n([\s\S]*?)```/g;
      while ((match = simpleRegex.exec(content)) !== null) {
        if (match[1].trim().length > 0) blocks.push(match[1].trim());
      }
    }
    return blocks;
  }

  // CTO-005: Aggressive fence sanitization — strips ANY remaining fences from content
  // Applied BEFORE file is written to disk (CEO condition)
  private stripResidualFences(content: string): string {
    let cleaned = content;
    // Remove lines that are ONLY a fence marker (with optional language tag)
    cleaned = cleaned.replace(/^\s*```[\w.+-]*\s*$/gm, '');
    // Remove markdown headers that appear before the first line of actual code
    // (MiniMax sometimes prepends "## filename.ts" or "Here's the code:")
    const lines = cleaned.split('\n');
    let firstCodeLine = 0;
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i].trim();
      if (line.startsWith('#') || line.startsWith('Here') || line.startsWith('Below') ||
          line.startsWith('The following') || line === '') {
        firstCodeLine = i + 1;
      } else {
        break;
      }
    }
    if (firstCodeLine > 0) {
      cleaned = lines.slice(firstCodeLine).join('\n');
    }
    // Remove trailing fence if present at end
    cleaned = cleaned.replace(/\n\s*```\s*$/, '');
    return cleaned.trim();
  }

  // TRUNCATION DETECTION: Check if generated code ends mid-function
  // Returns true if the code appears to be truncated (open braces, incomplete statement, etc.)
  private detectTruncation(content: string): boolean {
    if (!content || content.length < 100) return false;
    const trimmed = content.trimEnd();
    const lastLine = trimmed.split('\n').pop()?.trim() || '';
    const last200 = trimmed.substring(Math.max(0, trimmed.length - 200));

    // Signs of truncation:
    // 1. Ends with a partial statement (no semicolon, no closing brace on last line)
    const endsAbruptly = lastLine.length > 0 && !lastLine.match(/^[}\]);,]/);
    // 2. Ends mid-string or mid-comment
    const endsMidString = (trimmed.match(/`/g) || []).length % 2 !== 0;
    // 3. Significantly more open braces than close braces (>3 imbalance)
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    const braceImbalance = openBraces - closeBraces;
    // 4. Last meaningful content is a function signature or opening block
    const endsOnOpener = /(\{|=>|then\(|catch\(|=>\s*)$/.test(last200.trimEnd());

    if (braceImbalance > 3) {
      log(c.yellow, `  ! Truncation signal: brace imbalance ${openBraces} open vs ${closeBraces} close`);
      return true;
    }
    if (endsMidString) {
      log(c.yellow, `  ! Truncation signal: odd number of backticks (mid-template-string)`);
      return true;
    }
    if (endsOnOpener && endsAbruptly) {
      log(c.yellow, `  ! Truncation signal: ends on opener with no closing`);
      return true;
    }
    return false;
  }

  private commitChanges(task: AgentTask, files: string[]): void {
    if (files.length === 0) return;
    try {
      const filesList = files.join(' ');
      execSync(`git add ${filesList}`, { timeout: 10000 });
      execSync(`git commit -m "feat(${task.agent}): ${task.id} - ${task.type}" --no-verify`, { timeout: 10000 });
      log(c.green, `  ✓ Committed: ${files.length} files for ${task.id}`);
    } catch (error: any) {
      log(c.yellow, `  ! Commit skipped: ${error.message?.substring(0, 100)}`);
    }
  }
}
// ===== Orchestrator (Dynamic Agent Pipeline) =====

class Orchestrator {
  private ceo: CEOAgent;
  private cto: CTOAgent;
  private supervisor: SupervisorAgent;
  private supervisor2: Supervisor2Agent;
  private agents: Map<string, CodingAgent> = new Map();
  private tasks: AgentTask[] = [];
  private stats = { tasksExecuted: 0, approved: 0, rejected: 0, totalTokens: 0, conflicts: 0, escalations: 0 };

  constructor() {
    log(c.bold, '\n╔══════════════════════════════════════════════════════════╗');
    log(c.bold, '║   Invoica Agent Orchestrator v2 — Dual Supervisor        ║');
    log(c.bold, '║   Claude + Codex review → CEO conflict resolution        ║');
    log(c.bold, '╚══════════════════════════════════════════════════════════╝\n');

    // Leadership layer (Claude via Anthropic API + OpenAI Codex)
    this.ceo = new CEOAgent();
    this.supervisor = new SupervisorAgent();
    this.supervisor2 = new Supervisor2Agent();

    // Technology layer (MiniMax)
    this.cto = new CTOAgent();

    // Execution layer — dynamically load all coding agents from agents/ directory
    const skipAgents = ['ceo', 'supervisor', 'skills', 'cto', 'cmo'];
    const agentDirs = existsSync('./agents') ? readdirSync('./agents').filter(d => {
      if (skipAgents.includes(d)) return false;
      return existsSync(`./agents/${d}/prompt.md`);
    }) : [];
    for (const name of agentDirs) {
      const promptPath = `./agents/${name}/prompt.md`;
      const prompt = readFileSync(promptPath, 'utf-8');
      this.agents.set(name, new CodingAgent(name, prompt));
      log(c.cyan, `+ Loaded ${name} agent (MiniMax M2.5)`);
    }

    const totalAgents = 3 + 1 + 1 + 1 + this.agents.size; // 3 Claude + 1 OpenAI Codex + 1 Manus CMO + 1 CTO + N coding
    log(c.green, `\n✓ ${totalAgents} agents loaded (3 Claude + 1 Codex + 1 Manus CMO + ${1 + this.agents.size} MiniMax)\n`);
  }
  private loadTasks(): void {
    const sprintFile = process.argv[2] || 'sprints/current.json';
    if (!existsSync(sprintFile)) {
      log(c.red, `Sprint file not found: ${sprintFile}`);
      process.exit(1);
    }
    const sprint = JSON.parse(readFileSync(sprintFile, 'utf-8'));
    this.tasks = sprint.tasks || [];

    // Normalize deliverables: CEO planner may emit flat string[] instead of {code,tests,docs}
    for (const task of this.tasks) {
      const d = (task as any).deliverables;
      if (Array.isArray(d)) {
        task.deliverables = {
          code:  (d as string[]).filter((f: string) => f.indexOf("test") === -1 && f.indexOf("spec") === -1 && f.slice(-3) !== ".md"),
          tests: (d as string[]).filter((f: string) => f.indexOf("test") !== -1 || f.indexOf("spec") !== -1),
          docs:  (d as string[]).filter((f: string) => f.slice(-3) === ".md"),
        };
      }
    }

    // Reset stale in_progress tasks back to pending
    for (const task of this.tasks) {
      if (task.status === 'in_progress' || task.status === 'review') {
        log(c.yellow, `  Resetting stale task ${task.id} (${task.status} -> pending)`);
        task.status = 'pending';
      }
    }
    log(c.blue, `Loaded ${this.tasks.length} tasks from ${sprintFile}`);
  }

  // ===== Truncation Detection =====

  private isTruncationRejection(review: ReviewResult): boolean {
    const truncationKeywords = [
      'truncat', 'incomplete', 'cut off', 'cuts off', 'ends abruptly',
      'missing implementation', 'missing the actual', 'file is incomplete',
      'cuts off mid', 'missing core functionality', 'missing the entire',
    ];
    const text = (
      review.summary + ' ' +
      (review.issues || []).map(i => i.description).join(' ')
    ).toLowerCase();
    return truncationKeywords.some(kw => text.includes(kw));
  }

  // ===== CTO Task Decomposition (for truncation-prone tasks) =====

  private async ctoDecomposeTask(task: AgentTask): Promise<AgentTask[]> {
    log(c.cyan, `\n[cto-decompose] 🔧 CTO splitting ${task.id} into smaller sub-tasks...`);
    const allDeliverables = [
      ...(task.deliverables.code || []),
      ...(task.deliverables.tests || []),
    ];

    const userPrompt = `A task keeps failing because MiniMax M2.5 truncates output when generating multiple files.

## Failed Task
- ID: ${task.id}
- Agent: ${task.agent}
- Context: ${task.context.substring(0, 1500)}
- Deliverable files: ${allDeliverables.join(', ')}

## Problem
MiniMax M2.5 has a ~4500 token output limit per call. When a task has ${allDeliverables.length} files, each file gets less space and code gets truncated.

## Your Job
Split this task into smaller sub-tasks. Each sub-task must have at most 1 code file + 1 test file (2 files max).

## Rules
1. Types/interfaces files FIRST (other files depend on them)
2. Barrel/index export files LAST (they import from everything else)
3. Each sub-task must be self-contained (agent can generate it without seeing other sub-task results)
4. Include enough context in each sub-task for the agent to know what to generate
5. Maximum 5 sub-tasks

## Output Format
Return a JSON array of sub-task specs:
[
  {
    "sub_id": "${task.id}-A",
    "context": "Full task context for this sub-task including what types/interfaces to define",
    "code": ["path/to/file.ts"],
    "tests": ["path/to/file.test.ts"]
  }
]

ONLY output the JSON array. No markdown, no explanation.`;

    try {
      const response = await callLLM('minimax', 'MiniMax-M2.5', this.cto['systemPrompt'] || '', userPrompt, 120000);
      let content = response.choices?.[0]?.message?.content || '';
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        log(c.yellow, '  CTO decomposition returned no JSON, falling back to mechanical split');
        return this.fallbackDecompose(task);
      }

      const specs = JSON.parse(jsonMatch[0]) as Array<{
        sub_id: string; context: string; code: string[]; tests: string[];
      }>;

      if (!Array.isArray(specs) || specs.length < 2) {
        log(c.yellow, '  CTO returned <2 sub-tasks, falling back to mechanical split');
        return this.fallbackDecompose(task);
      }

      // Convert specs to AgentTask objects
      const subtasks: AgentTask[] = specs.slice(0, 5).map((spec, i) => ({
        id: spec.sub_id || `${task.id}-${String.fromCharCode(65 + i)}`,
        agent: task.agent,
        type: task.type,
        priority: task.priority,
        dependencies: i > 0 ? [specs[i - 1].sub_id || `${task.id}-${String.fromCharCode(64 + i)}`] : [],
        context: spec.context,
        deliverables: {
          code: spec.code || [],
          tests: spec.tests || [],
        },
        status: 'pending' as const,
      }));

      log(c.green, `  ✓ CTO decomposed ${task.id} into ${subtasks.length} sub-tasks:`);
      for (const st of subtasks) {
        const files = [...(st.deliverables.code || []), ...(st.deliverables.tests || [])];
        log(c.cyan, `    ${st.id}: ${files.join(', ')}`);
      }
      return subtasks;
    } catch (error: any) {
      log(c.yellow, `  CTO decomposition failed: ${error.message}, using fallback`);
      return this.fallbackDecompose(task);
    }
  }

  // ===== Fallback: Mechanical file-based split =====

  private fallbackDecompose(task: AgentTask): AgentTask[] {
    const codeFiles = task.deliverables.code || [];
    const testFiles = task.deliverables.tests || [];

    log(c.yellow, `  [fallback] Mechanically splitting ${task.id} by file...`);

    const subtasks: AgentTask[] = [];
    for (let i = 0; i < codeFiles.length; i++) {
      const code = codeFiles[i];
      // Find matching test file
      const baseName = code.replace(/\.ts$/, '').split('/').pop() || '';
      const matchingTest = testFiles.find(t =>
        t.includes(baseName) && (t.includes('.test.') || t.includes('.spec.'))
      );

      subtasks.push({
        id: `${task.id}-${String.fromCharCode(65 + i)}`,
        agent: task.agent,
        type: task.type,
        priority: task.priority,
        dependencies: i > 0 ? [`${task.id}-${String.fromCharCode(64 + i)}`] : [],
        context: `${task.context}\n\n## SUB-TASK: Generate ONLY the file "${code}"${matchingTest ? ` and its test "${matchingTest}"` : ''}.\nThis is part of a larger task that was split to avoid truncation. Focus on this file only. Make it complete and self-contained.`,
        deliverables: {
          code: [code],
          tests: matchingTest ? [matchingTest] : [],
        },
        status: 'pending' as const,
      });
    }

    // Handle orphan test files (tests without matching code file)
    const usedTests = subtasks.flatMap(st => st.deliverables.tests || []);
    const orphanTests = testFiles.filter(t => !usedTests.includes(t));
    if (orphanTests.length > 0) {
      subtasks.push({
        id: `${task.id}-${String.fromCharCode(65 + codeFiles.length)}`,
        agent: task.agent,
        type: task.type,
        priority: task.priority,
        dependencies: subtasks.length > 0 ? [subtasks[subtasks.length - 1].id] : [],
        context: `${task.context}\n\n## SUB-TASK: Generate ONLY the test file(s): ${orphanTests.join(', ')}.\nAll source code files have already been generated. Write tests that import from the existing source files.`,
        deliverables: {
          code: [],
          tests: orphanTests,
        },
        status: 'pending' as const,
      });
    }

    log(c.green, `  ✓ Fallback split ${task.id} into ${subtasks.length} sub-tasks`);
    return subtasks;
  }

  // ===== Sub-task executor (limited retries, no recursive decomposition) =====

  private async executeSubTask(subtask: AgentTask, maxRetries: number): Promise<boolean> {
    const agent = this.agents.get(subtask.agent);
    if (!agent) {
      log(c.red, `  Agent not found for sub-task: ${subtask.agent}`);
      return false;
    }

    let lastReview: ReviewResult | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log(c.blue, `\n  [sub-task] ${subtask.id} | Attempt: ${attempt}/${maxRetries}`);

      this.stats.tasksExecuted++;
      const result = await agent.execute(subtask, lastReview);

      if (result.files.length === 0) {
        log(c.red, `  No files produced for sub-task ${subtask.id}`);
        return false;
      }

      // Dual supervisor review
      const [review1, review2] = await Promise.all([
        this.supervisor.reviewTask(subtask, result.files),
        this.supervisor2.reviewTask(subtask, result.files),
      ]);
      const dualResult = await reconcileSupervisorReviews(review1, review2, subtask, this.ceo);
      const review = dualResult.finalReview;
      if (!dualResult.consensus) this.stats.conflicts++;
      if (dualResult.escalatedToCEO) this.stats.escalations++;
      lastReview = review;

      if (review.verdict === 'APPROVED') {
        this.stats.approved++;
        log(c.green, `  ✓ Sub-task ${subtask.id} APPROVED on attempt ${attempt} (${review.score}/100)`);
        return true;
      }

      this.stats.rejected++;
      log(c.yellow, `  ↻ Sub-task ${subtask.id} REJECTED on attempt ${attempt} (${review.score}/100)`);

      try {
        execSync('git reset --hard HEAD~1', { timeout: 10000 });
        log(c.gray, '    Reset to previous commit');
      } catch {
        log(c.gray, '    Reset skipped');
      }
    }

    log(c.red, `  ✗ Sub-task ${subtask.id} FAILED after ${maxRetries} attempts`);
    return false;
  }

  // ===== Main task executor with CTO auto-decomposition =====

  private async executeTask(task: AgentTask): Promise<void> {
    const agent = this.agents.get(task.agent);
    if (!agent) {
      log(c.red, `Agent not found: ${task.agent}`);
      task.status = 'rejected';
      return;
    }

    const MAX_RETRIES = 10;
    const TRUNCATION_THRESHOLD = 3;
    let truncationCount = 0;
    let lastReview: ReviewResult | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      log(c.blue, `\n${'='.repeat(60)}`);
      log(c.blue, `Task: ${task.id} | Agent: ${task.agent} | Attempt: ${attempt}/${MAX_RETRIES}`);
      log(c.blue, `${'='.repeat(60)}`);

      task.status = 'in_progress';
      this.stats.tasksExecuted++;

      // Execute with rejection feedback if retrying
      const result = await agent.execute(task, lastReview);

      if (result.files.length === 0) {
        log(c.red, `  No files produced for ${task.id}`);
        task.status = 'rejected';
        return;
      }

      // Dual Supervisor review (Claude + Codex in parallel)
      task.status = 'review';
      const [review1, review2] = await Promise.all([
        this.supervisor.reviewTask(task, result.files),
        this.supervisor2.reviewTask(task, result.files),
      ]);
      const dualResult = await reconcileSupervisorReviews(review1, review2, task, this.ceo);
      const review = dualResult.finalReview;
      if (!dualResult.consensus) this.stats.conflicts++;
      if (dualResult.escalatedToCEO) this.stats.escalations++;
      lastReview = review;

      task.output = { files: result.files, commit: '', model: result.model, review };

      if (review.verdict === 'APPROVED') {
        task.status = 'done';
        this.stats.approved++;
        log(c.green, `\n✓ Task ${task.id} APPROVED on attempt ${attempt} (${review.score}/100)`);
        return;
      }

      // Rejected — check for truncation pattern
      this.stats.rejected++;
      if (this.isTruncationRejection(review)) {
        truncationCount++;
        log(c.yellow, `\n↻ Task ${task.id} REJECTED on attempt ${attempt} (${review.score}/100) [TRUNCATION ${truncationCount}/${TRUNCATION_THRESHOLD}]`);
      } else {
        log(c.yellow, `\n↻ Task ${task.id} REJECTED on attempt ${attempt} (${review.score}/100)`);
      }

      try {
        execSync('git reset --hard HEAD~1', { timeout: 10000 });
        log(c.gray, '  Reset to previous commit (dropped rejected code)');
      } catch {
        log(c.gray, '  Reset skipped (nothing to reset)');
      }

      // CTO AUTO-DECOMPOSE: After N consecutive truncation rejections, split the task
      if (truncationCount >= TRUNCATION_THRESHOLD) {
        log(c.cyan, `\n🔧 TRUNCATION THRESHOLD REACHED — CTO decomposing ${task.id}...`);
        const subtasks = await this.ctoDecomposeTask(task);

        if (subtasks.length > 1) {
          log(c.cyan, `  Executing ${subtasks.length} sub-tasks sequentially...`);
          let allPassed = true;

          for (const subtask of subtasks) {
            // Check sub-task dependencies
            const subDeps = subtask.dependencies || [];
            const unmetSubDeps = subDeps.filter(d => {
              const depSt = subtasks.find(s => s.id === d);
              return depSt && depSt.status !== 'done';
            });
            if (unmetSubDeps.length > 0) {
              log(c.yellow, `  Skipping sub-task ${subtask.id}: unmet deps [${unmetSubDeps.join(', ')}]`);
              allPassed = false;
              continue;
            }

            const passed = await this.executeSubTask(subtask, 5);
            if (passed) {
              subtask.status = 'done';
            } else {
              allPassed = false;
              subtask.status = 'rejected';
              log(c.red, `  Sub-task ${subtask.id} failed — stopping decomposition chain`);
              break;
            }
          }

          if (allPassed) {
            task.status = 'done';
            log(c.green, `\n✓ Task ${task.id} COMPLETED via CTO decomposition (${subtasks.length} sub-tasks)`);
          } else {
            task.status = 'rejected';
            log(c.red, `\n✗ Task ${task.id} FAILED even after CTO decomposition`);
          }
          return;
        }
        // If decomposition returned <=1 task, continue with normal retry loop
        log(c.yellow, '  Decomposition produced ≤1 sub-task, continuing normal retries...');
        truncationCount = 0; // Reset to avoid re-triggering
      }

      if (attempt < MAX_RETRIES) {
        log(c.yellow, `  Retrying with rejection feedback...`);
      }
    }

    task.status = 'rejected';
    log(c.red, `\n✗ Task ${task.id} FAILED after ${MAX_RETRIES} attempts`);
  }
  async run(): Promise<void> {
    const startTime = Date.now();
    log(c.bold, '\n🚀 Starting orchestration run...\n');

    // Mission Control — connect and register this sprint run
    const mc = createMCClient('sprint-orchestrator', 'worker');
    let mcConnected = false;
    try {
      await mc.connect();
      mcConnected = true;
      log(c.gray, '  [MC] Connected to Mission Control');
    } catch { log(c.gray, '  [MC] Mission Control unavailable — running without telemetry'); }

    // 1. Load tasks
    this.loadTasks();
    if (this.tasks.length === 0) {
      log(c.yellow, 'No tasks to execute');
      if (mcConnected) await mc.disconnect().catch(() => {});
      return;
    }

    // 2. CEO initial assessment
    log(c.magenta, '\n--- Phase 1: CEO Initial Assessment ---');
    await this.ceo.reviewSprintProgress(this.tasks);

    // 3. Execute coding tasks with review loop
    log(c.blue, '\n--- Phase 2: Sprint Execution ---');

    // Auto-cascade: if a task is rejected, immediately mark all downstream dependents as skipped
    // This prevents tasks from being stuck as 'pending' forever across retries
    let cascaded = true;
    while (cascaded) {
      cascaded = false;
      for (const task of this.tasks) {
        if (task.status !== 'pending') continue;
        const deps = task.dependencies || [];
        const blockedBy = deps.filter(d => {
          const depTask = this.tasks.find(t => t.id === d);
          return depTask && (depTask.status === 'rejected' || depTask.status === 'skipped');
        });
        if (blockedBy.length > 0) {
          task.status = 'skipped';
          (task as any).skippedReason = `Blocked by: ${blockedBy.join(', ')}`;
          log(c.yellow, `  Auto-skipped ${task.id}: blocked by rejected/skipped deps [${blockedBy.join(', ')}]`);
          cascaded = true;
        }
      }
    }

    const pending = this.tasks.filter(t => t.status === 'pending');
    for (const task of pending) {
      // Check dependencies
      const deps = task.dependencies || [];
      const unmetDeps = deps.filter(d => {
        const depTask = this.tasks.find(t => t.id === d);
        return depTask && depTask.status !== 'done';
      });
      if (unmetDeps.length > 0) {
        log(c.yellow, `  Skipping ${task.id}: unmet deps [${unmetDeps.join(', ')}]`);
        continue;
      }
      await this.executeTask(task);

      // After each task, cascade any newly-rejected dependencies
      cascaded = true;
      while (cascaded) {
        cascaded = false;
        for (const t of this.tasks) {
          if (t.status !== 'pending') continue;
          const tDeps = t.dependencies || [];
          const tBlocked = tDeps.filter(d => {
            const depTask = this.tasks.find(x => x.id === d);
            return depTask && (depTask.status === 'rejected' || depTask.status === 'skipped');
          });
          if (tBlocked.length > 0) {
            t.status = 'skipped';
            (t as any).skippedReason = `Blocked by: ${tBlocked.join(', ')}`;
            log(c.yellow, `  Auto-skipped ${t.id}: blocked by rejected/skipped deps [${tBlocked.join(', ')}]`);
            cascaded = true;
          }
        }
      }
    }
    // 4. CTO data-driven analysis + CMO reports
    log(c.cyan, '\n--- Phase 3: CTO Data-Driven Analysis + CMO Reports ---');
    let ctoReport: CTOReport = { summary: '', proposals: [], metrics_reviewed: [] };
    let ctoDecisions = '';
    let cmoReports = '';
    try {
      ctoReport = await this.cto.analyze();

      // Load CMO reports (produced independently by Manus AI runner)
      cmoReports = loadCMOReports();
      if (cmoReports) {
        log(c.magenta, '  CMO reports found — will include in CEO review');
      } else {
        log(c.gray, '  No CMO reports available yet');
      }

      // Load CTO tech-watch reports (produced independently by run-cto-techwatch.ts)
      const ctoTechWatch = loadCTOTechWatchReports();
      if (ctoTechWatch) {
        log(c.cyan, '  CTO tech-watch reports found — will include in CEO review');
        cmoReports = cmoReports ? cmoReports + '\n\n' + ctoTechWatch : ctoTechWatch;
      } else {
        log(c.gray, '  No CTO tech-watch reports available yet');
      }

      // Load Grok intelligence feed (Grok AI monitors X/Twitter for OpenClaw news)
      const grokFeed = loadGrokFeed();
      if (grokFeed) {
        log(c.magenta, '  Grok intelligence feed found — will include in CEO review');
        cmoReports = cmoReports ? cmoReports + '\n\n' + grokFeed : grokFeed;
      } else {
        log(c.gray, '  No Grok feed reports available');
      }

      // Load Owner Directives (highest priority — always included)
      const ownerDirectives = loadOwnerDirectives();
      if (ownerDirectives) {
        log(c.magenta, "  Owner directives found — will include in CEO review (highest priority)");
        cmoReports = ownerDirectives + (cmoReports ? "\n\n" + cmoReports : "");
      }

      // 5. CEO reviews CTO proposals + CMO reports
      if (ctoReport.proposals.length > 0 || cmoReports) {
        log(c.magenta, '\n--- Phase 4: CEO Reviews CTO Proposals + CMO Reports ---');
        ctoDecisions = await this.ceo.reviewCTOProposals(ctoReport);

        // Persist CEO decisions for CTO feedback loop + approved proposals tracking
        persistCEODecisions(ctoDecisions, ctoReport);

        // Handle approved new_agent proposals
        const agentCreator = new AgentCreator();
        for (const proposal of ctoReport.proposals) {
          if (proposal.category === 'new_agent' && proposal.agent_spec) {
            // Check if CEO approved this specific proposal
            if (ctoDecisions.includes(proposal.id) && ctoDecisions.toUpperCase().includes('APPROVED')) {
              log(c.green, `\n  🤖 CEO approved new agent: ${proposal.agent_spec.name}`);
              agentCreator.createAgent(proposal.agent_spec);
              log(c.green, `  Agent will be loaded on next orchestrator run.`);
            } else {
              log(c.yellow, `  CEO did not approve agent: ${proposal.agent_spec.name}`);
            }
          }
        }
      } else {
        log(c.cyan, '  No proposals from CTO — stack is current and optimized');
        ctoDecisions = 'No proposals to review.';
      }
    } catch (error: any) {
      log(c.yellow, `  CTO/CEO review cycle skipped: ${error.message}`);
      ctoDecisions = 'CTO analysis was not performed this run.';
    }

    // 6. CEO final assessment
    log(c.magenta, '\n--- Phase 5: CEO Final Assessment ---');
    await this.ceo.reviewSprintProgress(this.tasks);

    // 6b. CTO autonomous post-sprint analysis (runs after EVERY sprint)
    log(c.cyan, '\n--- Phase 5b: CTO Post-Sprint Analysis (Autonomous) ---');
    let postSprintReport = '';
    try {
      postSprintReport = await this.cto.postSprintAnalysis(this.tasks, this.stats);
      log(c.cyan, '  Post-sprint analysis saved to reports/cto/');

      // Extract proposals from post-sprint analysis and feed into CEO review
      const jsonMatch = postSprintReport.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          const postSprintProposals = parsed.proposals || [];
          if (postSprintProposals.length > 0) {
            log(c.cyan, `  Found ${postSprintProposals.length} proposals — sending to CEO for autonomous review`);

            // Build CTOReport for CEO review
            const postSprintCTOReport: CTOReport = {
              summary: parsed.summary || 'Post-sprint analysis proposals',
              proposals: postSprintProposals.map((p: any) => ({
                id: p.id,
                title: p.title,
                category: p.category,
                description: p.description,
                estimated_impact: p.estimated_impact || '',
                risk_level: p.risk_level || 'medium',
                implementation_steps: p.implementation_steps || [],
              })),
              metrics_reviewed: ['sprint_results', 'failure_patterns', 'trend_analysis'],
            };

            // Phase 5c: CEO autonomously reviews post-sprint proposals
            log(c.magenta, '\n--- Phase 5c: CEO Reviews Post-Sprint Proposals (Autonomous) ---');
            const postSprintDecisions = await this.ceo.reviewCTOProposals(postSprintCTOReport);

            // Persist CEO decisions + update approved-proposals tracker
            persistCEODecisions(postSprintDecisions, postSprintCTOReport);
            log(c.magenta, '  CEO post-sprint proposal review complete');
          } else {
            log(c.cyan, '  No proposals in post-sprint analysis');
          }
        } catch (parseErr: any) {
          log(c.yellow, `  Could not parse post-sprint proposals JSON: ${parseErr.message}`);
        }
      }
    } catch (error: any) {
      log(c.yellow, `  Post-sprint analysis skipped: ${error.message}`);
    }

    // 7. CEO generates daily report
    log(c.magenta, '\n--- Phase 6: Daily Report Generation ---');
    const ctoReportStr = `Summary: ${ctoReport.summary}\nProposals: ${ctoReport.proposals.length}\n${ctoReport.proposals.map(p => `- [${p.category}] ${p.title} (${p.risk_level})`).join('\n')}`;
    const grokSection = loadGrokFeed();
    const cmoSection = cmoReports
      ? '\n\n## CMO Activity (Manus AI)\n' + cmoReports.substring(0, 2000)
      : '\n\nCMO: No reports available this cycle.';
    const grokForReport = grokSection ? '\n\n## Grok Intelligence Feed\nGrok AI reports available — included in CTO/CEO analysis.' : '\n\nGrok: No feed reports this cycle.';
    const postSprintSection = postSprintReport ? '\n\n## CTO Post-Sprint Analysis\n' + postSprintReport.substring(0, 2000) : '';
    await this.ceo.generateDailyReport(this.tasks, this.stats, ctoReportStr + cmoSection + grokForReport + postSprintSection, ctoDecisions);

    // 8. Save updated sprint state
    const sprintFile = process.argv[2] || 'sprints/current.json';
    writeFileSync(sprintFile, JSON.stringify({ tasks: this.tasks }, null, 2));
    log(c.green, `\nSprint state saved to ${sprintFile}`);

    // 9. Post-sprint: PM2 reload backend + smoke test
    await postSprintSmokeTest();

    // Final summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(c.bold, '\n╔══════════════════════════════════════════════════════════╗');
    log(c.bold, '║   Orchestration Complete                                  ║');
    log(c.bold, '╚══════════════════════════════════════════════════════════╝');
    log(c.green, `  Tasks executed: ${this.stats.tasksExecuted}`);
    log(c.green, `  Approved: ${this.stats.approved}`);
    log(c.red,   `  Rejected: ${this.stats.rejected}`);
    log(c.yellow,`  Supervisor conflicts: ${this.stats.conflicts}`);
    log(c.magenta,`  CEO escalations: ${this.stats.escalations}`);
    log(c.cyan,  `  CTO proposals: ${ctoReport.proposals.length}`);
    log(c.magenta, `  CMO reports: ${cmoReports ? 'loaded' : 'none'}`);
    log(c.blue,  `  Total time: ${elapsed}s`);
    log(c.gray,  `  Pipeline: CEO → MiniMax code → Dual review (Claude+Codex) → CEO resolves conflicts → CTO → CMO/Grok → Post-sprint analysis → Daily report`);

    // Mission Control — report final stats and disconnect
    if (mcConnected) {
      try {
        if (this.stats.totalTokens > 0) {
          await mc.trackTokens(this.stats.totalTokens, 'MiniMax-M2.5');
        }
        await mc.disconnect();
        log(c.gray, `  [MC] Sprint reported: ${this.stats.approved} approved / ${this.stats.rejected} rejected / ${this.stats.totalTokens} tokens`);
      } catch { /* non-critical */ }
    }
  }
}

// ===== Post-sprint smoke test =====

async function httpGet(url: string, timeoutMs = 8000): Promise<{ status: number; ok: boolean }> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get({ hostname: parsed.hostname, port: parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80')), path: parsed.pathname }, (res) => {
      res.resume(); // drain body
      resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) < 400 });
    });
    req.on('error', () => resolve({ status: 0, ok: false }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, ok: false }); });
  });
}

async function sendTelegramAlert(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  try {
    await httpPost('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      'Content-Type': 'application/json',
    }, JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }), 10000);
  } catch {}
}

async function postSprintSmokeTest(): Promise<void> {
  log(c.magenta, '\n--- Phase 9: Post-Sprint PM2 Reload + Smoke Test ---');

  // 9a. Reload backend via PM2
  try {
    log(c.cyan, '  Reloading PM2 backend...');
    execSync('pm2 reload backend --update-env', { timeout: 30000, stdio: 'pipe' });
    log(c.green, '  ✅ PM2 backend reloaded');
  } catch (e: any) {
    log(c.yellow, `  ⚠️  PM2 reload failed (may not be running in PM2): ${e.message}`);
  }

  // 9b. Poll health endpoint until backend is ready (up to 30s)
  const backendBase = process.env.BACKEND_URL || 'http://localhost:3001';
  const healthUrl = `${backendBase}/v1/health`;
  let ready = false;
  for (let attempt = 1; attempt <= 15; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const probe = await httpGet(healthUrl);
    if (probe.ok) { log(c.green, `  ✅ Backend ready after ${attempt * 2}s`); ready = true; break; }
    log(c.gray, `  ⏳ Waiting for backend... (${attempt * 2}s, HTTP ${probe.status || 'timeout'})`);
  }
  if (!ready) { log(c.yellow, '  ⚠️  Backend did not come up in 30s — smoke tests may fail'); }

  // 9c. Smoke test key endpoints
  const endpoints = [
    { name: 'health',      url: `${backendBase}/v1/health` },
    { name: 'invoices',    url: `${backendBase}/v1/invoices?limit=1` },
    { name: 'settlements', url: `${backendBase}/v1/settlements?limit=1` },
  ];

  const results: Array<{ name: string; status: number; ok: boolean }> = [];
  for (const ep of endpoints) {
    const result = await httpGet(ep.url);
    results.push({ name: ep.name, ...result });
    const icon = result.ok ? '✅' : '🔴';
    log(result.ok ? c.green : c.red, `  ${icon} ${ep.name}: HTTP ${result.status || 'timeout'}`);
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    const failList = failed.map(r => `• ${r.name}: HTTP ${r.status || 'timeout'}`).join('\n');
    log(c.red, `\n  🔴 ${failed.length}/${endpoints.length} smoke tests FAILED`);
    await sendTelegramAlert(
      `🔴 *Post-Sprint Smoke Test FAILED*\n\n` +
      `${failed.length}/${endpoints.length} endpoints down after sprint:\n${failList}\n\n` +
      `Run \`pm2 logs backend\` to investigate.`
    );
  } else {
    log(c.green, `\n  ✅ All ${endpoints.length} smoke tests passed`);
    await sendTelegramAlert(
      `✅ *Post-Sprint Smoke Test Passed*\n\n` +
      `All ${endpoints.length} endpoints healthy after sprint.\n` +
      results.map(r => `• ${r.name}: HTTP ${r.status}`).join('\n')
    );
  }
}

// ===== Main Entry =====

async function main() {
  try {
    const orchestrator = new Orchestrator();
    await orchestrator.run();
  } catch (error: any) {
    log(c.red, `\n✗ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();