#!/usr/bin/env ts-node

/**
 * Invoica BizDev Runner
 *
 * Executes business development tasks via Manus AI.
 * Runs weekly (Sunday 06:00 UTC) for opportunity scans.
 * Can be invoked on-demand for business cases and market analysis.
 *
 * Usage:
 *   npx ts-node scripts/run-bizdev.ts [opportunity-scan|business-case|market-deep-dive|partnership-analysis] [context]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import { spawn } from 'child_process';
import 'dotenv/config';

// ── Cron guard: prevent PM2 reload from triggering this script off-schedule ──
(function checkCronGuard() {
  const _guardFile = require('path').join(process.cwd(), 'logs', 'cron-guard-bizdev-weekly.json');
  const _minMs = 160 * 60 * 60 * 1000;
  try {
    const _last = require('fs').existsSync(_guardFile)
      ? JSON.parse(require('fs').readFileSync(_guardFile, 'utf-8')).lastRun
      : 0;
    if (Date.now() - new Date(_last).getTime() < _minMs) {
      const _ago = Math.round((Date.now() - new Date(_last).getTime()) / 3600000);
      console.log(`[CronGuard] bizdev-weekly: last run ${_ago}h ago (min interval 160h) — skipping`);
      process.exit(0);
    }
  } catch { /* first run or stale guard */ }
  // Update last-run timestamp
  try {
    require('fs').writeFileSync(_guardFile, JSON.stringify({ lastRun: new Date().toISOString() }));
  } catch { /* non-fatal */ }
})();


// ── Manus AI client (same pattern as run-cmo-fixed.ts) ──────────────────────

interface ManusConfig {
  apiKey: string;
  baseUrl: string;
  agentProfile: string;
  pollingIntervalMs: number;
  maxPollingAttempts: number;
}

interface ManusTaskRequest  { prompt: string; agentProfile?: string; }
interface ManusTaskResponse { task_id: string; task_url?: string; }
interface ManusContentBlock { type: string; text: string; }
interface ManusOutputEntry  { id: string; status: string; role: 'user' | 'assistant'; type: string; content: ManusContentBlock[]; }
interface ManusTaskStatus   { id: string; status: 'running' | 'pending' | 'completed' | 'error'; output?: ManusOutputEntry[]; error?: string; }
interface ManusTaskResult   { taskId: string; status: 'completed' | 'error' | 'timeout'; output: string; durationMs: number; pollAttempts: number; }

class ManusApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(`Manus API error (${statusCode}): ${message}`);
    this.name = 'ManusApiError';
    this.statusCode = statusCode;
  }
}

class ManusClient {
  private config: ManusConfig;

  constructor(config: Partial<ManusConfig> = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.MANUS_API_KEY || '',
      baseUrl: config.baseUrl || process.env.MANUS_BASE_URL || 'https://api.manus.ai/v1',
      agentProfile: config.agentProfile || 'manus-1.6',
      pollingIntervalMs: config.pollingIntervalMs || 5000,
      maxPollingAttempts: config.maxPollingAttempts || 120,
    };
    if (!this.config.apiKey) throw new Error('MANUS_API_KEY not set');
  }

  async createTask(req: ManusTaskRequest): Promise<ManusTaskResponse> {
    return await this.httpRequest('POST', '/tasks', JSON.stringify({ prompt: req.prompt, agent_profile: req.agentProfile || this.config.agentProfile })) as ManusTaskResponse;
  }

  async getTaskStatus(taskId: string): Promise<ManusTaskStatus> {
    return await this.httpRequest('GET', `/tasks/${taskId}`) as ManusTaskStatus;
  }

  async pollUntilComplete(taskId: string): Promise<ManusTaskResult> {
    const start = Date.now();
    let attempts = 0;
    while (attempts < this.config.maxPollingAttempts) {
      attempts++;
      await this.sleep(this.config.pollingIntervalMs);
      try {
        const s = await this.getTaskStatus(taskId);
        if (s.status === 'completed') {
          return { taskId, status: 'completed', output: this.extractOutput(s.output || []), durationMs: Date.now() - start, pollAttempts: attempts };
        }
        if (s.status === 'error') {
          return { taskId, status: 'error', output: s.error || 'Task failed', durationMs: Date.now() - start, pollAttempts: attempts };
        }
        if (attempts % 10 === 0) console.log(`  [manus] Task ${taskId} still ${s.status} (${((Date.now() - start) / 1000).toFixed(0)}s, poll #${attempts})`);
      } catch (e: any) {
        if (e instanceof ManusApiError && e.statusCode === 401) throw e;
        console.log(`  [manus] Poll error (attempt ${attempts}): ${e.message}`);
      }
    }
    throw new Error(`Manus task ${taskId} timed out after ${attempts} polls`);
  }

  async executeTask(req: ManusTaskRequest): Promise<ManusTaskResult> {
    const task = await this.createTask(req);
    console.log(`  [manus] Task created: ${task.task_id}${task.task_url ? ` (${task.task_url})` : ''}`);
    return this.pollUntilComplete(task.task_id);
  }

  private extractOutput(entries: ManusOutputEntry[]): string {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.role === 'assistant' && e.content?.length) {
        const text = e.content.filter(b => b.type === 'output_text' && b.text).map(b => b.text).join('\n\n');
        if (text.trim()) return text;
      }
    }
    return 'No assistant output in Manus response';
  }

  private httpRequest(method: string, urlPath: string, body?: string): Promise<any> {
    const url = new URL(this.config.baseUrl + urlPath);
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'API_KEY': this.config.apiKey };
      if (body) headers['Content-Length'] = Buffer.byteLength(body).toString();
      const req = https.request({ hostname: url.hostname, port: 443, path: url.pathname + url.search, method, headers }, (res) => {
        let data = '';
        res.on('data', (c: string) => (data += c));
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new ManusApiError(res.statusCode, result.error?.message || result.message || JSON.stringify(result)));
            } else resolve(result);
          } catch { reject(new Error(`Failed to parse Manus response: ${data.substring(0, 500)}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Manus API timeout')); });
      if (body) req.write(body);
      req.end();
    });
  }

  private sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
}

// ── Types & colours ──────────────────────────────────────────────────────────
type BizDevTaskType = 'opportunity-scan' | 'business-case' | 'market-deep-dive' | 'partnership-analysis';
const VALID_TASKS: BizDevTaskType[] = ['opportunity-scan', 'business-case', 'market-deep-dive', 'partnership-analysis'];

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
function log(color: string, msg: string) { console.log(color + msg + c.reset); }

// ── BizDev Runner ────────────────────────────────────────────────────────────
class BizDevRunner {
  private client: ManusClient;
  private bizdevPrompt: string;
  private reportsDir: string;
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.client = new ManusClient({});

    const promptPath = join(this.projectRoot, 'agents/bizdev/prompt.md');
    if (!existsSync(promptPath)) throw new Error('BizDev prompt not found: ' + promptPath);
    this.bizdevPrompt = readFileSync(promptPath, 'utf-8');

    this.reportsDir = join(this.projectRoot, 'reports/bizdev');
    mkdirSync(this.reportsDir, { recursive: true });
    mkdirSync(join(this.reportsDir, 'cases'), { recursive: true });

    log(c.blue, '\n' + '='.repeat(60));
    log(c.blue, '  Invoica BizDev Agent (Manus AI)');
    log(c.blue, '='.repeat(60));
  }

  async run(taskType: BizDevTaskType, additionalContext?: string): Promise<string> {
    log(c.cyan, `\n[bizdev] Starting task: ${taskType}`);
    const startTime = Date.now();

    const taskPrompt = this.buildTaskPrompt(taskType, additionalContext);
    const fullPrompt = this.bizdevPrompt + '\n\n---\n\n## Current Task: ' + taskType + '\n\n' + taskPrompt;
    log(c.gray, `  Prompt length: ${fullPrompt.length} chars`);

    log(c.cyan, '[bizdev] Sending to Manus AI...');
    const result = await this.client.executeTask({ prompt: fullPrompt });

    const reportPath = this.saveReport(taskType, result.output);
    log(c.green, `[bizdev] Report saved: ${reportPath}`);
    this.updateLatestReport(taskType, reportPath);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(c.cyan, `\n[bizdev] Task complete in ${elapsed}s (polls: ${result.pollAttempts})`);

    return reportPath;
  }

  private buildTaskPrompt(taskType: BizDevTaskType, additionalContext?: string): string {
    const today = new Date().toISOString().split('T')[0];
    const context = this.gatherContext();

    const instructions: Record<BizDevTaskType, string> = {
      'opportunity-scan': [
        `Conduct this week's business opportunity scan for Invoica (invoica.ai). Today is ${today}.`,
        '',
        'Scan for opportunities in:',
        '- AI agent payment infrastructure (x402, ERC-20, Base chain) — who needs payment rails?',
        '- Enterprise AI workflow automation — large companies building multi-agent systems',
        '- Developer tools and APIs — what are developers building that needs payment?',
        '- Web3/DeFi integrations — protocols that need invoice middleware',
        '- Potential partnerships with AI frameworks (LangChain, AutoGPT, CrewAI, etc)',
        '- Emerging competitors and their funding/traction',
        '',
        'For each opportunity: TAM estimate, competitive gap, revenue potential, feasibility (1-5), and GO/NO-GO',
        'Prioritize opportunities where our x402 infrastructure is a direct moat.',
        '',
        'Output as structured markdown with an executive summary table at the top.',
      ].join('\n'),

      'business-case': [
        `Develop a full business case for Invoica. Today is ${today}.`,
        additionalContext ? `\nFocus area: ${additionalContext}` : '\nIdentify the highest-impact opportunity from recent market intelligence.',
        '',
        'Follow the standard format:',
        '1. Executive Summary',
        '2. Market Analysis (TAM/SAM/SOM with data sources)',
        '3. Competitive Landscape',
        '4. Our Advantage',
        '5. Revenue Model',
        '6. Financial Projections (conservative/base/optimistic, 12-month)',
        '7. Technical Feasibility',
        '8. Risk Assessment',
        '9. Recommendation (Go/No-Go)',
      ].join('\n'),

      'market-deep-dive': [
        `Conduct a deep market analysis for Invoica. Today is ${today}.`,
        additionalContext ? `\nMarket segment: ${additionalContext}` : '\nFocus on AI agent payment infrastructure market.',
        '',
        'Include:',
        '- Total market size with data sources',
        '- Key players and their funding, traction, and differentiators',
        '- Pricing models in the market',
        '- Regulatory landscape',
        '- Technology trends (next 12 months)',
        '- Customer segments and their pain points',
        '- Gaps that Invoica can fill',
      ].join('\n'),

      'partnership-analysis': [
        `Identify and analyze partnership opportunities for Invoica. Today is ${today}.`,
        additionalContext ? `\nFocus: ${additionalContext}` : '',
        '',
        'Identify potential partners in:',
        '- AI agent frameworks (LangChain, AutoGPT, CrewAI, etc.)',
        '- Blockchain infrastructure (Base, Coinbase, Alchemy)',
        '- Enterprise AI deployment (AWS Bedrock, Azure AI, GCP Vertex)',
        '- Developer tools and IDEs',
        '',
        'For each partner: strategic value, what we offer them, what they offer us, and recommended approach.',
      ].join('\n'),
    };

    let prompt = instructions[taskType];
    if (context) prompt += '\n\n## Market Intelligence Context\n' + context;
    if (additionalContext && taskType !== 'business-case' && taskType !== 'partnership-analysis') {
      prompt += '\n\n## Additional Context\n' + additionalContext;
    }
    return prompt;
  }

  private gatherContext(): string {
    const sections: string[] = [];

    // Load latest CMO market watch for competitor intelligence
    const marketWatch = join(this.projectRoot, 'reports/cmo/latest-market-watch.md');
    if (existsSync(marketWatch)) {
      const content = readFileSync(marketWatch, 'utf-8');
      sections.push('### CMO Market Watch (latest)\n' + content.substring(0, 1500));
    }

    // Load previous opportunity scan for continuity
    const latestScan = join(this.reportsDir, 'latest-opportunity-scan.md');
    if (existsSync(latestScan)) {
      const content = readFileSync(latestScan, 'utf-8');
      sections.push('### Previous Opportunity Scan\n' + content.substring(0, 1000));
    }

    // Load CEO priorities if available
    const ceoPriorities = join(this.projectRoot, 'reports/ceo/latest-priorities.md');
    if (existsSync(ceoPriorities)) {
      const content = readFileSync(ceoPriorities, 'utf-8');
      sections.push('### CEO Current Priorities\n' + content.substring(0, 1000));
    }

    return sections.join('\n\n');
  }

  private saveReport(taskType: BizDevTaskType, content: string): string {
    const date = new Date().toISOString().split('T')[0];

    if (taskType === 'business-case') {
      const casesDir = join(this.reportsDir, 'cases');
      const existingCases = readdirSync(casesDir).filter(f => f.startsWith('BIZ-')).length;
      const caseNum = String(existingCases + 1).padStart(3, '0');
      const casePath = join(casesDir, `BIZ-${caseNum}-${date}.md`);
      writeFileSync(casePath, content);
      return casePath;
    }

    const filepath = join(this.reportsDir, `${taskType}-${date}.md`);
    writeFileSync(filepath, content);
    return filepath;
  }

  private updateLatestReport(taskType: BizDevTaskType, reportPath: string): void {
    if (taskType === 'business-case') return; // Business cases get individual files only
    const latestPath = join(this.reportsDir, `latest-${taskType}.md`);
    writeFileSync(latestPath, readFileSync(reportPath, 'utf-8'));
    log(c.gray, `  Updated latest-${taskType}.md`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const taskType = process.argv[2] as BizDevTaskType;
  const additionalContext = process.argv.slice(3).join(' ') || undefined;

  if (!taskType || !VALID_TASKS.includes(taskType)) {
    console.log('Usage: npx ts-node scripts/run-bizdev.ts <task-type> [context]');
    console.log('');
    console.log('Task types:');
    console.log('  opportunity-scan      Weekly scan for business opportunities (default)');
    console.log('  business-case         Full business case for a specific opportunity');
    console.log('  market-deep-dive      Deep analysis of a specific market segment');
    console.log('  partnership-analysis  Identify and analyse potential partners');
    console.log('');
    console.log('Examples:');
    console.log('  npx ts-node scripts/run-bizdev.ts opportunity-scan');
    console.log('  npx ts-node scripts/run-bizdev.ts business-case "enterprise AI payment middleware"');
    process.exit(1);
  }

  try {
    const runner = new BizDevRunner();
    const reportPath = await runner.run(taskType, additionalContext);

    log(c.green, '\n' + '='.repeat(60));
    log(c.green, `  BizDev task complete: ${taskType}`);
    log(c.green, `  Report: ${reportPath}`);
    log(c.green, '='.repeat(60) + '\n');

    // Trigger CEO review (fire-and-forget)
    const ceoReview = spawn('node', ['-r', 'ts-node/register', join(__dirname, 'run-ceo-review.ts'), '--source=bizdev'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true', TS_NODE_PROJECT: join(__dirname, '..', 'tsconfig.json') },
    });
    ceoReview.unref();
    log(c.gray, `  CEO review triggered (PID ${ceoReview.pid})`);

    process.exit(0);
  } catch (err: any) {
    log(c.red, `\n[bizdev] FAILED: ${err.message}`);
    if (err.stack) log(c.gray, err.stack);
    process.exit(1);
  }
}

main();
