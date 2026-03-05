#!/usr/bin/env ts-node

/**
 * Invoica CMO Runner
 *
 * Standalone script that executes CMO tasks via Manus AI.
 * Run manually or via PM2 cron schedule.
 *
 * Usage:
 *   npx ts-node scripts/run-cmo.ts <task-type> [additional-context]
 *
 * Task types:
 *   market-watch      - Daily competitive intelligence report
 *   strategy-report   - Weekly strategy and brand report
 *   brand-review      - On-demand brand assessment
 *   product-proposal  - On-demand product proposal (pass focus area as context)
 *   x-admin-design    - Design the X Admin Agent specification
 *   website-audit     - Website strategy review
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import 'dotenv/config';


// ===== Manus AI Client (inlined to avoid ESM import issues) =====

interface ManusConfig {
  apiKey: string;
  baseUrl: string;
  agentProfile: string;
  pollingIntervalMs: number;
  maxPollingAttempts: number;
}

interface ManusTaskRequest {
  prompt: string;
  agentProfile?: string;
}

interface ManusTaskResponse {
  task_id: string;
  task_title?: string;
  task_url?: string;
}

interface ManusContentBlock {
  type: string;
  text: string;
}

interface ManusOutputEntry {
  id: string;
  status: string;
  role: 'user' | 'assistant';
  type: string;
  content: ManusContentBlock[];
}

interface ManusTaskStatus {
  id: string;
  object?: string;
  status: 'running' | 'pending' | 'completed' | 'error';
  output?: ManusOutputEntry[];
  error?: string;
  credit_usage?: number;
}

interface ManusTaskResult {
  taskId: string;
  status: 'completed' | 'error' | 'timeout';
  output: string;
  durationMs: number;
  pollAttempts: number;
}

class ManusApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super('Manus API error (' + statusCode + '): ' + message);
    this.name = 'ManusApiError';
    this.statusCode = statusCode;
  }
}

class ManusClient {
  private config: ManusConfig;

  constructor(config: Partial<ManusConfig>) {
    this.config = {
      apiKey: config.apiKey || process.env.MANUS_API_KEY || '',
      baseUrl: config.baseUrl || process.env.MANUS_BASE_URL || 'https://api.manus.ai/v1',
      agentProfile: config.agentProfile || process.env.MANUS_AGENT_PROFILE || 'manus-1.6',
      pollingIntervalMs: config.pollingIntervalMs || parseInt(process.env.MANUS_POLLING_INTERVAL_MS || '5000'),
      maxPollingAttempts: config.maxPollingAttempts || parseInt(process.env.MANUS_MAX_POLLING_ATTEMPTS || '120'),
    };
    if (!this.config.apiKey) {
      throw new Error('MANUS_API_KEY not set');
    }
  }

  async createTask(request: ManusTaskRequest): Promise<ManusTaskResponse> {
    const body = JSON.stringify({
      prompt: request.prompt,
      agent_profile: request.agentProfile || this.config.agentProfile,
    });
    return await this.httpRequest('POST', '/tasks', body) as ManusTaskResponse;
  }

  async getTaskStatus(taskId: string): Promise<ManusTaskStatus> {
    return await this.httpRequest('GET', '/tasks/' + taskId) as ManusTaskStatus;
  }

  async pollUntilComplete(taskId: string): Promise<ManusTaskResult> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < this.config.maxPollingAttempts) {
      attempts++;
      await this.sleep(this.config.pollingIntervalMs);

      try {
        const status = await this.getTaskStatus(taskId);

        if (status.status === 'completed') {
          const output = this.extractOutput(status.output || []);
          return { taskId, status: 'completed', output, durationMs: Date.now() - startTime, pollAttempts: attempts };
        }

        if (status.status === 'error') {
          return {
            taskId, status: 'error',
            output: status.error || 'Task failed with no error message',
            durationMs: Date.now() - startTime, pollAttempts: attempts,
          };
        }

        if (attempts % 10 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          console.log('  [manus] Task ' + taskId + ' still ' + status.status + ' (' + elapsed + 's, poll #' + attempts + ')');
        }
      } catch (error: any) {
        if (error instanceof ManusApiError && error.statusCode === 401) throw error;
        console.log('  [manus] Poll error (attempt ' + attempts + '): ' + error.message);
      }
    }

    throw new Error('Manus task ' + taskId + ' timed out after ' + attempts + ' polling attempts');
  }

  async executeTask(request: ManusTaskRequest): Promise<ManusTaskResult> {
    const task = await this.createTask(request);
    console.log('  [manus] Task created: ' + task.task_id + (task.task_url ? ' (' + task.task_url + ')' : ''));
    return this.pollUntilComplete(task.task_id);
  }

  private extractOutput(entries: ManusOutputEntry[]): string {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.role === 'assistant' && entry.content && entry.content.length > 0) {
        const text = entry.content
          .filter((b: ManusContentBlock) => b.type === 'output_text' && b.text)
          .map((b: ManusContentBlock) => b.text)
          .join('\n\n');
        if (text.trim()) return text;
      }
    }
    return entries.length > 0 ? 'No assistant output in Manus response' : 'No output from Manus task';
  }

  private httpRequest(method: string, path: string, body?: string): Promise<any> {
    const url = new URL(this.config.baseUrl + path);
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'API_KEY': this.config.apiKey,
      };
      if (body) headers['Content-Length'] = Buffer.byteLength(body).toString();

      const req = https.request({
        hostname: url.hostname, port: url.port || 443,
        path: url.pathname + url.search, method, headers,
      }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new ManusApiError(res.statusCode, result.error?.message || result.message || JSON.stringify(result)));
              return;
            }
            resolve(result);
          } catch {
            reject(new Error('Failed to parse Manus response: ' + data.substring(0, 500)));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Manus API request timeout (30s)')); });
      if (body) req.write(body);
      req.end();
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== Types =====

type CMOTaskType =
  | 'market-watch'
  | 'strategy-report'
  | 'brand-review'
  | 'product-proposal'
  | 'x-admin-design'
  | 'website-audit';

const VALID_TASKS: CMOTaskType[] = [
  'market-watch', 'strategy-report', 'brand-review',
  'product-proposal', 'x-admin-design', 'website-audit',
];

// ===== Colors =====

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function log(color: string, msg: string) {
  console.log(color + msg + c.reset);
}

// ===== CMO Runner =====

class CMORunner {
  private client: ManusClient;
  private cmoPrompt: string;
  private reportsDir: string;
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.client = new ManusClient({});

    // Load CMO system prompt
    const promptPath = join(this.projectRoot, 'agents/cmo/prompt.md');
    if (!existsSync(promptPath)) {
      throw new Error('CMO prompt not found: ' + promptPath);
    }
    this.cmoPrompt = readFileSync(promptPath, 'utf-8');

    // Ensure reports directories exist
    this.reportsDir = join(this.projectRoot, 'reports/cmo');
    mkdirSync(this.reportsDir, { recursive: true });
    mkdirSync(join(this.reportsDir, 'ceo-feedback'), { recursive: true });
    mkdirSync(join(this.reportsDir, 'proposals'), { recursive: true });

    log(c.magenta, '\n' + '='.repeat(60));
    log(c.magenta, '  Invoica CMO Agent (Manus AI)');
    log(c.magenta, '='.repeat(60));
  }

  async run(taskType: CMOTaskType, additionalContext?: string): Promise<string> {
    // Smart scheduling: Monday market-watch becomes strategy-report
    const actualTask = this.resolveTask(taskType);
    log(c.cyan, '\n[cmo] Starting task: ' + actualTask + (actualTask !== taskType ? ` (scheduled as ${taskType})` : ''));
    const startTime = Date.now();

    // 1. Build the full prompt
    const taskPrompt = this.buildTaskPrompt(actualTask, additionalContext);
    const fullPrompt = this.cmoPrompt + '\n\n---\n\n## Current Task: ' + actualTask + '\n\n' + taskPrompt;

    log(c.gray, '  Prompt length: ' + fullPrompt.length + ' chars');

    // 2. Execute via Manus
    log(c.cyan, '[cmo] Sending to Manus AI...');
    const result = await this.client.executeTask({ prompt: fullPrompt });

    // 3. Save report
    const reportPath = this.saveReport(actualTask, result.output);
    log(c.green, '[cmo] Report saved: ' + reportPath);

    // 3b. Brand review also updates docs/brand-guidelines.md
    if (actualTask === 'brand-review') {
      const brandPath = join(this.projectRoot, 'docs/brand-guidelines.md');
      writeFileSync(brandPath, result.output);
      log(c.green, '  \u2713 Brand guidelines updated: docs/brand-guidelines.md');
    }

    // 4. Update latest pointer
    this.updateLatestReport(actualTask, reportPath);

    // 5. Log metrics
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(c.cyan, '\n[cmo] Task complete');
    log(c.gray, '  Status: ' + result.status);
    log(c.gray, '  Duration: ' + elapsed + 's');
    log(c.gray, '  Manus polls: ' + result.pollAttempts);
    log(c.gray, '  Output length: ' + result.output.length + ' chars');

    return reportPath;
  }

  /**
   * Smart task resolution: auto-scheduling and first-run detection.
   */
  private resolveTask(task: CMOTaskType): CMOTaskType {
    if (task === 'market-watch') {
      const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon
      if (dayOfWeek === 1) {
        log(c.cyan, '  (Monday \u2014 running weekly strategy report instead of daily market watch)');
        return 'strategy-report';
      }
      // First run: no brand guidelines? Start with brand review
      const brandExists = existsSync(join(this.projectRoot, 'docs/brand-guidelines.md'));
      if (!brandExists) {
        log(c.cyan, '  (First run \u2014 no brand guidelines exist, starting with brand review)');
        return 'brand-review';
      }
    }
    return task;
  }

  private buildTaskPrompt(taskType: CMOTaskType, additionalContext?: string): string {
    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Gather context from existing reports
    const existingContext = this.gatherContext(taskType);

    const taskInstructions: Record<CMOTaskType, string> = {
      'market-watch': [
        'Produce today\'s Market Watch Report for Invoica (invoica.ai).',
        'Today is ' + today + ' (' + dayOfWeek + ').',
        '',
        'Research the current state of:',
        '- x402 protocol ecosystem and adoption (check GitHub repos, blog posts, announcements)',
        '- AI agent payment infrastructure competitors (Stripe, Coinbase Commerce, PayAI, Paygentic)',
        '- Relevant regulatory developments affecting AI payments',
        '- Technology trends: new AI agent frameworks, payment protocols, LLM capabilities',
        '- Crypto and DeFi developments relevant to machine-to-machine payments',
        '',
        'Output in the Market Watch Report format specified in your system prompt.',
        'Include specific URLs as sources for every claim.',
      ].join('\n'),

      'strategy-report': [
        'Produce this week\'s Strategy Report for Invoica.',
        'Today is ' + today + '.',
        '',
        'Synthesize insights from recent market intelligence.',
        'Include:',
        '- Brand health assessment (how is Invoica positioned vs competitors?)',
        '- Website strategy recommendations (based on competitor site analysis)',
        '- Social media content strategy for the coming week',
        '- Product pipeline recommendations (features or products to consider)',
        '- Any marketing budget recommendations (keep lean \u2014 we are pre-revenue)',
        '',
        'Output in the Weekly Strategy Report format.',
      ].join('\n'),

      'brand-review': [
        'Conduct a comprehensive brand review for Invoica (invoica.ai).',
        '',
        'Analyze:',
        '- Visual identity: how should our colors, typography, and design language feel?',
        '- Messaging: is our positioning ("Stripe for AI Agents") clear and differentiated?',
        '- Brand consistency: what guidelines should all materials follow?',
        '- Competitor branding: how do Stripe, Coinbase, and other fintech brands present?',
        '- Developer brand perception: what makes developer tools feel trustworthy?',
        '',
        'Note: The brand recently transitioned from "Countable" to "Invoica".',
        'Propose a complete brand guide with color palette, typography, voice, and visual style.',
      ].join('\n'),

      'product-proposal': [
        'Based on current market intelligence, propose a new product or feature',
        'for the Invoica platform.',
        '',
        additionalContext ? 'Focus area: ' + additionalContext : 'Identify the highest-impact market gap.',
        '',
        'Research the market thoroughly before proposing.',
        'Output in the Product Proposal format (use PROP-001 as the ID).',
        'Include real market data, competitor analysis, and revenue projections.',
      ].join('\n'),

      'x-admin-design': [
        'Design the complete specification for an X Admin Agent.',
        'This agent will manage Invoica\'s X/Twitter presence.',
        '',
        'Include in your specification:',
        '- Required X API v2 endpoints and permissions',
        '- OAuth 2.0 setup requirements',
        '- Content strategy: pillars, posting frequency, content mix',
        '- Posting schedule with optimal times for crypto/AI developer audience',
        '- Engagement rules: when to reply, retweet, like, or ignore',
        '- Content queue workflow: CMO designs content \u2192 CEO approves \u2192 Agent posts',
        '- Approval workflow integration with the orchestrator',
        '- Analytics: what metrics to track (impressions, engagement rate, follower growth)',
        '- Safety guardrails: rate limits, content filters, escalation rules',
        '- Technical implementation: agent.yaml and prompt.md structure',
        '',
        'This must be detailed enough for the Skills Agent to implement.',
      ].join('\n'),

      'website-audit': [
        'Analyze the ideal invoica.ai website strategy.',
        '',
        'Provide recommendations for:',
        '- Landing page: hero section, value proposition hierarchy, social proof, CTAs',
        '- Developer documentation: structure, navigation, getting-started flow',
        '- Pricing page: tier structure, free tier, usage-based pricing model',
        '- SEO strategy: target keywords, meta descriptions, content priorities',
        '- Conversion optimization: visitor \u2192 signup \u2192 active developer pipeline',
        '',
        'Compare to competitor websites:',
        '- stripe.com (gold standard for developer payments)',
        '- coinbase.com/commerce (crypto payments)',
        '- vercel.com (developer tool branding excellence)',
        '',
        'Provide actionable wireframe descriptions for key pages.',
      ].join('\n'),
    };

    let prompt = taskInstructions[taskType];

    // Add existing context if available
    if (existingContext) {
      prompt += '\n\n## Previous Context\n' + existingContext;
    }

    // Add additional user context
    if (additionalContext && taskType !== 'product-proposal') {
      prompt += '\n\n## Additional Context from CEO\n' + additionalContext;
    }

    return prompt;
  }

  /**
   * Gather relevant context from existing reports for continuity.
   */
  private gatherContext(taskType: CMOTaskType): string {
    const sections: string[] = [];

    // Brand guidelines (if they exist)
    const brandPath = join(this.projectRoot, 'docs/brand-guidelines.md');
    if (existsSync(brandPath)) {
      const content = readFileSync(brandPath, 'utf-8');
      sections.push('### Existing Brand Guidelines (summary)\n' + content.substring(0, 2000));
    }

    // For strategy reports, attach recent market watches
    if (taskType === 'strategy-report') {
      const recentReports = this.getRecentReports('market-watch', 5);
      if (recentReports.length > 0) {
        sections.push('### Recent Market Watch Reports');
        for (const report of recentReports) {
          const summary = this.extractSection(report.content, 'Executive Summary');
          sections.push('**' + report.date + '**: ' + (summary || report.content.substring(0, 300)));
        }
      }
    }

    // For product proposals, attach latest strategy report
    if (taskType === 'product-proposal') {
      const latestStrategy = join(this.reportsDir, 'latest-strategy-report.md');
      if (existsSync(latestStrategy)) {
        const content = readFileSync(latestStrategy, 'utf-8');
        sections.push('### Latest Strategy Report\n' + content.substring(0, 2000));
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Get recent reports of a given type, sorted by date descending.
   */
  private getRecentReports(taskType: string, count: number): Array<{ date: string; content: string }> {
    if (!existsSync(this.reportsDir)) return [];

    const files = readdirSync(this.reportsDir)
      .filter(f => f.startsWith(taskType + '-') && f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, count);

    return files.map(f => ({
      date: f.replace(taskType + '-', '').replace('.md', ''),
      content: readFileSync(join(this.reportsDir, f), 'utf-8'),
    }));
  }

  /**
   * Extract a specific markdown section from content.
   */
  private extractSection(content: string, sectionName: string): string | null {
    const regex = new RegExp('## ' + sectionName + '\\n([\\s\\S]*?)(?=\\n## |$)');
    const match = content.match(regex);
    return match ? match[1].trim().substring(0, 500) : null;
  }

  /**
   * Save report to dated file.
   */
  private saveReport(taskType: CMOTaskType, content: string): string {
    const date = new Date().toISOString().split('T')[0];

    // Product proposals go to proposals/ directory with PROP-NNN numbering
    if (taskType === 'product-proposal') {
      const proposalsDir = join(this.reportsDir, 'proposals');
      mkdirSync(proposalsDir, { recursive: true });
      const existingProposals = readdirSync(proposalsDir).filter(f => f.startsWith('PROP-')).length;
      const propNum = String(existingProposals + 1).padStart(3, '0');
      const propPath = join(proposalsDir, `PROP-${propNum}-${date}.md`);
      writeFileSync(propPath, content);
      return propPath;
    }

    const filename = taskType + '-' + date + '.md';
    const filepath = join(this.reportsDir, filename);
    writeFileSync(filepath, content);
    return filepath;
  }

  /**
   * Update the "latest" pointer file for orchestrator consumption.
   */
  private updateLatestReport(taskType: CMOTaskType, reportPath: string): void {
    const latestPath = join(this.reportsDir, 'latest-' + taskType + '.md');
    const content = readFileSync(reportPath, 'utf-8');
    writeFileSync(latestPath, content);
    log(c.gray, '  Updated latest pointer: latest-' + taskType + '.md');
  }
}

// ===== CLI Entry Point =====

async function main() {
  const taskType = process.argv[2] as CMOTaskType;
  const additionalContext = process.argv.slice(3).join(' ') || undefined;

  if (!taskType || !VALID_TASKS.includes(taskType)) {
    console.log('Usage: npx ts-node scripts/run-cmo.ts <task-type> [context]');
    console.log('');
    console.log('Task types:');
    console.log('  market-watch      Daily competitive intelligence');
    console.log('  strategy-report   Weekly strategy and brand report');
    console.log('  brand-review      Brand assessment and guidelines');
    console.log('  product-proposal  New product proposal (pass focus as context)');
    console.log('  x-admin-design    X Admin Agent specification');
    console.log('  website-audit     Website strategy review');
    console.log('');
    console.log('Examples:');
    console.log('  npx ts-node scripts/run-cmo.ts market-watch');
    console.log('  npx ts-node scripts/run-cmo.ts product-proposal "agent-to-agent marketplace"');
    process.exit(1);
  }

  try {
    const runner = new CMORunner();
    const reportPath = await runner.run(taskType, additionalContext);

    log(c.green, '\n' + '='.repeat(60));
    log(c.green, '  CMO task complete: ' + taskType);
    log(c.green, '  Report: ' + reportPath);
    log(c.green, '='.repeat(60) + '\n');

    process.exit(0);
  } catch (error: any) {
    log(c.red, '\n[cmo] FAILED: ' + error.message);
    if (error.stack) {
      log(c.gray, error.stack);
    }
    process.exit(1);
  }
}

main();
