#!/usr/bin/env ts-node
/**
 * post-sprint-pipeline.ts — Autonomous Test → CTO Review → Deploy Pipeline
 *
 * Called automatically by sprint-runner.ts after each sprint completes.
 *
 * Flow:
 *   1. Collect all test files written during the sprint
 *   2. Run jest on those test files (timeout: 5 min)
 *   3. Parse results (pass/fail counts, failure messages)
 *   4. CTO agent (MiniMax) reviews results → decision: fix or deploy
 *   5a. If FAIL → create a bug-fix sprint JSON file, sprint-runner picks it up next cycle
 *   5b. If PASS → git push to GitHub (triggers CI) → Vercel deploy → notify CEO + owner via Telegram
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/post-sprint-pipeline.ts <sprint-file.json>
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import * as https from 'https';
import 'dotenv/config';

const ROOT     = process.cwd();
const SPRINTS  = join(ROOT, 'sprints');
const LOG_DIR  = join(ROOT, 'logs');
const REPORTS  = join(ROOT, 'reports', 'post-sprint');

interface Task {
  id: string;
  status: string;
  agent?: string;
  deliverables?: { code?: string[]; tests?: string[] };
  [k: string]: unknown;
}

// ── Logging ─────────────────────────────────────────────────────────────────
function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
function log(msg: string): void {
  console.log(`${ts()}: [PostSprint] ${msg}`);
}

// ── Telegram ────────────────────────────────────────────────────────────────
function sendTelegram(text: string): void {
  const token  = process.env.CEO_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => { /* silent */ });
  req.write(body); req.end();
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
function apiPost(hostname: string, path: string, headers: Record<string, string>, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, port: 443, path, method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString()));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── Collect test files from sprint ───────────────────────────────────────────
function collectTestFiles(tasks: Task[]): string[] {
  const files: string[] = [];
  for (const task of tasks) {
    if (task.status !== 'done') continue;
    const tests = task.deliverables?.tests || [];
    for (const f of tests) {
      const absPath = join(ROOT, f);
      if (existsSync(absPath)) {
        files.push(absPath);
      } else {
        // Scan backend/tests/** for files matching task id
        const found = spawnSync('find', [join(ROOT, 'backend'), '-name', `*.test.ts`, '-newer', join(ROOT, 'sprints')], {
          encoding: 'utf8', timeout: 5000,
        });
        const matches = (found.stdout || '').split('\n').filter(l => l.includes(task.id.toLowerCase().replace('-', '')));
        files.push(...matches.filter(Boolean));
      }
    }
  }
  return [...new Set(files)];
}

// ── Run jest ─────────────────────────────────────────────────────────────────
interface TestResult {
  passed: number;
  failed: number;
  total: number;
  failures: Array<{ test: string; message: string }>;
  raw: string;
  exitCode: number;
}

function runTests(testFiles: string[]): TestResult {
  if (testFiles.length === 0) {
    log('No test files found — running full backend test suite');
    const result = spawnSync(
      'npx', ['jest', '--passWithNoTests', '--forceExit', '--json', '--testPathPattern', 'backend/'],
      { cwd: ROOT, encoding: 'utf8', timeout: 5 * 60 * 1000, env: { ...process.env } }
    );
    return parseJestOutput(result.stdout + result.stderr, result.status ?? 1);
  }

  const result = spawnSync(
    'npx', ['jest', '--passWithNoTests', '--forceExit', '--json', ...testFiles],
    { cwd: ROOT, encoding: 'utf8', timeout: 5 * 60 * 1000, env: { ...process.env } }
  );
  return parseJestOutput(result.stdout + result.stderr, result.status ?? 1);
}

function parseJestOutput(output: string, exitCode: number): TestResult {
  const failures: Array<{ test: string; message: string }> = [];
  let passed = 0, failed = 0, total = 0;

  // Try JSON output first
  const jsonMatch = output.match(/\{[\s\S]*"numPassedTests"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      passed = data.numPassedTests || 0;
      failed = data.numFailedTests || 0;
      total  = data.numTotalTests  || 0;
      for (const suite of (data.testResults || [])) {
        for (const result of (suite.testResults || [])) {
          if (result.status === 'failed') {
            failures.push({
              test: result.fullName || result.title,
              message: result.failureMessages?.join('\n').slice(0, 300) || 'unknown failure',
            });
          }
        }
      }
      return { passed, failed, total, failures, raw: output.slice(0, 3000), exitCode };
    } catch { /* fall through to text parsing */ }
  }

  // Text parsing fallback
  const passMatch = output.match(/(\d+) passed/);
  const failMatch = output.match(/(\d+) failed/);
  passed = passMatch ? parseInt(passMatch[1]) : 0;
  failed = failMatch ? parseInt(failMatch[1]) : 0;
  total  = passed + failed;

  // Extract failure messages
  const failBlocks = output.split(/● /g).slice(1);
  for (const block of failBlocks.slice(0, 5)) {
    const lines = block.split('\n');
    failures.push({ test: lines[0]?.trim() || 'unknown', message: lines.slice(1, 6).join('\n').slice(0, 200) });
  }

  return { passed, failed, total, failures, raw: output.slice(0, 3000), exitCode };
}

// ── CTO review ───────────────────────────────────────────────────────────────
interface CtoDecision {
  decision: 'deploy' | 'fix';
  summary: string;
  bugFixTasks?: Array<{ id: string; description: string; file: string }>;
}

async function ctoReview(result: TestResult, sprintName: string): Promise<CtoDecision> {
  const prompt = `You are the CTO of Invoica. Sprint "${sprintName}" just completed. Review the test results and decide: deploy to production or create a bug-fix sprint.

## Test Results
- Passed: ${result.passed}
- Failed: ${result.failed}
- Total: ${result.total}
- Exit code: ${result.exitCode}

## Failures (if any)
${result.failures.map((f, i) => `${i + 1}. ${f.test}\n   ${f.message}`).join('\n\n') || 'None'}

## Raw Output (last 2000 chars)
${result.raw.slice(-2000)}

## Decision Rules
- If 0 failures and exit code 0: always decide "deploy"
- If minor failures (type errors, missing mocks, < 20% fail rate): decide "fix" with specific tasks
- If catastrophic failures (> 50% fail or core services broken): decide "fix"
- Be pragmatic — passing tests with minor issues should deploy; only block on real bugs

Respond ONLY with valid JSON:
{
  "decision": "deploy" | "fix",
  "summary": "1-2 sentence summary for CEO and owner",
  "bugFixTasks": [
    { "id": "FIX-001", "description": "what to fix", "file": "path/to/file.ts" }
  ]
}
bugFixTasks is only required when decision is "fix". Keep it empty array for "deploy".`;

  try {
    const body = JSON.stringify({
      model: process.env.MINIMAX_DEFAULT_MODEL || 'MiniMax-M2.5',
      messages: [
        { role: 'system', content: 'You are the CTO of Invoica. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
    });
    const groupId = process.env.MINIMAX_GROUP_ID || '';
    const raw = await apiPost(
      'api.minimax.io',
      `/v1/text/chatcompletion_v2${groupId ? `?GroupId=${groupId}` : ''}`,
      { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MINIMAX_API_KEY}` },
      body
    );
    const text = JSON.parse(raw).choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as CtoDecision;
  } catch (e: any) {
    log(`CTO review error: ${e.message}`);
  }

  // Default: if tests passed, deploy; otherwise fix
  return {
    decision: result.exitCode === 0 && result.failed === 0 ? 'deploy' : 'fix',
    summary: result.exitCode === 0
      ? `All ${result.total} tests passed — ready for production deployment.`
      : `${result.failed} test(s) failed — bug fixes required before deployment.`,
    bugFixTasks: [],
  };
}

// ── Create bug-fix sprint ─────────────────────────────────────────────────────
function createBugFixSprint(sprintName: string, tasks: CtoDecision['bugFixTasks'], testResult: TestResult): string {
  const nextNum = Date.now(); // use timestamp to avoid conflicts
  const fixFile = join(SPRINTS, `bugfix-${sprintName.replace('.json', '')}-${new Date().toISOString().slice(0, 10)}.json`);

  const fixTasks = (tasks || []).map((t, i) => ({
    id: t.id || `FIX-${String(i + 1).padStart(3, '0')}`,
    agent: 'backend-core',
    type: 'bugfix',
    priority: 'high',
    dependencies: [],
    context: t.description,
    deliverables: { code: [t.file], tests: [] },
    status: 'pending',
  }));

  // Also add general "fix failing tests" task if we have failures but no specific tasks
  if (fixTasks.length === 0 && testResult.failed > 0) {
    fixTasks.push({
      id: 'FIX-001',
      agent: 'backend-core',
      type: 'bugfix',
      priority: 'high',
      dependencies: [],
      context: `Fix ${testResult.failed} failing test(s) from sprint ${sprintName}.\n\n` +
        testResult.failures.map(f => `- ${f.test}: ${f.message}`).join('\n'),
      deliverables: { code: [], tests: [] },
      status: 'pending',
    });
  }

  writeFileSync(fixFile, JSON.stringify(fixTasks, null, 2));
  return fixFile;
}

// ── Git push to GitHub ────────────────────────────────────────────────────────
function pushToGitHub(): { success: boolean; output: string } {
  const githubToken = process.env.GITHUB_TOKEN;
  const remoteUrl = process.env.GITHUB_REMOTE_URL ||
    execSyncSafe('git remote get-url origin') ||
    'https://github.com/skingem1/Invoica.git';

  log('Pushing approved commits to GitHub...');

  // Build authenticated remote URL if token is available
  const authedUrl = githubToken
    ? remoteUrl.replace('https://', `https://x-access-token:${githubToken}@`)
    : remoteUrl;

  const result = spawnSync(
    'git', ['push', authedUrl, 'HEAD:main', '--follow-tags'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env } }
  );

  const combined = (result.stdout || '') + (result.stderr || '');
  if (result.status === 0) {
    log(`GitHub push succeeded`);
    return { success: true, output: combined.slice(0, 300) };
  } else {
    log(`GitHub push failed: ${combined.slice(0, 300)}`);
    return { success: false, output: combined.slice(0, 300) };
  }
}

function execSyncSafe(cmd: string): string {
  try {
    return spawnSync('sh', ['-c', cmd], { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() || '';
  } catch { return ''; }
}

// ── Vercel deploy ─────────────────────────────────────────────────────────────
function deployToVercel(): { success: boolean; url: string; output: string } {
  // Run pre-deploy check first
  const preCheck = spawnSync('bash', [join(ROOT, 'scripts/pre-deploy-check.sh')], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env },
  });
  if (preCheck.status !== 0) {
    return { success: false, url: '', output: `Pre-deploy check failed:\n${preCheck.stdout}\n${preCheck.stderr}` };
  }

  // Attempt Vercel deploy (CLI must be installed)
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    return { success: false, url: '', output: 'VERCEL_TOKEN not set — skipping deploy. Set VERCEL_TOKEN in .env to enable auto-deploy.' };
  }

  // Deploy from frontend/ which has .vercel/project.json linking to invoica-b89o (app.invoica.ai)
  const frontendDir = join(ROOT, 'frontend');
  const deploy = spawnSync(
    'npx', ['vercel', '--prod', '--yes', '--token', vercelToken],
    { cwd: frontendDir, encoding: 'utf8', timeout: 10 * 60 * 1000, env: { ...process.env } }
  );

  const combined = deploy.stdout + '\n' + deploy.stderr;
  const urlMatch = combined.match(/https:\/\/[a-z0-9\-]+\.vercel\.app/);
  const url = urlMatch ? urlMatch[0] : 'https://app.invoica.ai';

  return {
    success: deploy.status === 0,
    url,
    output: combined.slice(0, 500),
  };
}

// ── Save report ───────────────────────────────────────────────────────────────
function saveReport(sprintName: string, testResult: TestResult, decision: CtoDecision, deployResult?: ReturnType<typeof deployToVercel>): void {
  if (!existsSync(REPORTS)) mkdirSync(REPORTS, { recursive: true });
  const reportFile = join(REPORTS, `${new Date().toISOString().slice(0, 10)}-${sprintName.replace('.json', '')}.md`);
  const lines = [
    `# Post-Sprint Pipeline Report`,
    `**Sprint:** ${sprintName}`,
    `**Date:** ${new Date().toISOString()}`,
    ``,
    `## Test Results`,
    `- Passed: ${testResult.passed} / ${testResult.total}`,
    `- Failed: ${testResult.failed}`,
    `- Exit code: ${testResult.exitCode}`,
    ``,
    ...(testResult.failures.length > 0 ? [
      `## Failures`,
      ...testResult.failures.map(f => `- **${f.test}**: ${f.message.slice(0, 200)}`),
      ``,
    ] : []),
    `## CTO Decision: ${decision.decision.toUpperCase()}`,
    decision.summary,
    ``,
    ...(deployResult ? [
      `## Deployment`,
      `Status: ${deployResult.success ? '✅ Success' : '❌ Failed'}`,
      `URL: ${deployResult.url}`,
    ] : []),
  ];
  writeFileSync(reportFile, lines.join('\n'));
  log(`Report saved: ${reportFile}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const sprintFile = process.argv[2];
  if (!sprintFile || !existsSync(sprintFile)) {
    log(`Usage: post-sprint-pipeline.ts <sprint-file.json>`);
    process.exit(1);
  }

  const sprintName = sprintFile.split('/').pop()!;
  log(`Starting post-sprint pipeline for: ${sprintName}`);

  // Load sprint tasks
  const tasks: Task[] = JSON.parse(readFileSync(sprintFile, 'utf8'));
  const doneTasks = tasks.filter(t => t.status === 'done');
  log(`${doneTasks.length} completed tasks to test`);

  // 1. Collect test files
  const testFiles = collectTestFiles(tasks);
  log(`Found ${testFiles.length} test file(s): ${testFiles.map(f => f.replace(ROOT + '/', '')).join(', ')}`);

  // 2. Run tests
  log('Running tests...');
  const testResult = runTests(testFiles);
  log(`Tests complete — Passed: ${testResult.passed}, Failed: ${testResult.failed}, Total: ${testResult.total}`);

  // 3. CTO review
  log('CTO reviewing test results...');
  const decision = await ctoReview(testResult, sprintName);
  log(`CTO decision: ${decision.decision.toUpperCase()} — ${decision.summary}`);

  // 4. Act on decision
  if (decision.decision === 'fix') {
    const fixFile = createBugFixSprint(sprintName, decision.bugFixTasks, testResult);
    log(`Bug-fix sprint created: ${fixFile}`);

    saveReport(sprintName, testResult, decision);

    sendTelegram(
      `🔴 *Post-Sprint: Tests Failed — ${sprintName}*\n\n` +
      `${testResult.failed}/${testResult.total} tests failed.\n\n` +
      `*CTO Decision:* ${decision.summary}\n\n` +
      `Bug-fix sprint queued: \`${fixFile.split('/').pop()}\`\n` +
      `Sprint-runner will execute fixes in next cycle (≤30 min).`
    );
    log('Bug-fix sprint queued. Sprint-runner will pick it up automatically.');

  } else {
    // 4a. Push approved commits to GitHub (triggers CI)
    const pushResult = pushToGitHub();
    if (!pushResult.success) {
      log(`⚠️ GitHub push failed — continuing to Vercel deploy anyway`);
      sendTelegram(
        `⚠️ *GitHub push failed for ${sprintName}*\n\`\`\`\n${pushResult.output.slice(0, 300)}\n\`\`\``
      );
    } else {
      sendTelegram(`📦 *GitHub push succeeded — ${sprintName}*\nCI workflow triggered on main.`);
    }

    // 4b. Deploy to Vercel
    log('Tests passed — running pre-deploy check and deploying to Vercel...');
    const deployResult = deployToVercel();
    log(`Deploy ${deployResult.success ? 'SUCCESS' : 'FAILED'}: ${deployResult.url}`);

    saveReport(sprintName, testResult, decision, deployResult);

    const emoji = deployResult.success ? '✅' : '⚠️';
    sendTelegram(
      `${emoji} *Post-Sprint: ${sprintName} → ${deployResult.success ? 'DEPLOYED' : 'DEPLOY FAILED'}*\n\n` +
      `*Tests:* ${testResult.passed}/${testResult.total} passed ✓\n` +
      `*GitHub:* ${pushResult.success ? '✅ pushed' : '❌ push failed'}\n` +
      `*CTO:* ${decision.summary}\n\n` +
      (deployResult.success
        ? `*Live at:* ${deployResult.url}\n\nReady for CEO review.`
        : `*Deploy output:*\n\`\`\`\n${deployResult.output.slice(0, 300)}\n\`\`\``)
    );
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log(`Fatal: ${msg}`);
  sendTelegram(`🔴 *Post-Sprint Pipeline crashed*: ${msg}`);
  process.exit(1);
});
