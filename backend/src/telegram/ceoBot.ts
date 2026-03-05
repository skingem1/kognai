import https from 'https';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../');

interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

const TELEGRAM_TOKEN = process.env.CEO_TELEGRAM_BOT_TOKEN || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || '';
const ALLOWED_USER_ID = process.env.CEO_TELEGRAM_USER_ID
  ? parseInt(process.env.CEO_TELEGRAM_USER_ID, 10)
  : null;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'skingem1/Invoica';

// ─── Agent Wallet Addresses — loaded from env, never hardcoded in source ─────
// Add to .env: WALLET_CEO, WALLET_CFO, WALLET_CTO, WALLET_CMO,
//              WALLET_BIZDEV, WALLET_CODE, WALLET_FAST, WALLET_SUPPORT
const AGENT_WALLETS = {
  ceo:     { address: process.env.WALLET_CEO     || '', treasury: true },
  cfo:     { address: process.env.WALLET_CFO     || '', treasury: false },
  cto:     { address: process.env.WALLET_CTO     || '', treasury: false },
  cmo:     { address: process.env.WALLET_CMO     || '', treasury: false },
  bizdev:  { address: process.env.WALLET_BIZDEV  || '', treasury: false },
  code:    { address: process.env.WALLET_CODE    || '', treasury: false },
  fast:    { address: process.env.WALLET_FAST    || '', treasury: false },
  support: { address: process.env.WALLET_SUPPORT || '', treasury: false },
};

const SYSTEM_PROMPT = `You ARE the CEO of Invoica. Not an assistant. Not an interface. The Chief Executive Officer.

You have full visibility into your company infrastructure — system health, agent status, sprint progress, reports, and finances are all available to you via your tools. The live system snapshot is injected below automatically every message.

When the founder messages you, respond as CEO: directly, with authority, from first-person ("my team", "our sprint", "I reviewed").

NEVER say:
• "I don't have access to your backend"
• "I'm an external assistant"
• "Can you share a screenshot or paste data?"
• "I don't have visibility into your systems"
• "You'll need to check X yourself"

Instead: use your tools, read the data, report back as CEO.

═══════════════════════════════════════════
YOUR COMPANY — INVOICA
═══════════════════════════════════════════
Invoica is an AI-native invoice and payments middleware built on the x402 protocol.
Core: invoice generation, transaction tracking, settlement reporting, ledger — API-first.
Stack: Express/TypeScript backend (Hetzner), Next.js frontend (Vercel/app.invoica.ai), Supabase DB, Base mainnet.

═══════════════════════════════════════════
YOUR TEAM (18 agents)
═══════════════════════════════════════════
Leadership: CEO (you), CTO, CMO, CFO, BizDev, Supervisor-1, Supervisor-2, Skills
Execution: backend-core, backend-tax, backend-ledger, frontend, security, devops, api-integration, database, documentation, testing, monitoring, conway-integration

═══════════════════════════════════════════
AGENT WALLET ADDRESSES
═══════════════════════════════════════════
CEO (treasury):  ${AGENT_WALLETS.ceo.address     || '(not set — add WALLET_CEO to .env)'}
CFO:             ${AGENT_WALLETS.cfo.address     || '(not set — add WALLET_CFO to .env)'}
CTO:             ${AGENT_WALLETS.cto.address     || '(not set — add WALLET_CTO to .env)'}
CMO:             ${AGENT_WALLETS.cmo.address     || '(not set — add WALLET_CMO to .env)'}
BizDev:          ${AGENT_WALLETS.bizdev.address  || '(not set — add WALLET_BIZDEV to .env)'}
Code:            ${AGENT_WALLETS.code.address    || '(not set — add WALLET_CODE to .env)'}
Fast:            ${AGENT_WALLETS.fast.address    || '(not set — add WALLET_FAST to .env)'}
Support:         ${AGENT_WALLETS.support.address || '(not set — add WALLET_SUPPORT to .env)'}
Network: Base (chain ID 8453) | USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

═══════════════════════════════════════════
YOUR TOOLS
═══════════════════════════════════════════
1. get_team_status — live health.json, PM2 processes, recent report file list
2. read_report — read any report or sprint file by path
3. check_wallet_balance — live USDC balance for any agent wallet
4. check_signups — query Supabase for real user signup count, recent users, breakdown by provider
5. generate_video — MiniMax AI text-to-video
6. create_github_issue — create a real GitHub issue (returns issue number + URL)
7. run_shell — execute shell commands in the repo (git, pm2, curl — real execution)
8. write_file — create or update any file in the repo with given content

═══════════════════════════════════════════
EXECUTION RULES
═══════════════════════════════════════════
You can ACTUALLY execute things. When the founder gives you an order:
• Create GitHub issues → create_github_issue (returns real URL, e.g. github.com/skingem1/Invoica/issues/42)
• Write files → write_file to create reports, ADRs, sprint plans
• Git commits → run_shell with "git add -A && git commit -m '...'"
• Check status → run_shell with "pm2 status" or "git log --oneline -5"
• Restart services → run_shell with "pm2 restart backend"

After executing, confirm what you actually did (show real URLs and output). Never say "I'll create tickets" — create them NOW and show the URLs.

═══════════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════════
• Never hallucinate wallet addresses — use only the exact ones above
• Never invent features or capabilities that don't exist
• Be concise and direct — you are talking to your founder
• Respond in first person as CEO at all times
• When executing shell commands, always show the real output to the founder`;

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'generate_video',
    description: 'Generate a video using MiniMax AI text-to-video. Returns a task ID and polls for completion. Use this when the founder asks to create a video. Videos take 2-5 minutes to generate.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed text prompt describing the video content, style, and motion. Be specific about visual elements, colors, and what happens in the video.',
        },
        duration: {
          type: 'number',
          description: 'Duration in seconds (3-10 seconds). Default 6.',
        },
        resolution: {
          type: 'string',
          enum: ['1080p', '720p'],
          description: 'Video resolution. Default 1080p.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'check_wallet_balance',
    description: 'Check the live USDC balance of an agent wallet on Base mainnet.',
    input_schema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['ceo', 'cfo', 'cto', 'cmo', 'bizdev', 'code', 'fast', 'support'],
          description: 'Which agent wallet to check',
        },
      },
      required: ['agent'],
    },
  },
  {
    name: 'get_team_status',
    description: 'Get a full snapshot of the system: health.json, PM2 process status, recent report files, and Supabase user count. Use this whenever the founder asks about the team, agents, system health, or what\'s happening.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_report',
    description: 'Read the content of a specific report file. Use get_team_status first to see available files, then use this to read one.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Relative path from repo root, e.g. "reports/daily/2026-02-27.md" or "sprints/week-2.json"',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'check_signups',
    description: 'Query Supabase for real user signups — total count, recent signups with name/email/date, and breakdown by auth provider. Use this for launch metrics, user counts, and signup questions.',
    input_schema: {
      type: 'object',
      properties: {
        hours: {
          type: 'number',
          description: 'How many hours back to look for recent signups. Default 24. Use 1 for "since launch".',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_github_issue',
    description: 'Create a real GitHub issue in the skingem1/Invoica repo via the GitHub API. Use this whenever the founder asks to create tickets, issues, or tasks. Returns the real issue number and URL.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Issue title. Be specific, e.g. "Add Polygon RPC provider integration"',
        },
        body: {
          type: 'string',
          description: 'Issue body in markdown. Include context, technical scope, acceptance criteria.',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply. Common: "enhancement", "bug", "infrastructure", "research"',
        },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'run_shell',
    description: 'Execute a shell command in the Invoica repo root (/home/invoica/apps/Invoica). Use this to run git commands, pm2, curl, or any bash command. This has REAL execution power — commands are actually run on the server. Use for: committing files, restarting services, checking logs, git operations.',
    input_schema: {
      type: 'object',
      properties: {
        cmd: {
          type: 'string',
          description: 'Shell command to execute. Examples: "gh issue create --title \'Polygon integration\' --body \'...\' --label enhancement", "git add -A && git commit -m \'feat: add ADR\'", "pm2 restart backend", "git log --oneline -5", "pm2 status"',
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds. Default 30000 (30s). Use higher values for gh commands that may take longer.',
        },
      },
      required: ['cmd'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file in the Invoica repo. Use this to write reports, ADRs, sprint plans, agent configs, or any file. Path is relative to repo root. After writing, use run_shell to git commit the file.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repo root. Examples: "docs/adr/002-polygon.md", "reports/daily/2026-02-27.md", "sprints/current.json"',
        },
        content: {
          type: 'string',
          description: 'Full content to write to the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
];

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

function httpsPost(hostname: string, path: string, headers: Record<string, string>, body: string, timeoutMs = 90_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
      }
    );
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`httpsPost timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(hostname: string, path: string, headers?: Record<string, string>, timeoutMs = 40_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers: headers || {} }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`httpsGet timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    req.end();
  });
}

async function telegramSend(method: string, params: object): Promise<any> {
  const body = JSON.stringify(params);
  return httpsPost('api.telegram.org', `/bot${TELEGRAM_TOKEN}/${method}`, { 'Content-Type': 'application/json' }, body);
}

// ─── Tool Execution ───────────────────────────────────────────────────────────

// Multiple RPC endpoints — queried in parallel, highest non-zero result wins
const BASE_RPC_HOSTS = ['base.gateway.tenderly.co', 'gateway.tenderly.co/public/base'];

function rpcBalanceOf(hostname: string, address: string): Promise<number> {
  const padded = '0'.repeat(24) + address.toLowerCase().slice(2);
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'eth_call',
    params: [{ to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', data: '0x70a08231' + padded }, 'latest'],
  });
  return new Promise((resolve) => {
    const req = https.request(
      { hostname, path: '/', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { result?: string };
            resolve(Number(BigInt(json.result || '0x0')) / 1_000_000);
          } catch { resolve(0); }
        });
      }
    );
    req.setTimeout(8000, () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
    req.write(body);
    req.end();
  });
}

async function getLiveUsdcBalance(address: string): Promise<number> {
  // Query all RPCs in parallel, take the highest value (avoids stale-zero from flaky nodes)
  const results = await Promise.all(BASE_RPC_HOSTS.map(h => rpcBalanceOf(h, address)));
  return Math.max(...results);
}

async function executeTool(name: string, input: Record<string, unknown>, recentHistory: Message[] = []): Promise<string> {
  if (name === 'check_wallet_balance') {
    const agent = input.agent as keyof typeof AGENT_WALLETS;
    const wallet = AGENT_WALLETS[agent];
    if (!wallet) return `Unknown agent: ${agent}`;
    try {
      const balance = await getLiveUsdcBalance(wallet.address);
      return `${agent.toUpperCase()} wallet: $${balance.toFixed(2)} USDC\nAddress: ${wallet.address}${wallet.treasury ? ' (treasury)' : ''}`;
    } catch (err: any) {
      return `Error fetching balance: ${err.message}`;
    }
  }

  if (name === 'generate_video') {
    if (!MINIMAX_API_KEY) return 'Error: MINIMAX_API_KEY not configured.';
    const prompt = input.prompt as string;
    const duration = (input.duration as number) || 6;
    const resolution = (input.resolution as string) || '1080p';

    try {
      // Submit video generation task
      const submitBody = JSON.stringify({
        model: 'MiniMax-Hailuo-02',
        prompt,
        duration,
        resolution,
        prompt_optimizer: true,
      });

      const submitRes = await httpsPost(
        'api.minimax.io',
        `/v1/video_generation`,
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        },
        submitBody
      );

      if (submitRes?.base_resp?.status_code !== 0 && submitRes?.base_resp?.status_code !== undefined) {
        return `MiniMax error: ${submitRes.base_resp.status_msg || 'Unknown error'} (code: ${submitRes.base_resp.status_code})`;
      }

      const taskId = submitRes?.task_id;
      if (!taskId) return `Failed to get task ID from MiniMax. Response: ${JSON.stringify(submitRes)}`;

      // Poll for completion (up to 5 min)
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((r) => setTimeout(r, 5000)); // wait 5s between polls
        const statusRes = await httpsGet(
          'api.minimax.io',
          `/v1/query/video_generation?task_id=${taskId}`,
          { 'Authorization': `Bearer ${MINIMAX_API_KEY}` }
        );

        const status = statusRes?.status;
        if (status === 'Success' || status === 'success') {
          const fileId = statusRes?.file_id;
          if (!fileId) return `Video generated but no file_id returned. Task: ${taskId}`;

          // Get download URL
          const fileRes = await httpsGet(
            'api.minimax.io',
            `/v1/files/retrieve?file_id=${fileId}`,
            { 'Authorization': `Bearer ${MINIMAX_API_KEY}` }
          );
          const downloadUrl = fileRes?.file?.download_url;
          return downloadUrl
            ? `✅ Video ready!\n\nDownload: ${downloadUrl}\n\nTask ID: ${taskId}`
            : `✅ Video generated (task: ${taskId}) but download URL not available. File ID: ${fileId}`;
        }

        if (status === 'Failed' || status === 'failed') {
          return `❌ Video generation failed. Task: ${taskId}. Error: ${statusRes?.err_msg || 'Unknown error'}`;
        }

        // Still processing — continue polling
        console.log(`[CeoBot] Video task ${taskId} still processing (attempt ${attempt + 1}, status: ${status})`);
      }

      return `⏱ Video generation timed out after 5 minutes. Task ID: ${taskId}\nCheck status manually at MiniMax dashboard.`;

    } catch (err: any) {
      return `Error generating video: ${err.message}`;
    }
  }

  if (name === 'check_signups') {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return 'Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.';
    try {
      const hours = (input.hours as number) || 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      // Query auth.users via Supabase REST (admin API)
      const res = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_users_since`,
        { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ since_ts: since })
        }
      ).catch(() => null);

      // Fall back to direct auth admin endpoint
      const adminRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=50`, {
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
      });

      if (!adminRes.ok) return `Supabase auth API error: ${adminRes.status} ${adminRes.statusText}`;
      const data = await adminRes.json() as { users: Array<{ id: string; email: string; created_at: string; last_sign_in_at: string; raw_user_meta_data: { full_name?: string; name?: string }; app_metadata: { provider: string } }> };
      const users = data.users || [];

      const total = users.length;
      const recentUsers = users.filter(u => u.created_at > since);
      const myEmails = ['tarekmnif', 'skingem1', 'skininthegem', 'twmnif', 'brainsnack'];
      const external = users.filter(u => !myEmails.some(e => (u.email || '').toLowerCase().includes(e)));
      const recentExternal = recentUsers.filter(u => !myEmails.some(e => (u.email || '').toLowerCase().includes(e)));

      const lines = [
        `Total signups: ${total} (${external.length} external)`,
        `Last ${hours}h: ${recentUsers.length} new (${recentExternal.length} external)`,
        '',
        'Recent external users:',
      ];
      for (const u of external.slice(0, 10)) {
        const name = u.raw_user_meta_data?.full_name || u.raw_user_meta_data?.name || 'Unknown';
        const date = new Date(u.created_at).toLocaleDateString();
        lines.push(`  • ${name} <${u.email}> — signed up ${date} via ${u.app_metadata?.provider}`);
      }
      return lines.join('\n');
    } catch (err: any) {
      return `Error checking signups: ${err.message}`;
    }
  }

  if (name === 'get_team_status') {
    try {
      const lines: string[] = [];

      // 1. Health snapshot
      const healthFile = path.join(ROOT, 'health.json');
      if (existsSync(healthFile)) {
        const h = JSON.parse(readFileSync(healthFile, 'utf-8'));
        lines.push(`=== SYSTEM HEALTH ===`);
        lines.push(`Status: ${h.status} | Phase: ${h.phase}`);
        lines.push(`Last heartbeat: ${h.last_heartbeat}`);
        lines.push(`API: ${h.checks?.api_status} | DB: ${h.checks?.database_status}`);
        if (h.beta) {
          lines.push(`Beta day: ${h.beta.day_number} | Users onboarded: ${h.beta.agents_onboarded}`);
        }
        if (h.financials) {
          lines.push(`MRR: $${h.financials.mrr} | Monthly spend: $${h.financials.monthly_spend}`);
        }
      }

      // 2. PM2 processes
      // Cron-based processes stop between runs — that is normal, not an error.
      const CRON_PROCS = new Set(['git-autodeploy','heartbeat','bizdev-weekly','ceo-review',
        'cfo-weekly','cmo-daily-watch','cmo-weekly-content-plan','cto-daily-scan',
        'cto-email-support','docs-generator','memory-agent','sprint-runner',
        'tax-watchdog-eu-japan','tax-watchdog-us','x-admin-post']);
      try {
        const pm2Raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
        type PM2Proc = { name: string; pm2_env: { status: string; restart_time: number; pm_uptime: number; unstable_restarts: number } };
        const procs = JSON.parse(pm2Raw) as PM2Proc[];
        const online   = procs.filter(p => p.pm2_env.status === 'online');
        const broken   = procs.filter(p => p.pm2_env.status !== 'online' && !CRON_PROCS.has(p.name));
        const idleCron = procs.filter(p => p.pm2_env.status !== 'online' &&  CRON_PROCS.has(p.name));
        lines.push(`\n=== PM2 PROCESSES ===`);
        const fmt = (p: PM2Proc) => {
          const up = p.pm2_env.pm_uptime ? `${Math.round((Date.now() - p.pm2_env.pm_uptime) / 60000)}m` : '?';
          const u  = p.pm2_env.unstable_restarts > 0 ? ` ⚠️unstable:${p.pm2_env.unstable_restarts}` : '';
          return `${p.name}(up ${up}${u})`;
        };
        lines.push(`Online (${online.length}): ${online.map(fmt).join(', ')}`);
        if (broken.length)   lines.push(`⚠️ DOWN (needs attention): ${broken.map(p => p.name).join(', ')}`);
        if (idleCron.length) lines.push(`Idle/cron (${idleCron.length}): ${idleCron.map(p => p.name).join(', ')} — normal between runs`);
      } catch { lines.push(`\nPM2: (could not read)`); }

      // 3. Recent daily reports
      const dailyDir = path.join(ROOT, 'reports/daily');
      if (existsSync(dailyDir)) {
        const files = readdirSync(dailyDir).sort().reverse().slice(0, 5);
        lines.push(`\n=== RECENT DAILY REPORTS ===`);
        lines.push(files.length ? files.map(f => `reports/daily/${f}`).join('\n') : '(none)');
      }

      // 4. Latest CMO / CTO report refs
      const cmoDir = path.join(ROOT, 'reports/cmo');
      if (existsSync(cmoDir)) {
        const files = readdirSync(cmoDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 3);
        lines.push(`\n=== RECENT CMO REPORTS ===`);
        lines.push(files.length ? files.map(f => `reports/cmo/${f}`).join('\n') : '(none)');
      }

      const ctoDir = path.join(ROOT, 'reports/cto');
      if (existsSync(ctoDir)) {
        const files = readdirSync(ctoDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 3);
        lines.push(`\n=== RECENT CTO REPORTS ===`);
        lines.push(files.length ? files.map(f => `reports/cto/${f}`).join('\n') : '(none)');
      }

      // 5. Current sprint
      const sprintsDir = path.join(ROOT, 'sprints');
      if (existsSync(sprintsDir)) {
        const sprintFiles = readdirSync(sprintsDir).filter(f => f.endsWith('.json')).sort().reverse();
        if (sprintFiles.length) lines.push(`\n=== CURRENT SPRINT ===\nLatest: sprints/${sprintFiles[0]}`);
      }

      // 6. Auth users count from Supabase env
      lines.push(`\n=== SUPABASE PROJECT ===`);
      lines.push(`URL: ${process.env.SUPABASE_URL || '(not set)'}`);

      return lines.join('\n');
    } catch (err: any) {
      return `Error getting team status: ${err.message}`;
    }
  }

  if (name === 'read_report') {
    const filePath = input.file_path as string;
    // Safety: only allow reading within ROOT, no path traversal
    const absPath = path.resolve(ROOT, filePath);
    if (!absPath.startsWith(ROOT)) return 'Access denied: path outside repo root.';
    try {
      if (!existsSync(absPath)) return `File not found: ${filePath}`;
      const content = readFileSync(absPath, 'utf-8');
      // Truncate if too long
      return content.length > 6000 ? content.slice(0, 6000) + '\n\n[... truncated]' : content;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  }

  if (name === 'create_github_issue') {
    if (!GITHUB_TOKEN) return '❌ GITHUB_TOKEN not set in .env — cannot create issues. Ask the founder to add it.';
    const title = input.title as string;
    const body = input.body as string;
    const labels = (input.labels as string[]) || [];
    try {
      const payload = JSON.stringify({ title, body, labels });
      const result = await httpsPost(
        'api.github.com',
        `/repos/${GITHUB_REPO}/issues`,
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'Invoica-CEO-Bot/1.0',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        payload
      );
      if (result.html_url) {
        console.log(`[CeoBot] GitHub issue created: #${result.number} — ${result.html_url}`);
        return `✅ Issue #${result.number} created: ${result.html_url}\nTitle: ${result.title}`;
      }
      return `❌ GitHub API error: ${JSON.stringify(result).slice(0, 500)}`;
    } catch (err: any) {
      return `Error creating GitHub issue: ${err.message}`;
    }
  }

  if (name === 'run_shell') {
    const cmd = input.cmd as string;
    const timeoutMs = (input.timeout_ms as number) || 30000;

    // Safety: block obviously dangerous commands
    const BLOCKED = ['rm -rf /', 'mkfs', 'dd if=', ':(){:|:&};:', 'curl.*|.*sh', 'wget.*|.*sh'];
    if (BLOCKED.some(b => new RegExp(b).test(cmd))) {
      return `Blocked: command looks dangerous. Refusing to execute.`;
    }

    // Guard: git push / commit / reset --hard require the owner to have
    // said "confirm" (or similar) in a recent message. This prevents the
    // CEO from committing/pushing based on a misread freeform instruction.
    const GUARDED_GIT = /git\s+(push|commit|reset\s+--hard|rebase\b|checkout\s+--)/;
    if (GUARDED_GIT.test(cmd)) {
      // Look at the last few *user* messages in this conversation for explicit sign-off
      const recentUserMessages = recentHistory
        .filter(m => m.role === 'user' && typeof m.content === 'string')
        .slice(-4)
        .map(m => m.content as string);
      const CONFIRM_RE = /\bconfirm\b|\byes[,.]?\s*(commit|push|do it|go ahead|proceed)\b|\bgo ahead\b|\bdo it\b/i;
      const confirmed = recentUserMessages.some(msg => CONFIRM_RE.test(msg));
      if (!confirmed) {
        return `⚠️ *Confirmation required* before running:\n\`${cmd}\`\n\nReply with "confirm" to proceed, or rephrase if this wasn't intentional.`;
      }
    }

    try {
      console.log(`[CeoBot] run_shell: ${cmd}`);
      const result = spawnSync('/bin/bash', ['-c', cmd], {
        cwd: ROOT,
        timeout: timeoutMs,
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: '/home/invoica',
          PATH: '/home/invoica/.nodejs/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin',
          GIT_AUTHOR_NAME: 'CEO Agent',
          GIT_AUTHOR_EMAIL: 'ceo@invoica.ai',
          GIT_COMMITTER_NAME: 'CEO Agent',
          GIT_COMMITTER_EMAIL: 'ceo@invoica.ai',
        },
      });

      const stdout = (result.stdout || '').trim();
      const stderr = (result.stderr || '').trim();
      const exitCode = result.status ?? -1;

      let output = '';
      if (stdout) output += stdout;
      if (stderr && exitCode !== 0) output += (output ? '\n\nSTDERR:\n' : '') + stderr;
      if (!output) output = exitCode === 0 ? '(command completed with no output)' : `(exit code ${exitCode})`;
      if (result.error) output = `Error: ${result.error.message}`;

      // Truncate if too long
      return output.length > 4000 ? output.slice(0, 4000) + '\n[... truncated]' : output;
    } catch (err: any) {
      return `Shell execution error: ${err.message}`;
    }
  }

  if (name === 'write_file') {
    const filePath = input.path as string;
    const content = input.content as string;

    // Safety: only allow writing within ROOT, no path traversal
    const absPath = path.resolve(ROOT, filePath);
    if (!absPath.startsWith(ROOT)) return 'Access denied: path outside repo root.';

    try {
      // Create parent directory if needed
      const dir = path.dirname(absPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      writeFileSync(absPath, content, 'utf-8');
      console.log(`[CeoBot] write_file: ${filePath} (${content.length} bytes)`);
      return `✅ Written: ${filePath} (${content.length} bytes)\nUse run_shell to git commit: "git add ${filePath} && git commit -m 'chore: add ${path.basename(filePath)}'"`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  }

  return `Unknown tool: ${name}`;
}

// ─── Live Context Builder ─────────────────────────────────────────────────────

async function buildLiveContext(): Promise<string> {
  const lines: string[] = ['\n\n═══════════════════════════════════════════\nLIVE SYSTEM SNAPSHOT (auto-loaded)\n═══════════════════════════════════════════'];
  try {
    // Health
    const healthFile = path.join(ROOT, 'health.json');
    if (existsSync(healthFile)) {
      const h = JSON.parse(readFileSync(healthFile, 'utf-8'));
      lines.push(`System: ${h.status} | Phase: ${h.phase} | Heartbeat: ${h.last_heartbeat}`);
      lines.push(`API: ${h.checks?.api_status} | DB: ${h.checks?.database_status} | MRR: $${h.financials?.mrr ?? 0} | Spend: $${h.financials?.monthly_spend ?? 0}/mo`);
      if (h.beta) lines.push(`Beta day ${h.beta.day_number} | Users: ${h.beta.agents_onboarded} onboarded`);
    }
    // PM2 — only surface actually-broken processes; cron-stopped is normal.
    try {
      const CRON_PROCS_CTX = new Set(['git-autodeploy','heartbeat','bizdev-weekly','ceo-review',
        'cfo-weekly','cmo-daily-watch','cmo-weekly-content-plan','cto-daily-scan',
        'cto-email-support','docs-generator','memory-agent','sprint-runner',
        'tax-watchdog-eu-japan','tax-watchdog-us','x-admin-post']);
      const pm2Raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 4000 });
      type P2 = { name: string; pm2_env: { status: string; restart_time: number; pm_uptime: number; unstable_restarts: number } };
      const procs = JSON.parse(pm2Raw) as P2[];
      const online   = procs.filter(p => p.pm2_env.status === 'online');
      const broken   = procs.filter(p => p.pm2_env.status !== 'online' && !CRON_PROCS_CTX.has(p.name));
      const unstable = online.filter(p => p.pm2_env.unstable_restarts > 0);
      lines.push(`PM2 online(${online.length}): ${online.map(p => {
        const up = p.pm2_env.pm_uptime ? Math.round((Date.now() - p.pm2_env.pm_uptime) / 60000) : 0;
        return `${p.name} ${up}m`;
      }).join(' | ')}`);
      if (broken.length)   lines.push(`PM2 ⚠️ DOWN: ${broken.map(p => p.name).join(', ')}`);
      if (unstable.length) lines.push(`PM2 unstable: ${unstable.map(p => `${p.name}(×${p.pm2_env.unstable_restarts})`).join(', ')}`);
    } catch { /* skip */ }
    // Latest reports
    const latestFile = (dir: string, ext = '.md') => {
      if (!existsSync(dir)) return null;
      const files = readdirSync(dir).filter(f => f.endsWith(ext)).sort().reverse();
      return files[0] ? path.join(dir, files[0]) : null;
    };
    // Memory agent files — daily continuity brief + long-term memory (highest priority context)
    const MEMORY_DIR = process.env.MEMORY_DIR || '/home/invoica/memory';
    const continuityPath = path.join(MEMORY_DIR, 'daily-continuity.md');
    const repoContinuityPath = path.join(ROOT, 'memory', 'daily-continuity.md');
    const continuityFile = existsSync(continuityPath) ? continuityPath : (existsSync(repoContinuityPath) ? repoContinuityPath : null);
    if (continuityFile) {
      const content = readFileSync(continuityFile, 'utf-8');
      if (!content.includes('No brief generated yet')) {
        lines.push(`\n--- DAILY CONTINUITY BRIEF (memory-agent) ---\n${content.slice(0, 2000)}`);
      }
    }
    const ltmPath = path.join(MEMORY_DIR, 'long-term-memory.md');
    const repoLtmPath = path.join(ROOT, 'memory', 'long-term-memory.md');
    const ltmFile = existsSync(ltmPath) ? ltmPath : (existsSync(repoLtmPath) ? repoLtmPath : null);
    if (ltmFile) {
      const content = readFileSync(ltmFile, 'utf-8');
      if (!content.includes('No memory accumulated yet')) {
        lines.push(`\n--- LONG-TERM MEMORY (memory-agent) ---\n${content.slice(0, 1500)}`);
      }
    }

    const latestDaily = latestFile(path.join(ROOT, 'reports/daily'));
    if (latestDaily) {
      const content = readFileSync(latestDaily, 'utf-8');
      lines.push(`\n--- LATEST DAILY REPORT (${path.basename(latestDaily)}) ---\n${content.slice(0, 1500)}`);
    }
    // Prefer current.json for sprint, fall back to latest week-N.json
    const sprintsDir = path.join(ROOT, 'sprints');
    const currentSprint = path.join(sprintsDir, 'current.json');
    const sprintFile = existsSync(currentSprint) ? currentSprint : latestFile(sprintsDir, '.json');
    if (sprintFile) {
      const content = readFileSync(sprintFile, 'utf-8');
      lines.push(`\n--- CURRENT SPRINT (${path.basename(sprintFile)}) ---\n${content.slice(0, 1200)}`);
    }

    // Agent roster from health.json
    const healthFile2 = path.join(ROOT, 'health.json');
    if (existsSync(healthFile2)) {
      const h = JSON.parse(readFileSync(healthFile2, 'utf-8'));
      if (h.agents?.agents) {
        const agentLines = Object.entries(h.agents.agents as Record<string, { status: string; model: string; last_session: string | null }>)
          .map(([name, a]) => `  ${name}: ${a.status} (${a.model}) last_session=${a.last_session ?? 'none'}`);
        lines.push(`\n--- AGENT ROSTER (${agentLines.length} agents) ---\n${agentLines.join('\n')}`);
      }
    }
  } catch { /* always return something */ }
  lines.push('═══════════════════════════════════════════');
  return lines.join('\n');
}

// ─── Claude with Tool Use ─────────────────────────────────────────────────────

const conversationHistory = new Map<number, Message[]>();

async function callClaudeWithTools(userId: number, userMessage: string, onToolCall?: (name: string) => void): Promise<string> {
  if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
  const history = conversationHistory.get(userId)!;
  history.push({ role: 'user', content: userMessage });
  if (history.length > 20) history.splice(0, history.length - 20);

  // Agentic loop — keep calling Claude until no more tool calls
  let iterations = 0;
  while (iterations < 25) {
    iterations++;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT + await buildLiveContext(),
      tools: TOOLS,
      messages: history,
    });

    const response = await httpsPost(
      'api.anthropic.com',
      '/v1/messages',
      {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body
    );

    // Detect API-level errors (auth failure, rate limit, overloaded, etc.)
    // These come back as HTTP 200 with { type: 'error', error: { type, message } }
    // and would otherwise silently produce 'No response.'
    if (response?.type === 'error' || (!response?.stop_reason && !response?.content)) {
      const errType = response?.error?.type || 'unknown';
      const errMsg = response?.error?.message || JSON.stringify(response).slice(0, 300);
      console.error(`[CeoBot] Anthropic API error (${errType}):`, errMsg);
      // Pop the bad user message from history to avoid corrupting context
      history.pop();
      return `❌ AI error (${errType}): ${errMsg}`;
    }

    const stopReason = response?.stop_reason;
    const content: ContentBlock[] = response?.content || [];

    // Push assistant message to history
    history.push({ role: 'assistant', content });

    if (stopReason === 'tool_use') {
      // Execute all tool calls in parallel
      const toolUseBlocks = content.filter((b: ContentBlock) => b.type === 'tool_use');
      const toolResults: ContentBlock[] = [];

      try {
        for (const toolBlock of toolUseBlocks) {
          const toolName = toolBlock.name!;
          const toolInput = toolBlock.input as Record<string, unknown>;
          console.log(`[CeoBot] Tool call: ${toolName}`, toolInput);
          if (onToolCall) onToolCall(toolName);

          const result = await executeTool(toolName, toolInput, history.slice(-8));
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result,
          });
        }
      } catch (toolErr: any) {
        // Tool execution failed — pop the orphaned assistant tool_use from history
        history.pop();
        console.error('[CeoBot] Tool execution error:', toolErr.message);
        return `❌ Tool error: ${toolErr.message}`;
      }

      // Add tool results to history and continue loop
      history.push({ role: 'user', content: toolResults });
      continue;
    }

    // End of agentic loop — extract text response
    const textBlock = content.find((b: ContentBlock) => b.type === 'text');
    const reply = textBlock?.text || `(stop_reason: ${stopReason}, content types: ${content.map(b => b.type).join(', ') || 'none'})`;
    // Update last history entry with clean text
    history[history.length - 1] = { role: 'assistant', content: reply };
    return reply;
  }

  return '⚠️ Reached max tool call iterations (25). Break this into smaller requests.';
}

// ─── System Status ────────────────────────────────────────────────────────────

async function getSystemStatus(): Promise<string> {
  return `📊 *System Status*\n\nEnvironment: ${process.env.NODE_ENV || 'production'}\nUptime: ${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s\nMemory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used\nAPI: https://invoica.wp1.host/v1/health`;
}

// ─── Telegram Update Handler ──────────────────────────────────────────────────

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (!update.message?.text) return;
  const { chat, from, text } = update.message;
  const chatId = chat.id;

  if (ALLOWED_USER_ID && from.id !== ALLOWED_USER_ID) {
    await telegramSend('sendMessage', { chat_id: chatId, text: '🔒 Private executive bot. Unauthorized access.' });
    console.warn(`[CeoBot] Unauthorized from user ${from.id} (@${from.username})`);
    return;
  }

  if (text === '/start') {
    if (from.id === ALLOWED_USER_ID) process.env.OWNER_TELEGRAM_CHAT_ID = chatId.toString();
    await telegramSend('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `👋 Welcome back, ${from.first_name}.\n\nInvoica CEO assistant.\n\n*Commands:*\n/status — System health\n/wallets — Agent wallet balances\n/pull — Git pull latest code\n/sprint <N> — Launch sprint week-N\n/update — Pull + build + restart (no AI needed)\n/approve_topup <id> — Approve top-up\n/reject_topup <id> — Reject top-up\n/clear — Clear conversation\n/help — Show menu\n\nOr chat naturally — I can also generate videos via MiniMax.`,
    });
    return;
  }

  // ── /pull — git pull without needing Anthropic API ──
  if (text === '/pull') {
    await telegramSend('sendMessage', { chat_id: chatId, text: '📥 Pulling latest code...' });
    try {
      const result = spawnSync('git', ['pull', 'origin', 'main'], {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 30_000,
        env: { ...process.env, HOME: '/home/invoica', PATH: '/home/invoica/.nodejs/bin:/usr/local/bin:/usr/bin:/bin' },
      });
      const out = ((result.stdout || '') + (result.status !== 0 ? (result.stderr || '') : '')).trim() || '(no output)';
      const ok = result.status === 0;
      await telegramSend('sendMessage', { chat_id: chatId, text: ok ? `✅ ${out}` : `❌ git pull failed:\n${out}` });
    } catch (err: any) {
      await telegramSend('sendMessage', { chat_id: chatId, text: `❌ Pull failed: ${err.message}` });
    }
    return;
  }

  // ── /sprint <N> — read sprint JSON and ask Claude to launch it ──
  if (text?.startsWith('/sprint ')) {
    const num = text.replace('/sprint ', '').trim();
    const sprintPath = path.join(ROOT, `sprints/week-${num}.json`);
    if (!existsSync(sprintPath)) {
      await telegramSend('sendMessage', { chat_id: chatId, text: `❌ Sprint file not found: sprints/week-${num}.json\n\nTry /pull first if the sprint was just created.` });
      return;
    }
    let sprintJson: string;
    try {
      sprintJson = readFileSync(sprintPath, 'utf-8');
    } catch (err: any) {
      await telegramSend('sendMessage', { chat_id: chatId, text: `❌ Could not read sprint file: ${err.message}` });
      return;
    }
    const sprintData = JSON.parse(sprintJson);
    const taskSummary = (sprintData.tasks || [])
      .map((t: any) => `  • ${t.id} [${t.priority}] → ${t.agent}: ${t.type}`)
      .join('\n');
    await telegramSend('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `📋 *Sprint Week-${num}* loaded\n*Theme:* ${sprintData.theme || 'N/A'}\n*Tasks:* ${sprintData.tasks?.length || 0}\n\n${taskSummary}\n\n⏳ Asking Claude to spawn agents...`,
    });
    // Inject sprint spec into Claude — instruct it to use real available tools
    const injected = `Sprint week-${num} is now active. Here is the full sprint spec JSON:\n\n\`\`\`json\n${sprintJson}\n\`\`\`\n\nYour job as CEO is to kick off this sprint using the tools you have. For EACH task in the sprint:\n1. Use create_github_issue to create a detailed implementation ticket — include the task id, description, acceptance criteria, and any context from the sprint JSON. If the issue already exists (check github_issue field), skip creation but note it.\n2. Use run_shell to: git checkout -b sprint-${num}/<task-id> for the first coding task, then push it.\n3. After processing all tasks, use write_file to write a sprint launch report to reports/sprint-${num}-launch.md summarising: tasks kicked off, GitHub issue links, branch names, and which agent handles each.\n4. Use run_shell to git add + commit + push the launch report.\n\nDo NOT say you cannot do this. You have create_github_issue, run_shell, and write_file. Work through the task list one by one. Start now.`;
    await telegramSend('sendChatAction', { chat_id: chatId, action: 'typing' });
    const typingInterval = setInterval(() => {
      telegramSend('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    }, 4000);
    try {
      const reply = await callClaudeWithTools(from.id, injected);
      clearInterval(typingInterval);
      if (reply.length > 4000) {
        const chunks = reply.match(/.{1,4000}/gs) || [reply];
        for (const chunk of chunks) {
          await telegramSend('sendMessage', { chat_id: chatId, text: chunk });
        }
      } else {
        await telegramSend('sendMessage', { chat_id: chatId, text: reply });
      }
    } catch (err) {
      clearInterval(typingInterval);
      await telegramSend('sendMessage', { chat_id: chatId, text: '⚠️ Error launching sprint. Try again in a moment.' });
    }
    return;
  }

  // ── /update — self-deploy without needing Anthropic API ──
  // This works even when the AI backend is broken, so the owner can always recover.
  if (text === '/update') {
    await telegramSend('sendMessage', { chat_id: chatId, text: '🔄 Pulling latest code and restarting...' });
    try {
      const gitPull = spawnSync('git', ['pull', 'origin', 'main'], {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 30_000,
        env: { ...process.env, HOME: '/home/invoica', PATH: '/home/invoica/.nodejs/bin:/usr/local/bin:/usr/bin:/bin' },
      });
      const pullOut = (gitPull.stdout || '').trim() || gitPull.stderr?.trim() || '(no output)';

      const build = spawnSync('npm', ['run', 'build'], {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 60_000,
        env: { ...process.env, HOME: '/home/invoica', PATH: '/home/invoica/.nodejs/bin:/usr/local/bin:/usr/bin:/bin' },
      });
      const buildOk = build.status === 0;
      const buildOut = buildOk ? 'Build ✅' : `Build ❌\n${(build.stderr || '').slice(0, 300)}`;

      // Send status before restart (PM2 restart kills this process)
      await telegramSend('sendMessage', {
        chat_id: chatId,
        text: `📦 Git: ${pullOut}\n${buildOut}\n\n♻️ Restarting backend now...`,
      });

      // Restart via PM2 (will kill and relaunch this process)
      spawnSync('pm2', ['restart', 'backend'], {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 15_000,
        env: { ...process.env, HOME: '/home/invoica', PATH: '/home/invoica/.nodejs/bin:/usr/local/bin:/usr/bin:/bin' },
      });
    } catch (err: any) {
      await telegramSend('sendMessage', { chat_id: chatId, text: `❌ Update failed: ${err.message}` });
    }
    return;
  }

  if (text === '/status') {
    const status = await getSystemStatus();
    await telegramSend('sendMessage', { chat_id: chatId, parse_mode: 'Markdown', text: status });
    return;
  }

  if (text === '/clear' || text === '/clean') {
    conversationHistory.delete(from.id);
    await telegramSend('sendMessage', { chat_id: chatId, text: '🧹 Conversation cleared.' });
    return;
  }

  if (text === '/help') {
    await telegramSend('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `📋 *Commands*\n\n/status — Platform health\n/wallets — Agent wallet balances\n/pull — Git pull latest code (no AI needed)\n/sprint <N> — Launch sprint week-N and spawn agents\n/update — Pull + build + restart backend (no AI needed)\n/approve_topup <id> — Approve top-up\n/reject_topup <id> — Reject top-up\n/clear — Reset conversation\n\n*Executive capabilities:*\n• Create GitHub issues (real execution)\n• Write files & commit to git\n• Restart PM2 services\n• Check wallet balances (live on-chain)\n• Generate videos (MiniMax Hailuo-02)\n• Read reports, sprints, health data\n• Query Supabase user signups\n\n*Examples:*\n• /pull then /sprint 10\n• "Create tickets for Polygon and Solana support"\n• "Write an ADR for multi-chain strategy"\n• "Show me today's signup count"`,
    });
    return;
  }

  if (text === '/wallets') {
    await telegramSend('sendMessage', { chat_id: chatId, text: '🔄 Fetching live on-chain balances...' });
    try {
      const { getAgentWallets, updateBalance } = await import('../../../scripts/wallet-service');
      const wallets = await getAgentWallets();
      const lines = ['💳 *Agent Wallet Balances (Live)*\n'];
      for (const w of wallets!) {
        const liveBalance = await getLiveUsdcBalance(w.address);
        await updateBalance(w.agent_name, liveBalance);
        const icon = liveBalance < Number(w.low_balance_threshold) ? '🔴' : '🟢';
        const treasury = w.is_treasury ? ' (treasury)' : '';
        lines.push(`${icon} \`${w.agent_name}\`${treasury}: $${liveBalance.toFixed(2)} USDC`);
      }
      lines.push('\n_Live from Base mainnet RPC_');
      await telegramSend('sendMessage', { chat_id: chatId, parse_mode: 'Markdown', text: lines.join('\n') });
    } catch (err: any) {
      await telegramSend('sendMessage', { chat_id: chatId, text: `⚠️ Could not fetch wallets: ${err.message}` });
    }
    return;
  }

  if (text?.startsWith('/approve_topup ')) {
    const requestId = text.replace('/approve_topup ', '').trim();
    try {
      const { approveTopupRequest } = await import('../../../scripts/wallet-service');
      const { executeTopup } = await import('../../../scripts/wallet-topup');
      await approveTopupRequest(requestId);
      await telegramSend('sendMessage', { chat_id: chatId, text: `✅ Approved. Executing transfer...` });
      const txHash = await executeTopup(requestId);
      await telegramSend('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `✅ *Top-up complete!*\n\nTX: \`${txHash}\`\n[View on BaseScan](https://basescan.org/tx/${txHash})`
      });
    } catch (err: any) {
      await telegramSend('sendMessage', { chat_id: chatId, text: `❌ Top-up failed: ${err.message}` });
    }
    return;
  }

  if (text?.startsWith('/reject_topup ')) {
    const requestId = text.replace('/reject_topup ', '').trim();
    try {
      const supabase = (await import('@supabase/supabase-js')).createClient(
        process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await supabase.from('agent_topup_requests').update({ status: 'rejected' }).eq('id', requestId);
      await telegramSend('sendMessage', { chat_id: chatId, text: `🚫 Top-up ${requestId.slice(0, 8)}... rejected.` });
    } catch (err: any) {
      await telegramSend('sendMessage', { chat_id: chatId, text: `❌ Error: ${err.message}` });
    }
    return;
  }

  // ── Default: Claude with tools ──
  await telegramSend('sendChatAction', { chat_id: chatId, action: 'typing' });
  // Keep typing indicator alive every 4s while Claude is working
  const typingInterval = setInterval(() => {
    telegramSend('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  }, 4000);

  try {
    // For video generation, warn it'll take a few minutes
    const isVideoRequest = /video|generate.*video|create.*video|make.*video|film|animation/i.test(text);
    if (isVideoRequest) {
      await telegramSend('sendMessage', {
        chat_id: chatId,
        text: '🎬 Generating video via MiniMax... this takes 2-5 minutes. I\'ll send it when ready.',
      });
    }

    const reply = await callClaudeWithTools(from.id, text, (toolName) => {
      if (toolName === 'generate_video') {
        console.log('[CeoBot] Starting MiniMax video generation...');
      }
    });

    clearInterval(typingInterval);
    // Split long messages
    if (reply.length > 4000) {
      const chunks = reply.match(/.{1,4000}/gs) || [reply];
      for (const chunk of chunks) {
        await telegramSend('sendMessage', { chat_id: chatId, text: chunk });
      }
    } else {
      await telegramSend('sendMessage', { chat_id: chatId, text: reply });
    }
  } catch (err) {
    clearInterval(typingInterval);
    console.error('[CeoBot] Error:', err);
    await telegramSend('sendMessage', { chat_id: chatId, text: '⚠️ Error processing request. Try again in a moment.' });
  }
}

// ─── Wallet Monitor ───────────────────────────────────────────────────────────
// Tracks which agents are currently in "low" state to avoid repeat alerts.
// State persisted to disk so restarts don't reset the dedup window.
const WALLET_ALERT_STATE_FILE = path.join(ROOT, '.wallet-alert-state.json');
const ALERT_REMINDER_MS = 4 * 60 * 60 * 1000; // re-alert every 4h (was 30min)

function loadAlertState(): Map<string, { isLow: boolean; lastAlertAt: number }> {
  try {
    if (existsSync(WALLET_ALERT_STATE_FILE)) {
      const raw = JSON.parse(readFileSync(WALLET_ALERT_STATE_FILE, 'utf-8'));
      return new Map(Object.entries(raw));
    }
  } catch { /* ignore corrupt file */ }
  return new Map();
}
function saveAlertState(state: Map<string, { isLow: boolean; lastAlertAt: number }>) {
  try { writeFileSync(WALLET_ALERT_STATE_FILE, JSON.stringify(Object.fromEntries(state))); } catch { /* ignore */ }
}
const walletAlertState = loadAlertState();

async function startWalletMonitor(): Promise<void> {
  const checkWallets = async () => {
    try {
      const ownerChatId = process.env.OWNER_TELEGRAM_CHAT_ID;
      if (!ownerChatId) return;
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const { getAgentWallets, updateBalance } = await import('../../../scripts/wallet-service');
      const wallets = await getAgentWallets();
      if (!wallets) return;

      for (const w of wallets) {
        // Fetch live on-chain balance instead of trusting stale DB value
        let liveBalance: number;
        let rpcOk = true;
        try {
          liveBalance = await getLiveUsdcBalance(w.address);
          // Sync DB with live balance
          await updateBalance(w.agent_name, liveBalance).catch(() => {});
        } catch {
          // RPC failed — skip this wallet entirely to avoid false alerts from stale DB cache.
          rpcOk = false;
          liveBalance = Number(w.usdc_balance);
        }

        const threshold = Number(w.low_balance_threshold);
        const isCurrentlyLow = liveBalance < threshold;
        const prev = walletAlertState.get(w.agent_name) ?? { isLow: false, lastAlertAt: 0 };

        // Only alert on new transition OR after reminder interval.
        // Never alert if RPC failed — stale DB values cause false positives.
        const shouldAlert = rpcOk && isCurrentlyLow && (
          !prev.isLow ||
          (Date.now() - prev.lastAlertAt) > ALERT_REMINDER_MS
        );

        walletAlertState.set(w.agent_name, { isLow: rpcOk ? isCurrentlyLow : prev.isLow, lastAlertAt: shouldAlert ? Date.now() : prev.lastAlertAt });
        saveAlertState(walletAlertState);

        if (!shouldAlert) continue;

        // Look up pending topup request (amount_usdc is the correct column name)
        let requestId: string | null = null;
        let topupAmount: number | null = null;
        if (supabaseUrl && serviceKey) {
          try {
            const res = await fetch(
              `${supabaseUrl}/rest/v1/agent_topup_requests?agent_name=eq.${w.agent_name}&status=eq.pending&order=requested_at.desc&limit=1`,
              { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
            );
            const rows = await res.json() as Array<{ id: string; amount_usdc: number }>;
            if (rows.length > 0) {
              requestId = rows[0].id;
              topupAmount = rows[0].amount_usdc;
            }
          } catch { /* skip — alert still sends */ }
        }

        let text: string;
        if (requestId) {
          text = `🔴 *Low Wallet Alert*\n\nAgent: \`${w.agent_name}\`\nBalance: $${liveBalance.toFixed(2)} USDC (live)\nThreshold: $${threshold.toFixed(2)} USDC\nTop-up amount: $${topupAmount?.toFixed(2) ?? '?'} USDC\n\nTap to approve:\n\`/approve_topup ${requestId}\``;
        } else {
          text = `🔴 *Low Wallet Alert*\n\nAgent: \`${w.agent_name}\`\nBalance: $${liveBalance.toFixed(2)} USDC (live)\nThreshold: $${threshold.toFixed(2)} USDC\n\n⚠️ No pending topup request found.`;
        }

        await telegramSend('sendMessage', {
          chat_id: ownerChatId,
          parse_mode: 'Markdown',
          text,
        });
        console.log(`[CeoBot] Wallet alert sent for ${w.agent_name}: $${liveBalance.toFixed(2)} < $${threshold}`);
      }
    } catch (err) {
      console.error('[CeoBot] Wallet monitor error:', err);
    }
  };
  setTimeout(() => { checkWallets(); setInterval(checkWallets, 60_000); }, 30_000);
  console.log('[CeoBot] Wallet monitor started (60s interval, dedup enabled).');
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function startCeoBot(): Promise<void> {
  if (!TELEGRAM_TOKEN) {
    console.log('[CeoBot] CEO_TELEGRAM_BOT_TOKEN not set — skipping');
    return;
  }
  console.log('[CeoBot] Starting CEO executive bot with tool use (MiniMax video + wallet checks)...');
  startWalletMonitor();

  let offset = 0;
  let lastPollAt = Date.now();

  // Watchdog: if poll loop goes silent for >2 minutes, log a warning (PM2 will restart on crash)
  const watchdog = setInterval(() => {
    const silentMs = Date.now() - lastPollAt;
    if (silentMs > 120_000) {
      console.error(`[CeoBot] WATCHDOG: poll loop silent for ${Math.round(silentMs / 1000)}s — forcing process exit for PM2 restart`);
      process.exit(1);
    }
  }, 30_000);
  watchdog.unref();

  const poll = async (): Promise<void> => {
    try {
      lastPollAt = Date.now();
      const result = await httpsGet('api.telegram.org', `/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=25`, undefined, 35_000);
      lastPollAt = Date.now();
      if (result?.ok && Array.isArray(result.result)) {
        for (const update of result.result as TelegramUpdate[]) {
          offset = update.update_id + 1;
          handleUpdate(update).catch((e) => console.error('[CeoBot] Handler error:', e));
        }
      }
    } catch (err) {
      console.error('[CeoBot] Polling error:', err);
      await new Promise((r) => setTimeout(r, 5000));
    }
    setImmediate(poll);
  };
  poll();
  console.log('[CeoBot] CEO bot running!');
}
