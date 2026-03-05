#!/usr/bin/env ts-node

/**
 * Invoica CFO Runner
 *
 * Generates financial reports by pulling real data from Supabase
 * and analysing it with Claude (claude-sonnet-4-5).
 *
 * Runs weekly on Monday at 07:00 UTC via PM2 cron.
 *
 * Usage:
 *   npx ts-node scripts/run-cfo.ts [weekly-report|monthly-analysis|cost-audit]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { spawn } from 'child_process';
import 'dotenv/config';

// ── Cron guard: prevent PM2 reload from triggering this script off-schedule ──
(function checkCronGuard() {
  const _guardFile = require('path').join(process.cwd(), 'logs', 'cron-guard-cfo-weekly.json');
  const _minMs = 160 * 60 * 60 * 1000;
  try {
    const _last = require('fs').existsSync(_guardFile)
      ? JSON.parse(require('fs').readFileSync(_guardFile, 'utf-8')).lastRun
      : 0;
    if (Date.now() - new Date(_last).getTime() < _minMs) {
      const _ago = Math.round((Date.now() - new Date(_last).getTime()) / 3600000);
      console.log(`[CronGuard] cfo-weekly: last run ${_ago}h ago (min interval 160h) — skipping`);
      process.exit(0);
    }
  } catch { /* first run or stale guard */ }
  // Update last-run timestamp
  try {
    require('fs').writeFileSync(_guardFile, JSON.stringify({ lastRun: new Date().toISOString() }));
  } catch { /* non-fatal */ }
})();


const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports', 'cfo');
const LOGS_DIR    = path.join(ROOT, 'logs');

// ── Ensure dirs ─────────────────────────────────────────────────────────────
fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.mkdirSync(LOGS_DIR,    { recursive: true });

// ── Colour helpers ───────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m', magenta: '\x1b[35m',
};
function log(color: string, msg: string) { console.log(color + msg + c.reset); }

// ── HTTP helper ──────────────────────────────────────────────────────────────
function apiCall(
  method: string, hostname: string, urlPath: string,
  headers: Record<string, string>, body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      method, hostname, port: 443, path: urlPath,
      headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}) },
    };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('API request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Anthropic Claude call ────────────────────────────────────────────────────
async function callClaude(system: string, user: string, maxTokens = 4000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: maxTokens,
    system, messages: [{ role: 'user', content: user }],
  });
  const res = await apiCall('POST', 'api.anthropic.com', '/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }, body);
  const parsed = JSON.parse(res.body);
  return parsed.content?.[0]?.text || '(no response from Claude)';
}

// ── Supabase query helper ────────────────────────────────────────────────────
async function supabaseQuery(table: string, query: string): Promise<any[]> {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    log(c.yellow, '  [CFO] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — using empty dataset');
    return [];
  }
  const parsed = new URL(`${url}/rest/v1/${table}?${query}`);
  const res = await apiCall('GET', parsed.hostname, parsed.pathname + parsed.search, {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  });
  if (res.status >= 400) {
    log(c.yellow, `  [CFO] Supabase query failed (${res.status}): ${res.body.substring(0, 200)}`);
    return [];
  }
  return JSON.parse(res.body) || [];
}

// ── Financial data aggregation ───────────────────────────────────────────────
interface FinancialSnapshot {
  invoicesTotal: number;
  revenueSettledUSD: number;
  invoicesByStatus: Record<string, number>;
  recentInvoices: any[];
  apiCostEstimateMonthly: number;
  apiCostBreakdown: string;
  todayISO: string;
  monthISO: string;
}

async function gatherFinancialData(): Promise<FinancialSnapshot> {
  log(c.cyan, '  [CFO] Pulling invoice data from Supabase...');

  // Pull all invoices (limit 500 — more than enough for current scale)
  const invoices = await supabaseQuery('Invoice', 'select=*&limit=500&order=createdAt.desc');
  log(c.gray, `  [CFO] Fetched ${invoices.length} invoices`);

  const invoicesByStatus: Record<string, number> = {};
  let revenueSettledUSD = 0;

  for (const inv of invoices) {
    const status = inv.status || 'UNKNOWN';
    invoicesByStatus[status] = (invoicesByStatus[status] || 0) + 1;
    if (['SETTLED', 'COMPLETED', 'PROCESSING'].includes(status)) {
      const amount = parseFloat(inv.amount) || 0;
      // Amount assumed to be in USD (or USDC which is 1:1)
      revenueSettledUSD += amount;
    }
  }

  // Recent invoices (last 10)
  const recentInvoices = invoices.slice(0, 10).map((inv: any) => ({
    id: inv.id?.substring(0, 8),
    number: inv.invoiceNumber,
    status: inv.status,
    amount: inv.amount,
    currency: inv.currency || 'USD',
    createdAt: inv.createdAt,
    paidBy: inv.paymentDetails?.paidBy || '-',
  }));

  // API cost estimates based on known rates (from agent.yaml current_financial_state)
  const apiCostEstimateMonthly = 75; // midpoint of $60-95/month range
  const apiCostBreakdown = `
  - Anthropic (Claude): ~$20/month (CEO review, CFO, X-admin)
  - MiniMax (Coding agents): ~$40/month (orchestrator, skills)
  - xAI/Grok: ~$5/month (market intelligence)
  - Infrastructure: $0 (VPS included in build cost)
  Total estimated monthly burn: ~$65-85/month`.trim();

  const todayISO = new Date().toISOString().split('T')[0];
  const monthISO = todayISO.substring(0, 7);

  return {
    invoicesTotal: invoices.length,
    revenueSettledUSD,
    invoicesByStatus,
    recentInvoices,
    apiCostEstimateMonthly,
    apiCostBreakdown,
    todayISO,
    monthISO,
  };
}

// ── CFO system prompt ─────────────────────────────────────────────────────────
const CFO_SYSTEM = `You are the Chief Financial Officer of Invoica (invoica.ai).

Invoica is a B2B fintech platform providing an x402 payment infrastructure for AI agents.
We are pre-revenue / early revenue. Your job is factual financial analysis.

CORE MANDATE:
- Track all revenue, costs, and unit economics
- Maintain conservative projections (use low-end estimates)
- Flag risks and cost overruns immediately
- Keep the CEO informed of financial health at all times

CONSTRAINTS:
- Revenue projections must be conservative (use low-end estimates)
- Never hide or obscure financial data
- All reports must be factual, not aspirational
- Call out $0 MRR if that is the reality

REPORT FORMAT: Use clean markdown with these sections:
1. Executive Summary (2-3 bullets: key numbers, health, recommendation)
2. Revenue Analysis (actual invoices, MRR, ARR projection)
3. Cost Analysis (API costs, infrastructure, people)
4. Unit Economics (LTV, CAC, burn rate, runway)
5. Financial Health Score (Green/Yellow/Red with rationale)
6. CEO Actions Required (specific asks with dollar amounts)
7. 30-Day Outlook (conservative projection)

Sign off as "CFO — Invoica Financial Operations"`;

// ── Report generators ────────────────────────────────────────────────────────
async function generateWeeklyReport(data: FinancialSnapshot): Promise<string> {
  const statusSummary = Object.entries(data.invoicesByStatus)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const recentTable = data.recentInvoices.map(i =>
    `| ${i.number || '-'} | ${i.status} | $${i.amount || '0'} ${i.currency} | ${i.paidBy} | ${(i.createdAt || '').substring(0, 10)} |`
  ).join('\n');

  const user = `Generate the weekly financial report for Invoica.

## Real Data from Supabase (as of ${data.todayISO})

**Invoice Database:**
- Total invoices in system: ${data.invoicesTotal}
- Status breakdown: ${statusSummary || 'none'}
- Total settled revenue: $${data.revenueSettledUSD.toFixed(2)} USD

**Recent Invoices (last 10):**
| # | Status | Amount | Paid By | Date |
|---|--------|--------|---------|------|
${recentTable || '| - | no invoices | - | - | - |'}

**Operating Costs (estimated):**
${data.apiCostBreakdown}

**Context:**
- Platform is in early-launch / pre-revenue phase
- x402 payment infrastructure is live on Base mainnet
- First customer invoices may be test transactions
- MRR target: $1,000 within 90 days of launch

Generate a complete weekly financial report. Be honest about $0 or near-$0 revenue.
This report will be read by the CEO.`;

  return await callClaude(CFO_SYSTEM, user, 4000);
}

async function generateMonthlyAnalysis(data: FinancialSnapshot): Promise<string> {
  const user = `Generate the full monthly financial analysis for ${data.monthISO}.

## Real Data (${data.todayISO})
- Total invoices: ${data.invoicesTotal}
- Revenue (settled): $${data.revenueSettledUSD.toFixed(2)} USD
- Status breakdown: ${JSON.stringify(data.invoicesByStatus)}
- Monthly burn rate: ~$${data.apiCostEstimateMonthly}/month
- API cost breakdown: ${data.apiCostBreakdown}

Include:
1. Month-over-month analysis (we are early so compare to launch baseline)
2. Unit economics: if revenue > 0, calculate per-invoice revenue, break-even point
3. Runway: months of operation at current burn rate
4. What revenue milestones we need to hit and by when
5. 3-month financial projection (conservative/base/optimistic)
6. Top 3 financial risks for the quarter

Be direct. If MRR is $0, say so and explain what the target is and the plan.`;

  return await callClaude(CFO_SYSTEM, user, 5000);
}

async function generateCostAudit(data: FinancialSnapshot): Promise<string> {
  const user = `Conduct a cost audit for Invoica as of ${data.todayISO}.

## Current Cost Structure
${data.apiCostBreakdown}

## Task
1. Identify every known cost line item and its monthly USD amount
2. Flag any costs that can be reduced without impacting quality
3. Calculate total monthly burn rate (high/low range)
4. Compare to revenue ($${data.revenueSettledUSD.toFixed(2)} settled to date)
5. Recommend any immediate cost optimizations
6. Calculate break-even revenue needed

Be specific about every API provider and what we use them for.`;

  return await callClaude(CFO_SYSTEM, user, 3000);
}

// ── Save report ──────────────────────────────────────────────────────────────
function saveReport(taskType: string, content: string, date: string): string {
  const filename = `${taskType}-${date}.md`;
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

function updateLatest(taskType: string, content: string): void {
  const latestKey = taskType === 'weekly-report' ? 'latest-financial-report'
    : taskType === 'monthly-analysis' ? 'latest-monthly-analysis'
    : 'latest-cost-audit';
  const latestPath = path.join(REPORTS_DIR, `${latestKey}.md`);
  fs.writeFileSync(latestPath, content);
  log(c.gray, `  Updated ${latestKey}.md`);
}

// ── Telegram ──────────────────────────────────────────────────────────────────
async function sendTelegram(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  try {
    await apiCall('POST', 'api.telegram.org', `/bot${botToken}/sendMessage`, {
      'Content-Type': 'application/json',
    }, JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }));
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────────────────────
type CFOTaskType = 'weekly-report' | 'monthly-analysis' | 'cost-audit';
const VALID_TASKS: CFOTaskType[] = ['weekly-report', 'monthly-analysis', 'cost-audit'];

async function main() {
  const rawTask = process.argv[2] as CFOTaskType | undefined;
  // Default: weekly-report (run every Monday)
  const taskType: CFOTaskType = VALID_TASKS.includes(rawTask as CFOTaskType)
    ? (rawTask as CFOTaskType)
    : 'weekly-report';

  // Monthly analysis on the 1st of each month
  const today = new Date();
  const resolvedTask: CFOTaskType = (taskType === 'weekly-report' && today.getDate() === 1)
    ? 'monthly-analysis'
    : taskType;

  log(c.magenta, '\n' + '='.repeat(60));
  log(c.magenta, '  Invoica CFO Agent');
  log(c.magenta, `  Task: ${resolvedTask}`);
  log(c.magenta, '='.repeat(60));

  const startTime = Date.now();

  try {
    // 1. Gather real financial data
    const data = await gatherFinancialData();
    log(c.green, `  [CFO] Revenue: $${data.revenueSettledUSD.toFixed(2)} | Invoices: ${data.invoicesTotal}`);

    // 2. Generate report
    log(c.cyan, `  [CFO] Generating ${resolvedTask} with Claude...`);
    let content: string;
    if (resolvedTask === 'monthly-analysis') {
      content = await generateMonthlyAnalysis(data);
    } else if (resolvedTask === 'cost-audit') {
      content = await generateCostAudit(data);
    } else {
      content = await generateWeeklyReport(data);
    }

    // 3. Save
    const dateStr = data.todayISO;
    const reportPath = saveReport(resolvedTask, content, dateStr);
    updateLatest(resolvedTask, content);
    log(c.green, `  [CFO] Report saved: ${reportPath}`);

    // 4. Telegram notification
    const mrrEstimate = data.revenueSettledUSD > 0
      ? `$${data.revenueSettledUSD.toFixed(2)} settled revenue`
      : '$0 revenue (pre-revenue)';
    await sendTelegram(
      `📊 *CFO Report — ${resolvedTask}*\n\n` +
      `${mrrEstimate}\nBurn: ~$${data.apiCostEstimateMonthly}/month\n` +
      `Invoices: ${data.invoicesTotal} total\n\nSaved to reports/cfo/`
    );

    // 5. Trigger CEO review (fire-and-forget)
    const ceoReview = spawn('node', ['-r', 'ts-node/register', path.join(__dirname, 'run-ceo-review.ts'), '--source=cfo'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true', TS_NODE_PROJECT: path.join(ROOT, 'tsconfig.json') },
    });
    ceoReview.unref();
    log(c.gray, `  CEO review triggered (PID ${ceoReview.pid})`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(c.green, '\n' + '='.repeat(60));
    log(c.green, `  CFO ${resolvedTask} complete in ${elapsed}s`);
    log(c.green, '='.repeat(60) + '\n');

    process.exit(0);
  } catch (err: any) {
    log(c.red, `\n[CFO] FAILED: ${err.message}`);
    if (err.stack) log(c.gray, err.stack);
    await sendTelegram(`🔴 *CFO Runner Failed*\n\n${err.message}`);
    process.exit(1);
  }
}

main();
