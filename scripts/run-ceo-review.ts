#!/usr/bin/env ts-node

/**
 * run-ceo-review.ts — CEO Continuous Report Review & Event-Driven Sprint Trigger
 *
 * Architecture:
 *   - Called immediately after CMO/CTO save their reports (fire-and-forget spawn)
 *   - Also runs every 2 hours via PM2 cron as a safety net
 *   - CEO reads ALL latest reports, identifies priorities, decides if a sprint is needed
 *   - Sprints are event-driven: triggered by need, not by schedule
 *   - Sprint can target: Invoica product (backend/frontend) OR the agent swarm
 *
 * Usage:
 *   npx ts-node scripts/run-ceo-review.ts [--source=cmo|cto|cfo|manual] [--force]
 *
 * --source  which agent triggered this review (for logging/Telegram)
 * --force   bypass new-report check and run CEO review regardless
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { spawn } from 'child_process';
import 'dotenv/config';

// ─── Config ────────────────────────────────────────────────────────────────

const ROOT           = path.resolve(__dirname, '..');
const CEO_DIR        = path.join(ROOT, 'reports', 'ceo');
const STATE_FILE     = path.join(CEO_DIR, 'review-state.json');
const LOCK_FILE      = path.join(CEO_DIR, '.review-lock');
const SPRINT_BRIEF   = path.join(CEO_DIR, 'sprint-brief.md');
const PRIORITIES_LATEST = path.join(CEO_DIR, 'latest-priorities.md');
const LOGS_DIR       = path.join(ROOT, 'logs');

const SOURCE = process.argv.find(a => a.startsWith('--source='))?.split('=')[1] ?? 'cron';
const FORCE  = process.argv.includes('--force');

// ─── Telegram ───────────────────────────────────────────────────────────────

async function sendTelegram(message: string): Promise<void> {
  const token  = process.env.CEO_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID ?? process.env.CEO_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, () => resolve());
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

// ─── Anthropic Claude ────────────────────────────────────────────────────────

async function callClaude(system: string, user: string, maxTokens = 2500): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString());
          if (parsed.error) {
            reject(new Error('Claude API error: ' + (parsed.error.message || JSON.stringify(parsed.error))));
            return;
          }
          resolve(parsed.content?.[0]?.text ?? '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}


// ── MiniMax fallback (when Claude credits exhausted) ────────────────────────
// IMPORTANT: Always use MiniMax-M2.5 (Coding Plan). Do NOT use MINIMAX_DEFAULT_MODEL
// env var — that may be set to MiniMax-Text-01 which is NOT on the Coding Plan.
const MINIMAX_CODING_MODEL = 'MiniMax-M2.5';
async function callMinimax(system: string, user: string, maxTokens = 2500): Promise<string> {
  const body = JSON.stringify({
    model: MINIMAX_CODING_MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: maxTokens,
  });
  return new Promise((resolve, reject) => {
    const groupId = process.env.MINIMAX_GROUP_ID || '';
    const path = `/v1/text/chatcompletion_v2${groupId ? `?GroupId=${groupId}` : ''}`;
    const req = https.request({
      hostname: 'api.minimax.io', path, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString()).choices?.[0]?.message?.content ?? ''); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function callLLM(system: string, user: string, maxTokens = 2500): Promise<string> {
  try {
    return await callClaude(system, user, maxTokens);
  } catch (e: any) {
    if (e.message?.includes('credit') || e.message?.includes('billing') || e.message?.includes('balance')) {
      console.log('[ceo-review] Anthropic credits low — falling back to MiniMax');
      return callMinimax(system, user, maxTokens);
    }
    throw e;
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

interface ReviewState {
  lastReviewAt: number;
  lastReportMtimes: Record<string, number>;
  sprintCount: number;
  lastSprintAt: number;
}

function loadState(): ReviewState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { lastReviewAt: 0, lastReportMtimes: {}, sprintCount: 0, lastSprintAt: 0 }; }
}

function saveState(state: ReviewState) {
  fs.mkdirSync(CEO_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Report collection ───────────────────────────────────────────────────────

function getMtime(p: string): number {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}

function readIfExists(p: string, maxChars = 3500): string {
  if (!fs.existsSync(p)) return '';
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    // Read the most recent file in the dir
    const files = fs.readdirSync(p).filter(f => f.endsWith('.md') || f.endsWith('.json')).sort().reverse();
    if (!files.length) return '';
    return fs.readFileSync(path.join(p, files[0]), 'utf-8').slice(0, maxChars);
  }
  return fs.readFileSync(p, 'utf-8').slice(0, maxChars);
}

interface ReportSet {
  hasNew: boolean;
  content: string;
  mtimes: Record<string, number>;
}

function collectReports(state: ReviewState): ReportSet {
  const REPORT_SOURCES: Record<string, string> = {
    'cmo/market-watch':      path.join(ROOT, 'reports', 'cmo', 'latest-market-watch.md'),
    'cmo/strategy':          path.join(ROOT, 'reports', 'cmo', 'latest-strategy-report.md'),
    'cmo/brand-review':      path.join(ROOT, 'reports', 'cmo', 'latest-brand-review.md'),
    'cto/openclaw':          path.join(ROOT, 'reports', 'cto', 'latest-openclaw-watch.md'),
    'cto/clawhub':           path.join(ROOT, 'reports', 'cto', 'latest-clawhub-scan.md'),
    'cto/learnings':         path.join(ROOT, 'reports', 'cto', 'latest-learnings-review.md'),
    'cto/post-sprint':       path.join(ROOT, 'reports', 'cto', 'latest-post-sprint-analysis.md'),
    'cfo/financial':         path.join(ROOT, 'reports', 'cfo', 'latest-financial-report.md'),
    'cto/email-escalations': path.join(ROOT, 'reports', 'cto', 'email-escalations'),
    'x-admin/post-log':      path.join(ROOT, 'reports', 'invoica-x-admin', 'logs'),
  };

  let hasNew = false;
  const newMtimes: Record<string, number> = {};
  const sections: string[] = [];

  for (const [key, filePath] of Object.entries(REPORT_SOURCES)) {
    const mtime = getMtime(filePath);
    newMtimes[key] = mtime;
    if (mtime > (state.lastReportMtimes[key] ?? 0)) hasNew = true;

    const content = readIfExists(filePath, 3000);
    if (content.trim()) {
      sections.push(`## [${key}]\n${content}`);
    }
  }

  return { hasNew, content: sections.join('\n\n---\n\n'), mtimes: newMtimes };
}

// ─── Sprint trigger ──────────────────────────────────────────────────────────

// ─── Sprint file generation ─────────────────────────────────────────────────

function buildFileTree(): string {
  try {
    const { execSync } = require('child_process');
    const raw = execSync(
      'find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.scss" \\)' +
      ' -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*"' +
      ' -not -path "*/__tests__/*" -not -path "*/sprints/*"' +
      ' | sort | head -120',
      { cwd: '/home/invoica/apps/Invoica', encoding: 'utf-8', timeout: 5000 }
    ) as string;
    const lines = raw.trim().split('\n').map(f => f.replace('./', ''));
    return lines.join('\n');
  } catch {
    return '(file tree unavailable)';
  }
}

async function generateSprintFile(goal: string, scope: string[], rationale: string, sprintNum: number): Promise<string> {
  const sprintDir = path.join(ROOT, 'sprints');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sprintId = `auto-${timestamp}`;
  const sprintPath = path.join(sprintDir, `${sprintId}.json`);

  const fileTree = buildFileTree();
  const system = `You are the CEO of Invoica planning a focused engineering sprint.
Generate a sprint with 4-7 specific tasks to achieve the stated goal.

## Real Project File Tree
IMPORTANT: You MUST only reference files that exist below. Do NOT invent file paths.
${fileTree}

CRITICAL RULES (MiniMax AI will execute these — it truncates large files):
- Each task targets EXACTLY ONE file. No multi-file tasks.
- Keep context under 600 chars per task — be concise and specific.
- agent must be: backend-core | frontend | agents | infra
- type: feature | bugfix | test | docs
- priority: critical | high | medium | low
- status: always "pending"
- dependencies: array of task IDs from THIS sprint that must complete first (empty if none)
- Do NOT assign ADR/documentation-only tasks to MiniMax — those fail. Use docs type sparingly.
- Prefer small, focused changes over large rewrites.

Return ONLY valid JSON (no markdown fences):
{"tasks":[{"id":"PREFIX-001","agent":"backend-core","type":"bugfix","priority":"critical","dependencies":[],"description":"Short title","context":"Specific instructions. One file only. What to change and why.","deliverables":{"code":["relative/path/to/file.ts"],"tests":[],"docs":[]},"status":"pending"}]}`;

  const user = `Sprint Goal: ${goal}\nScope: ${scope.join(', ')}\nRationale: ${rationale}\n\nGenerate the task list now. Return JSON only.`;

  console.log('[ceo-review] Generating sprint tasks with Claude...');
  const raw = await callLLM(system, user, 3000);

  let tasks: any[];
  try {
    const fenceMatch = raw.match(/\`\`\`(?:json)?\n?([\s\S]*?)\`\`\`/);
    const jsonStr = fenceMatch ? fenceMatch[1] : raw;
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    tasks = parsed.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('Empty task list');
  } catch (e: any) {
    throw new Error(`Sprint task generation failed: ${e.message} | raw: ${raw.slice(0, 300)}`);
  }

  fs.mkdirSync(sprintDir, { recursive: true });
  fs.writeFileSync(sprintPath, JSON.stringify({ tasks }, null, 2));

  // Update current.json symlink to point to new sprint
  const currentLink = path.join(sprintDir, 'current.json');
  try { fs.unlinkSync(currentLink); } catch { /* ignore if not exists */ }
  fs.symlinkSync(`${sprintId}.json`, currentLink);

  console.log(`[ceo-review] ✅ Sprint file: ${sprintPath} (${tasks.length} tasks)`);
  console.log(`[ceo-review]    current.json → ${sprintId}.json`);
  return sprintPath;
}

async function triggerSprint(goal: string, scope: string[], rationale: string, state: ReviewState): Promise<void> {
  // Write sprint brief
  const brief = [
    `# CEO Sprint Brief — ${new Date().toISOString()}`,
    '',
    `## Sprint Goal`,
    goal,
    '',
    `## Scope`,
    scope.map(s => `- ${s}`).join('\n'),
    '',
    `## Rationale`,
    rationale,
    '',
    `## Triggered by`,
    `CEO continuous review (source: ${SOURCE}, sprint #${state.sprintCount + 1})`,
  ].join('\n');

  fs.writeFileSync(SPRINT_BRIEF, brief);

  // Generate sprint file with tasks — THIS was the missing step
  let sprintFile: string;
  try {
    sprintFile = await generateSprintFile(goal, scope, rationale, state.sprintCount + 1);
  } catch (e: any) {
    console.log(`[ceo-review] ❌ Sprint file generation failed: ${e.message}`);
    console.log('[ceo-review]    Sprint NOT triggered — fix the generation error first');
    return;
  }

  const logFile = path.join(LOGS_DIR, `sprint-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  // Pass generated sprint file as argv[2] so orchestrator uses it instead of current.json
  const child = spawn(
    'node',
    ['-r', 'ts-node/register', path.join(ROOT, 'scripts', 'orchestrate-agents-v2.ts'), sprintFile],
    {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT,
      env: {
        ...process.env,
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: path.join(ROOT, 'tsconfig.json'),
        CEO_SPRINT_GOAL: goal,
        CEO_SPRINT_SCOPE: scope.join(','),
      },
    }
  );

  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);
  child.unref();

  console.log(`[ceo-review] 🚀 Sprint #${state.sprintCount + 1} triggered — PID ${child.pid}`);
  console.log(`[ceo-review]    Goal: ${goal}`);
  console.log(`[ceo-review]    File: ${sprintFile}`);
  console.log(`[ceo-review]    Log:  ${logFile}`);
}

// ─── CEO decision types ──────────────────────────────────────────────────────

interface Priority {
  id: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  target: string;
}

interface SprintDecision {
  trigger: boolean;
  goal: string;
  scope: string[];
  rationale: string;
}

interface CEODecision {
  summary: string;
  priorities: Priority[];
  sprint_decision: SprintDecision;
  telegram_summary: string;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(CEO_DIR, { recursive: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  // Concurrency lock — max one CEO review at a time
  if (fs.existsSync(LOCK_FILE)) {
    const lockAge = Date.now() - getMtime(LOCK_FILE);
    if (lockAge < 15 * 60 * 1000) {
      console.log(`[ceo-review] Review already in progress (${Math.round(lockAge / 60000)}m old lock) — exiting`);
      return;
    }
    fs.unlinkSync(LOCK_FILE); // stale lock, remove it
  }

  fs.writeFileSync(LOCK_FILE, process.pid.toString());

  try {
    const state = loadState();

    // Sprint cooldown — don't trigger two sprints within 30 minutes of each other
    const sprintCooldownMs = 30 * 60 * 1000;
    const recentSprint = state.lastSprintAt && (Date.now() - state.lastSprintAt) < sprintCooldownMs;

    const reports = collectReports(state);

    if (!reports.hasNew && !FORCE) {
      console.log(`[ceo-review] No new reports since ${new Date(state.lastReviewAt).toISOString()} — exiting`);
      return;
    }

    console.log(`[ceo-review] New reports detected (source: ${SOURCE}) — starting CEO review`);

    // Load CEO context files
    const soul         = readIfExists(path.join(ROOT, 'SOUL.md'), 2000);
    const constitution = readIfExists(path.join(ROOT, 'constitution.md'), 1000);
    const ceoPrompt    = readIfExists(path.join(ROOT, 'agents', 'ceo', 'prompt.md'), 2500);
    const prevPriorities = readIfExists(PRIORITIES_LATEST, 1500);
    const recentSprint_ = readIfExists(SPRINT_BRIEF, 800);

    // ── CEO system prompt ──────────────────────────────────────────────────
    const system = `${ceoPrompt.slice(0, 2000)}

You are the CEO of Invoica — the Financial OS for AI Agents.
You continuously review incoming reports from your leadership team (CMO, CTO, CFO) and decide:
1. What are the current top priorities?
2. Is a sprint needed right now to implement fixes, improvements, or new capabilities?

A sprint can target ANY part of the system:
- Invoica product: backend API, frontend/website, tax engine, SDK, payment flows
- Agent swarm: agent configs, scripts, orchestration, new agents, heartbeat, x-admin, CFO workflows

## STANDING STRATEGIC INITIATIVE — Multichain x402 Expansion

This is a top-3 revenue priority. Currently Invoica only accepts payments on Base (chainId 8453).
Expand in this exact order — do not skip or reorder:

1. POLYGON (next) — EVM, <$0.001/tx, USDC native (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359)
   Implementation: extend backend/src/middleware/x402.ts + chain registry config
   Key files: middleware/x402.ts, routes/ai-inference.ts, new config/chains.ts
   Complexity: LOW — identical EIP-712 TransferWithAuthorization as Base, just chainId 137

2. SOLANA (after Polygon is live) — AI-native ecosystem, USDC SPL token, $0.00025/tx
   Implementation: new signing path — ed25519 + SPL token transfer authority
   Complexity: HIGH — non-EVM, requires separate verification function

3. ARBITRUM / OPTIMISM (after Polygon) — EVM L2s, trivial chainId swaps
   Complexity: TRIVIAL once Polygon path exists

4. ETHEREUM MAINNET (last) — enterprise high-value, expensive gas
   Complexity: LOW — same as Base but different RPC

TRIGGER a Polygon sprint when: no critical/security issues pending AND developer DX is unblocked.
DO NOT wait for a CMO or CTO report to mention multichain — proactively schedule it.

## Sprint trigger criteria:
- TRIGGER immediately: critical bugs, broken autonomy, security issues, revenue-blocking problems
- TRIGGER for: multichain expansion (Polygon → Solana → Arbitrum → Ethereum) — standing priority
- TRIGGER for: high-value features CTO/CMO identified, agent improvements needed now
- TRIGGER for: pattern of failures detected in CTO learnings/post-sprint reports
- DEFER: low-priority improvements, cosmetic changes, already-queued backlog items
- NO trigger: if a sprint was triggered very recently (cooldown applies)

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "summary": "2-3 sentence executive summary of what the reports tell you right now",
  "priorities": [
    {
      "id": "P1",
      "urgency": "critical|high|medium|low",
      "title": "Short title",
      "description": "What needs to happen and why",
      "target": "backend|frontend|agents|infra|content|financial|x-admin|multichain"
    }
  ],
  "sprint_decision": {
    "trigger": true,
    "goal": "Specific, actionable sprint goal in 1-2 sentences",
    "scope": ["backend", "agents"],
    "rationale": "Why triggering now (or: 'No sprint needed — reason')"
  },
  "telegram_summary": "3-5 line Telegram message. Use *bold* for key points. Concise."
}`;

    const cooldownNote = recentSprint
      ? `\n\n⚠️ NOTE: A sprint was triggered ${Math.round((Date.now() - state.lastSprintAt) / 60000)}m ago. Only trigger again for CRITICAL issues.`
      : '';

    const user = [
      `## Company Foundation`,
      soul,
      `\n## Constitution`,
      constitution,
      `\n## Previous Priorities`,
      prevPriorities || '(first CEO review)',
      `\n## Last Sprint Brief`,
      recentSprint_ || '(no recent sprint)',
      `\n## Incoming Reports (review all of these)`,
      reports.content,
      cooldownNote,
      `\nReview all reports. Identify priorities. Decide if a sprint is needed. Return JSON only.`,
    ].join('\n\n');

    console.log('[ceo-review] Calling CEO (Claude)...');
    const raw = await callLLM(system, user, 2500);

    // Parse decision — robust: strip markdown code fences, use indexOf/lastIndexOf
    let decision: CEODecision;
    try {
      let jsonStr = raw;
      // Strip markdown code fences if present
      const fenceMatch = jsonStr.match(/```(?:json)?\n?([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1];
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON object found');
      decision = JSON.parse(jsonStr.slice(start, end + 1));
    } catch {
      console.log('[ceo-review] Response not parseable — saving raw, no sprint triggered');
      decision = {
        summary: raw.slice(0, 400),
        priorities: [],
        sprint_decision: { trigger: false, goal: '', scope: [], rationale: 'JSON parse error — manual review needed' },
        telegram_summary: `⚠️ *CEO Review Error* — source: ${SOURCE}\nResponse unparseable. Manual review needed.`,
      };
    }

    // Save priorities report
    const ts = new Date().toISOString();
    const dated = ts.slice(0, 13).replace('T', '-'); // YYYY-MM-DD-HH
    const urgencyEmoji: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

    const reportContent = [
      `# CEO Priorities Review — ${ts}`,
      `**Source:** ${SOURCE}`,
      '',
      `## Executive Summary`,
      decision.summary,
      '',
      `## Priorities`,
      ...(decision.priorities ?? []).map(p =>
        `### ${urgencyEmoji[p.urgency] ?? ''} [${p.urgency.toUpperCase()}] ${p.title}\n${p.description}\n**Target:** \`${p.target}\``
      ),
      '',
      `## Sprint Decision`,
      `**Trigger:** ${decision.sprint_decision.trigger ? '✅ YES' : '❌ NO'}`,
      `**Goal:** ${decision.sprint_decision.goal}`,
      `**Scope:** ${(decision.sprint_decision.scope ?? []).join(', ')}`,
      `**Rationale:** ${decision.sprint_decision.rationale}`,
    ].join('\n\n');

    const reportPath = path.join(CEO_DIR, `priorities-${dated}.md`);
    fs.writeFileSync(reportPath, reportContent);
    fs.writeFileSync(PRIORITIES_LATEST, reportContent);
    console.log(`[ceo-review] Priorities saved: ${reportPath}`);

    // Telegram notification
    const tgMsg = [
      `🧠 *CEO Review* — ${ts.slice(0, 16)} UTC`,
      `📥 Source: ${SOURCE}`,
      '',
      decision.telegram_summary,
      decision.sprint_decision.trigger
        ? `\n🚀 *Sprint triggered:* ${decision.sprint_decision.goal}`
        : '',
    ].filter(Boolean).join('\n');

    await sendTelegram(tgMsg);

    // Sprint trigger
    if (decision.sprint_decision.trigger && !recentSprint) {
      state.sprintCount++;
      state.lastSprintAt = Date.now();
      await triggerSprint(
        decision.sprint_decision.goal,
        decision.sprint_decision.scope ?? [],
        decision.sprint_decision.rationale,
        state
      );
    } else if (decision.sprint_decision.trigger && recentSprint) {
      console.log('[ceo-review] Sprint requested but cooldown active — skipped');
    }

    // Update state
    state.lastReviewAt = Date.now();
    state.lastReportMtimes = reports.mtimes;
    saveState(state);

    console.log(`[ceo-review] ✅ Done (sprint: ${decision.sprint_decision.trigger && !recentSprint ? 'triggered' : 'not triggered'})`);

  } finally {
    try { fs.unlinkSync(LOCK_FILE); } catch { /* already gone */ }
  }
}

main().catch(e => {
  console.error('[ceo-review] Fatal:', e.message);
  try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
  process.exit(1);
});
