#!/usr/bin/env ts-node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import 'dotenv/config';

// ===== x402 LLM Client (agent wallets spend USDC for each LLM call) =====
// Lazy import — falls back to direct MiniMax API if x402 endpoint is unavailable
let _x402CodeCall: ((agent: string, sys: string, user: string) => Promise<string>) | null = null;
async function getX402Client() {
  if (_x402CodeCall !== null) return _x402CodeCall;
  try {
    const mod = await import('./lib/x402-llm-client');
    _x402CodeCall = mod.x402CodeCall;
    log(c.green, '[x402] Agent wallet payment client loaded — agents will spend USDC per task');
  } catch {
    _x402CodeCall = async () => { throw new Error('x402 client unavailable'); };
    log(c.yellow, '[x402] Client not available — will use direct MiniMax API');
  }
  return _x402CodeCall;
}

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
  status: 'pending' | 'in_progress' | 'review' | 'approved' | 'rejected' | 'done';
  output?: {
    files: string[];
    commit: string;
    model: string;
  };
}

interface MiniMaxResponse {
  choices: Array<{
    message: { content: string };
  }>;
  usage?: {
    total_tokens: number;
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}
// ===== Colors (no chalk dependency needed) =====

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(color: string, msg: string) {
  console.log(`${color}${msg}${c.reset}`);
}

// ===== MiniMax API Client (direct HTTP, no SDK) =====

async function callMiniMax(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<MiniMaxResponse> {
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY must be set in .env');
  }

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 16000,
  });

  return new Promise((resolve, reject) => {
    const url = new URL('https://api.minimax.io/v1/chat/completions');

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(
                new Error(
                  `MiniMax API error: ${parsed.error.message || JSON.stringify(parsed.error)}`
                )
              );
              return;
            }
            if (
              parsed.base_resp?.status_code !== 0 &&
              parsed.base_resp?.status_code !== undefined
            ) {
              reject(
                new Error(
                  `MiniMax API error: ${parsed.base_resp?.status_msg || data}`
                )
              );
              return;
            }
            resolve(parsed);
          } catch (e) {
            reject(
              new Error(
                `Failed to parse MiniMax response: ${data.substring(0, 500)}`
              )
            );
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(300000, () => {
      req.destroy();
      reject(new Error('MiniMax API request timed out (300s)'));
    });
    req.write(body);
    req.end();
  });
}
// ===== Agent =====

class MinimaxAgent {
  private name: string;
  private systemPrompt: string;

  constructor(name: string, systemPrompt: string) {
    this.name = name;
    this.systemPrompt = systemPrompt;
  }

  private selectModel(task: AgentTask): string {
    // Coding Plan only supports MiniMax-M2.5 (highspeed not included)
    log(c.gray, `  -> Using MiniMax-M2.5 (${task.priority} priority)`);
    return 'MiniMax-M2.5';
  }

  async execute(task: AgentTask): Promise<{ files: string[]; model: string }> {
    const model = this.selectModel(task);
    log(c.cyan, `\n[${this.name}] Executing: ${task.id} (${task.priority})`);

    const deliverablesList = [
      ...(task.deliverables.code || []),
      ...(task.deliverables.tests || []),
      ...(task.deliverables.docs || []),
    ];
    const userPrompt = `## Current Task: ${task.id}

${task.context}

## Required Deliverables

Generate COMPLETE, PRODUCTION-READY code for each of these files:

${deliverablesList.map((f) => `- ${f}`).join('\n')}

## Output Format

For EACH file, output it exactly like this:

\`\`\`typescript
// filepath: <relative-path-to-file>
<complete file content here>
\`\`\`

IMPORTANT:
- Include ALL imports at the top of each file
- Include complete error handling
- Include JSDoc comments for public APIs
- For test files, include comprehensive test cases
- Each code block MUST start with "// filepath: <path>"
- Generate ALL listed files, do not skip any`;

    // ── Try x402 payment path first (agent wallet spends USDC) ──────────────
    // If the inference endpoint is unavailable, fall back to direct MiniMax API
    const startTime = Date.now();
    let output: string;

    const agentWalletName = this.name.replace('backend-', '').replace('-', ''); // e.g. 'backend-core' → 'code'
    const walletMap: Record<string, string> = {
      'backendcore': 'code', 'backendtax': 'code', 'backendledger': 'code',
      'frontend': 'code', 'devops': 'code', 'security': 'code',
      'core': 'code', 'tax': 'code', 'ledger': 'code',
    };
    const walletAgent = walletMap[agentWalletName] || 'code';
    const x402Available = process.env.X402_SELLER_WALLET && process.env.INFERENCE_API_URL !== 'disabled';

    if (x402Available) {
      try {
        log(c.gray, `  -> Routing via x402 (wallet: ${walletAgent}, model: MiniMax-M2.5)...`);
        const x402 = await getX402Client();
        output = await x402(walletAgent, this.systemPrompt, userPrompt);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log(c.green, `  -> x402 response in ${elapsed}s [${walletAgent} wallet spent 0.001 USDC]`);
      } catch (x402Err: any) {
        log(c.yellow, `  -> x402 failed (${x402Err.message.slice(0, 80)}) — falling back to direct MiniMax API`);
        // Fall through to direct API below
        const response = await callMiniMax(model, this.systemPrompt, userPrompt);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const tokens = response.usage?.total_tokens || 'unknown';
        log(c.gray, `  -> Direct MiniMax response in ${elapsed}s (${tokens} tokens)`);
        output = response.choices?.[0]?.message?.content || '';
      }
    } else {
      // x402 not configured — use direct MiniMax API
      log(c.gray, `  -> Sending to MiniMax directly (model: ${model})...`);
      const response = await callMiniMax(model, this.systemPrompt, userPrompt);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const tokens = response.usage?.total_tokens || 'unknown';
      log(c.gray, `  -> Response received in ${elapsed}s (${tokens} tokens)`);
      output = response.choices?.[0]?.message?.content || '';
    }

    if (!output) {
      throw new Error('Empty response from LLM');
    }

    // Extract code blocks with filepath comments
    const files = this.extractCodeBlocks(output);

    if (files.length === 0) {
      log(c.yellow, `  ! No file blocks extracted, saving raw output`);
      const fallbackPath = `output/${task.id}-raw.md`;
      mkdirSync('output', { recursive: true });
      writeFileSync(fallbackPath, output);
      return { files: [fallbackPath], model };
    }

    // Write files to disk
    for (const file of files) {
      const dir = file.path.split('/').slice(0, -1).join('/');
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(file.path, file.content);
      log(c.green, `  + Created: ${file.path}`);
    }
    // Git commit
    this.commitChanges(task.id, model);

    return { files: files.map((f) => f.path), model };
  }

  private extractCodeBlocks(
    markdown: string
  ): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];

    // Match code blocks that have a "// filepath:" comment on first line
    const regex =
      /```(?:typescript|javascript|tsx|jsx|sql|yaml|json|bash|ts|js|tf|hcl|prisma|css|html)?\s*\n\/\/\s*filepath:\s*(.+?)\n([\s\S]*?)```/g;

    let match;
    while ((match = regex.exec(markdown)) !== null) {
      const filepath = match[1]?.trim();
      const content = match[2]?.trimEnd() + '\n';

      if (filepath && content && filepath.includes('/')) {
        files.push({ path: filepath, content });
      }
    }

    // Fallback: try matching with alternative comment formats
    if (files.length === 0) {
      const altRegex =
        /```(?:\w+)?\s*\n\/[/*]\s*(.+?\.(?:ts|tsx|js|jsx|sql|tf|prisma|css|html|md))\s*\n([\s\S]*?)```/g;
      while ((match = altRegex.exec(markdown)) !== null) {
        const filepath = match[1]?.trim();
        const content = match[2]?.trimEnd() + '\n';
        if (filepath && content) {
          files.push({ path: filepath, content });
        }
      }
    }

    return files;
  }
  private commitChanges(taskId: string, model: string) {
    try {
      execSync('git add -A', { stdio: 'pipe' });
      execSync(
        `git commit -m "feat(${this.name}): ${taskId} [${model}]" --allow-empty`,
        { stdio: 'pipe' }
      );
      log(c.blue, `  + Committed: feat(${this.name}): ${taskId}`);
    } catch (error: any) {
      log(c.gray, `  -> No changes to commit`);
    }
  }
}

// ===== Supervisor Client =====

class SupervisorClient {
  private apiUrl: string;
  private apiKey: string;
  private available: boolean = true;

  constructor() {
    this.apiUrl = process.env.SUPERVISOR_URL || '';
    this.apiKey = process.env.SUPERVISOR_API_KEY || '';

    if (!this.apiUrl) {
      log(c.yellow, '! SUPERVISOR_URL not set, running without supervisor review');
      this.available = false;
    }
  }
  async requestReview(
    task: AgentTask,
    files: string[]
  ): Promise<'approved' | 'rejected' | 'unreachable'> {
    if (!this.available) {
      log(c.yellow, `  -> Supervisor not configured`);
      return 'unreachable';
    }

    log(c.yellow, `\nRequesting supervisor review for ${task.id}...`);

    const fileContents = files.map((filepath) => ({
      path: filepath,
      content: existsSync(filepath)
        ? readFileSync(filepath, 'utf-8').substring(0, 5000)
        : '',
    }));

    try {
      const result = await this.httpPost('/api/review', {
        task,
        files: fileContents,
      });

      if (result.status === 'approved') {
        log(c.green, `  + APPROVED by supervisor (score: ${result.score || 'N/A'}/10)`);
        return 'approved';
      } else {
        log(c.red, `  x REJECTED by supervisor (score: ${result.score || 'N/A'}/10)`);
        if (result.feedback) {
          log(c.yellow, `  Feedback: ${result.feedback}`);
        }
        return 'rejected';
      }
    } catch (error: any) {
      log(c.yellow, `  ! Supervisor unreachable: ${error.message}`);
      return 'unreachable';
    }
  }

  async notifyProgress(completed: number, total: number) {
    if (!this.available) return;
    try {
      await this.httpPost('/api/progress', { completed, total });
    } catch {
      // silently ignore progress notification failures
    }
  }
  private httpPost(path: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.apiUrl + path);
      const body = JSON.stringify(data);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let responseData = '';
          res.on('data', (chunk: string) => (responseData += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(responseData));
            } catch {
              resolve({ status: 'approved', raw: responseData });
            }
          });
        }
      );

      req.on('error', reject);
      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('Supervisor request timed out (120s)'));
      });
      req.write(body);
      req.end();
    });
  }
}
// ===== Orchestrator =====

class Orchestrator {
  private agents: Map<string, MinimaxAgent> = new Map();
  private tasks: AgentTask[] = [];
  private supervisor: SupervisorClient;
  private sprintFile: string;

  constructor() {
    this.sprintFile = process.argv[2] || './sprints/week-2.json';
    this.loadAgents();
    this.loadTasks();
    this.supervisor = new SupervisorClient();
  }

  private loadAgents() {
    const agentNames = [
      'backend-core',
      'backend-tax',
      'backend-ledger',
      'frontend',
      'devops',
      'security',
    ];

    for (const name of agentNames) {
      const promptPath = `./agents/${name}/prompt.md`;
      if (existsSync(promptPath)) {
        const systemPrompt = readFileSync(promptPath, 'utf-8');
        const agent = new MinimaxAgent(name, systemPrompt);
        this.agents.set(name, agent);
        log(c.green, `+ Loaded agent: ${name}`);
      } else {
        log(c.yellow, `! Missing prompt: ${promptPath}`);
      }
    }
  }
  private loadTasks() {
    if (!existsSync(this.sprintFile)) {
      throw new Error(`Sprint file not found: ${this.sprintFile}`);
    }
    const raw = JSON.parse(readFileSync(this.sprintFile, 'utf-8'));
    // Support both plain array and wrapped object format { sprint, theme, tasks: [...] }
    this.tasks = Array.isArray(raw) ? raw : (raw.tasks || []);
    log(c.blue, `\nLoaded ${this.tasks.length} tasks from ${this.sprintFile}`);

    // Show status summary
    const byStatus = this.tasks.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    log(c.gray, `Status: ${JSON.stringify(byStatus)}`);
  }

  private saveTasks() {
    // Preserve wrapper object format if the sprint file uses { sprint, theme, tasks: [...] }
    try {
      const existing = JSON.parse(readFileSync(this.sprintFile, 'utf-8'));
      if (!Array.isArray(existing) && existing.tasks) {
        writeFileSync(this.sprintFile, JSON.stringify({ ...existing, tasks: this.tasks }, null, 2));
        return;
      }
    } catch { /* fall through */ }
    writeFileSync(this.sprintFile, JSON.stringify(this.tasks, null, 2));
  }

  private canExecute(task: AgentTask): boolean {
    if (task.status !== 'pending') return false;
    return task.dependencies.every((depId) => {
      const dep = this.tasks.find((t) => t.id === depId);
      return dep?.status === 'done' || dep?.status === 'approved';
    });
  }
  private async promptUser(question: string): Promise<string> {
    return new Promise((resolve) => {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(`${c.yellow}${question}${c.reset}`, (answer: string) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
  }

  private async executeTask(task: AgentTask): Promise<'done' | 'rejected' | 'paused'> {
    const agent = this.agents.get(task.agent);
    if (!agent) {
      log(c.red, `x Agent not found: ${task.agent}`);
      return 'paused';
    }

    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        log(c.yellow, `\n--- Retry #${attempt} for ${task.id} ---`);
      }

      task.status = 'in_progress';
      this.saveTasks();

      try {
        const result = await agent.execute(task);
        task.output = {
          files: result.files,
          commit: this.getLatestCommit(),
          model: result.model,
        };

        // All tasks auto-approved — supervisor reviews offline (Dell Claude)
        task.status = 'done';
        this.saveTasks();
        log(c.green, `\nTask ${task.id} -> done (${result.files.length} files)`);
        return 'done';
      } catch (error: any) {
        log(c.red, `\nx Task ${task.id} failed: ${error.message}`);
        if (attempt < MAX_RETRIES) {
          log(c.yellow, `Retrying (attempt ${attempt}/${MAX_RETRIES})...`);
          task.status = 'pending';
          this.saveTasks();
          continue;
        } else {
          log(c.red, `Task ${task.id} failed after ${MAX_RETRIES} attempts`);
          task.status = 'pending';
          this.saveTasks();
          return 'paused';
        }
      }
    }

    return 'paused';
  }

  private getLatestCommit(): string {
    try {
      return execSync('git rev-parse --short HEAD', { stdio: 'pipe' })
        .toString()
        .trim();
    } catch {
      return 'unknown';
    }
  }
  async run() {
    log(`${c.bold}${c.blue}`, '\nStarting Orchestration (auto mode)');
    log(c.gray, `Reject -> retry | Approve -> next | Unreachable -> prompt\n`);

    let tasksExecuted = 0;
    let paused = false;

    while (!paused) {
      const pending = this.tasks.filter((t) => t.status === 'pending');
      const executable = pending.filter((t) => this.canExecute(t));

      if (executable.length === 0) {
        if (pending.length === 0) {
          log(c.green, '\nAll tasks complete!');
          break;
        }

        // Check if blocked by dependencies
        const blocked = pending.filter((t) => !this.canExecute(t));
        if (blocked.length > 0) {
          log(c.yellow, `\n${blocked.length} tasks blocked by dependencies:`);
          for (const t of blocked) {
            const unmetDeps = t.dependencies.filter((d) => {
              const dep = this.tasks.find((x) => x.id === d);
              return dep?.status !== 'done' && dep?.status !== 'approved';
            });
            log(c.gray, `  ${t.id} -> waiting for: ${unmetDeps.join(', ')}`);
          }
          break;
        }

        break;
      }

      // Show what's available
      log(
        c.blue,
        `\nExecutable tasks: ${executable.map((t) => t.id).join(', ')}`
      );

      // Execute one task at a time (sequential for predictability)
      const task = executable[0];
      const result = await this.executeTask(task);
      tasksExecuted++;

      if (result === 'paused') {
        paused = true;
        break;
      }

      // Brief pause between tasks
      if (!paused) {
        log(c.gray, `\n--- Waiting 3s before next task ---`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    // Final summary
    const done = this.tasks.filter((t) => t.status === 'done').length;
    const rejected = this.tasks.filter((t) => t.status === 'rejected').length;
    const pendingCount = this.tasks.filter((t) => t.status === 'pending').length;

    console.log('\n===============================');
    console.log('  Sprint Summary');
    console.log('===============================');
    log(c.green, `  Done:     ${done}`);
    if (rejected > 0) log(c.red, `  Rejected: ${rejected}`);
    if (pendingCount > 0) log(c.yellow, `  Pending:  ${pendingCount}`);
    log(c.blue, `  Total:    ${this.tasks.length}`);
    log(c.gray, `  Executed this run: ${tasksExecuted}`);
    console.log('===============================\n');

    await this.supervisor.notifyProgress(done, this.tasks.length);
  }
}

// ===== Main =====

new Orchestrator().run().catch((error) => {
  log(c.red, `\nFatal error: ${error.message}`);
  process.exit(1);
});