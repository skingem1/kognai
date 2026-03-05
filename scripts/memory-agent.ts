#!/usr/bin/env ts-node
/**
 * memory-agent.ts — Invoica Black Box Memory System
 *
 * Runs hourly via PM2 cron. Passively observes everything about the company:
 * git commits, PM2 logs, sprint files, Supabase data, GitHub issues, deployments.
 *
 * Writes 3 persistent files to MEMORY_DIR (default: /home/invoica/memory/)
 * and mirrors them to memory/ in the repo so agents can read them:
 *
 *   daily-log-YYYY-MM-DD.md   — Hourly running activity log (appended each run)
 *   daily-continuity.md       — Yesterday's brief for CEO to read each morning
 *   long-term-memory.md       — Institutional memory (never deleted, intelligently merged)
 *
 * Black-box design principles:
 *   - Zero dependency on backend API, x402, or any internal service
 *   - Direct Anthropic HTTPS for summarization (no x402 payment path)
 *   - Fails gracefully: if any data source is down, logs the gap and continues
 *   - Writes to a path OUTSIDE the app dir — survives git clean, restarts, deploys
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import 'dotenv/config';
import { createMCClient } from './mc-client';

// ── Config ─────────────────────────────────────────────────────────────────

const ROOT       = process.cwd();                                        // /home/invoica/apps/Invoica
const MEMORY_DIR = process.env.MEMORY_DIR || '/home/invoica/memory';     // external, persistent
const REPO_MEM   = path.join(ROOT, 'memory');                            // mirrored in repo for agent access
const LOG_DIR    = path.join(ROOT, 'logs');
const SPRINTS    = path.join(ROOT, 'sprints');
const REPORTS    = path.join(ROOT, 'reports');

const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || '';
const SUPABASE_URL   = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '');
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO    = process.env.GITHUB_REPO || 'skingem1/Invoica';
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN || '';
const VERCEL_PROJECT = 'prj_AFOWCmQoEJzrsxOVyPOoFXE81nXR';

const NOW     = new Date();
const TODAY   = NOW.toISOString().slice(0, 10);           // YYYY-MM-DD
const HOUR    = NOW.toISOString().slice(0, 13) + ':00Z';  // YYYY-MM-DDTHH:00Z

// ── Mission Control token tracking ─────────────────────────────────────────
// Accumulates across all callClaude() calls, reported to MC at end of run

let _mcInputTokens  = 0;
let _mcOutputTokens = 0;

// ── Ensure output dirs exist ───────────────────────────────────────────────

[MEMORY_DIR, REPO_MEM].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[MemoryAgent] ${new Date().toISOString()} ${msg}`);
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function httpsGet(hostname: string, path: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', (e) => resolve(`[HTTP error: ${e.message}]`));
    req.setTimeout(20_000, () => { req.destroy(); resolve('[Timeout]'); });
    req.end();
  });
}

function httpsPost(hostname: string, urlPath: string, headers: Record<string, string>, body: string): Promise<string> {
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: urlPath, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', (e) => resolve(`[HTTP error: ${e.message}]`));
    req.setTimeout(60_000, () => { req.destroy(); resolve('[Timeout]'); });
    req.write(body);
    req.end();
  });
}

// ── LLM summarization (direct Anthropic, no x402) ─────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!ANTHROPIC_KEY) return '[No ANTHROPIC_API_KEY — raw data only]';
  try {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const raw = await httpsPost('api.anthropic.com', '/v1/messages', {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    }, body);
    const parsed = JSON.parse(raw);
    // Accumulate token usage for Mission Control cost tracking
    _mcInputTokens  += parsed?.usage?.input_tokens  || 0;
    _mcOutputTokens += parsed?.usage?.output_tokens || 0;
    return parsed?.content?.[0]?.text || '[Empty response]';
  } catch (e: any) {
    return `[LLM error: ${e.message}]`;
  }
}

// ── Data collectors ────────────────────────────────────────────────────────

function collectGitActivity(): string {
  try {
    const log25h = execSync(
      'git log --oneline --since="25 hours ago" --pretty=format:"%h %ai %an: %s"',
      { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }
    ).trim();
    const today  = execSync(
      'git log --oneline --since="1 hour ago" --pretty=format:"%h %ai %an: %s"',
      { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }
    ).trim();
    return [
      '### Git Activity (last 25h)',
      log25h || '(no commits)',
      '',
      '### Git Activity (last 1h)',
      today || '(no commits)',
    ].join('\n');
  } catch (e: any) {
    return `[git error: ${e.message}]`;
  }
}

function collectPM2Logs(): string {
  const logFiles = [
    'backend-error.log',
    'ceo-ai-bot-error.log',
    'sprint-runner.log',
    'autodeploy-out.log',
    'autodeploy-error.log',
    'heartbeat-out.log',
    'email-support-error.log',
    'cmo-weekly-plan-error.log',
    'ceo-review-error.log',
  ];
  const sections: string[] = ['### PM2 Logs (last 50 lines each)'];
  for (const fname of logFiles) {
    const fpath = path.join(LOG_DIR, fname);
    if (!fs.existsSync(fpath)) continue;
    try {
      const content = execSync(`tail -50 "${fpath}"`, { encoding: 'utf8' }).trim();
      if (content) {
        sections.push(`\n**${fname}:**\n\`\`\`\n${content}\n\`\`\``);
      }
    } catch { /* skip */ }
  }
  return sections.length > 1 ? sections.join('\n') : '(no PM2 log files found)';
}

function collectSprintStatus(): string {
  if (!fs.existsSync(SPRINTS)) return '(no sprints dir)';
  try {
    const files = fs.readdirSync(SPRINTS)
      .filter(f => f.endsWith('.json') && f !== 'test-v2.json')
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return nb - na;
      })
      .slice(0, 5);  // last 5 sprints

    const lines = ['### Sprint Status (last 5)'];
    for (const fname of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SPRINTS, fname), 'utf8'));
        const tasks: any[] = Array.isArray(data) ? data : (data.tasks || []);
        const done    = tasks.filter(t => t.status === 'done').length;
        const pending = tasks.filter(t => t.status === 'pending').length;
        const failed  = tasks.filter(t => t.status === 'failed').length;
        const bar     = done === tasks.length ? '✅ COMPLETE' : pending > 0 ? `⏳ ${pending} pending` : '⚠️ partial';
        lines.push(`- **${fname}**: ${done}/${tasks.length} done ${bar}${failed > 0 ? `, ${failed} failed` : ''}`);
        // Show pending task titles
        tasks.filter(t => t.status === 'pending').forEach(t => {
          lines.push(`  - [pending] ${t.id}: ${(t.description || '').slice(0, 80)}`);
        });
      } catch { lines.push(`- ${fname}: (parse error)`); }
    }
    return lines.join('\n');
  } catch (e: any) {
    return `[sprint error: ${e.message}]`;
  }
}

function collectSystemHealth(): string {
  try {
    const healthPath = path.join(ROOT, 'health.json');
    if (!fs.existsSync(healthPath)) return '(no health.json)';
    const h = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    return `### System Health (health.json)\n\`\`\`json\n${JSON.stringify(h, null, 2).slice(0, 2000)}\n\`\`\``;
  } catch (e: any) {
    return `[health error: ${e.message}]`;
  }
}

function collectRecentReports(): string {
  const sections: string[] = ['### Recent Reports'];
  const postSprintDir = path.join(REPORTS, 'post-sprint');
  if (fs.existsSync(postSprintDir)) {
    const files = fs.readdirSync(postSprintDir).sort().reverse().slice(0, 3);
    files.forEach(f => {
      try {
        const content = fs.readFileSync(path.join(postSprintDir, f), 'utf8');
        sections.push(`\n**${f}:**\n${content.slice(0, 500)}`);
      } catch { /* skip */ }
    });
  }
  // Also check memory dir for previous daily logs
  if (fs.existsSync(MEMORY_DIR)) {
    const prevLogs = fs.readdirSync(MEMORY_DIR)
      .filter(f => f.startsWith('daily-log-') && f.endsWith('.md'))
      .sort().reverse().slice(1, 3); // yesterday and day before (not today)
    if (prevLogs.length) sections.push(`\nPrevious daily logs available: ${prevLogs.join(', ')}`);
  }
  return sections.join('\n');
}

async function collectSupabaseData(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return '(Supabase not configured)';
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };
  const sections = ['### Supabase Data'];

  // Invoices (last 10)
  try {
    const raw = await httpsGet(SUPABASE_URL,
      '/rest/v1/Invoice?select=invoiceNumber,status,amount,currency,customerEmail,createdAt&order=createdAt.desc&limit=10',
      headers
    );
    const rows = JSON.parse(raw);
    sections.push('\n**Recent Invoices:**');
    if (Array.isArray(rows) && rows.length) {
      rows.forEach((r: any) => sections.push(
        `  #${r.invoiceNumber} ${r.status} ${r.amount} ${r.currency} — ${r.customerEmail} (${r.createdAt?.slice(0,10)})`
      ));
    } else sections.push('  (none)');
  } catch (e: any) { sections.push(`  [invoice error: ${e.message}]`); }

  // Agent wallets
  try {
    const raw = await httpsGet(SUPABASE_URL,
      '/rest/v1/agent_wallets?select=agent_name,usdc_balance,last_balance_check&order=agent_name',
      headers
    );
    const rows = JSON.parse(raw);
    sections.push('\n**Agent Wallets (USDC on Base):**');
    if (Array.isArray(rows) && rows.length) {
      rows.forEach((r: any) => sections.push(
        `  ${r.agent_name}: ${r.usdc_balance} USDC (checked ${r.last_balance_check?.slice(0,16)})`
      ));
    }
  } catch (e: any) { sections.push(`  [wallet error: ${e.message}]`); }

  // Support tickets
  try {
    const raw = await httpsGet(SUPABASE_URL,
      '/rest/v1/SupportTicket?select=status,priority,subject,created_at&order=created_at.desc&limit=5',
      headers
    );
    const rows = JSON.parse(raw);
    sections.push('\n**Recent Support Tickets:**');
    if (Array.isArray(rows) && rows.length) {
      rows.forEach((r: any) => sections.push(
        `  [${r.priority}] ${r.status}: ${(r.subject || '').slice(0, 60)} (${r.created_at?.slice(0, 10)})`
      ));
    } else sections.push('  (none)');
  } catch (e: any) { sections.push(`  [ticket error: ${e.message}]`); }

  return sections.join('\n');
}

async function collectGitHubData(): Promise<string> {
  if (!GITHUB_TOKEN) return '(GITHUB_TOKEN not set)';
  const headers = { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'InvoicaMemoryAgent' };
  const sections = ['### GitHub'];

  // Open issues
  try {
    const raw = await httpsGet('api.github.com',
      `/repos/${GITHUB_REPO}/issues?state=open&per_page=15&sort=updated`,
      headers
    );
    const issues = JSON.parse(raw);
    sections.push(`\n**Open Issues (${Array.isArray(issues) ? issues.length : '?'}):**`);
    if (Array.isArray(issues)) {
      issues.slice(0, 10).forEach((i: any) => sections.push(
        `  #${i.number} [${(i.labels || []).map((l: any) => l.name).join(',')}] ${i.title}`
      ));
    }
  } catch (e: any) { sections.push(`  [issue error: ${e.message}]`); }

  // Recent closed issues (what was resolved)
  try {
    const raw = await httpsGet('api.github.com',
      `/repos/${GITHUB_REPO}/issues?state=closed&per_page=5&sort=updated`,
      headers
    );
    const issues = JSON.parse(raw);
    sections.push('\n**Recently Closed Issues:**');
    if (Array.isArray(issues)) {
      issues.forEach((i: any) => sections.push(`  ✅ #${i.number} ${i.title}`));
    }
  } catch { /* skip */ }

  return sections.join('\n');
}

async function collectVercelDeployments(): Promise<string> {
  if (!VERCEL_TOKEN) return '(VERCEL_TOKEN not set)';
  try {
    const raw = await httpsGet('api.vercel.com',
      `/v6/deployments?limit=5&projectId=${VERCEL_PROJECT}`,
      { 'Authorization': `Bearer ${VERCEL_TOKEN}` }
    );
    const data = JSON.parse(raw);
    const deploys = data?.deployments || [];
    const lines = ['### Vercel Deployments (last 5)'];
    deploys.forEach((d: any) => {
      const ts = new Date(d.created).toISOString().slice(0, 16);
      const msg = (d.meta?.githubCommitMessage || '').split('\n')[0].slice(0, 70);
      lines.push(`  ${d.state} ${ts} — ${msg}`);
    });
    return lines.join('\n');
  } catch (e: any) {
    return `[Vercel error: ${e.message}]`;
  }
}

// ── Memory writers ─────────────────────────────────────────────────────────

function writeBoth(filename: string, content: string): void {
  // Write to external persistent dir
  fs.writeFileSync(path.join(MEMORY_DIR, filename), content);
  // Mirror to repo memory/ dir (for agent access via git)
  fs.writeFileSync(path.join(REPO_MEM, filename), content);
}

function appendToDailyLog(hourlySection: string): void {
  const filename = `daily-log-${TODAY}.md`;
  const extPath  = path.join(MEMORY_DIR, filename);
  const existing = fs.existsSync(extPath) ? fs.readFileSync(extPath, 'utf8') : `# Invoica Daily Log — ${TODAY}\n\n`;
  const updated  = existing + hourlySection + '\n\n';
  writeBoth(filename, updated);
  log(`Appended to ${filename}`);
}

async function generateDailyContinuity(): Promise<void> {
  // Find yesterday's daily log
  const yesterday = new Date(NOW);
  yesterday.setDate(yesterday.getDate() - 1);
  const yDate    = yesterday.toISOString().slice(0, 10);
  const yLogPath = path.join(MEMORY_DIR, `daily-log-${yDate}.md`);

  if (!fs.existsSync(yLogPath)) {
    log(`No log for ${yDate} — skipping continuity generation`);
    return;
  }

  log(`Generating daily-continuity.md from ${yDate} log...`);
  const rawLog = fs.readFileSync(yLogPath, 'utf8');

  const continuity = await callClaude(
    `You are the institutional memory system for Invoica, an AI-native invoicing company.
Your job: write a crisp, dense daily continuity brief from yesterday's activity log.
The CEO reads this first thing in the morning before taking any action.
Format: structured markdown. Be specific — include commit hashes, error counts,
sprint IDs, wallet balances, exact error messages. No vague summaries.
Sections: ## What Happened | ## Incidents & Fixes | ## Sprint Progress | ## Pending Actions | ## Key Numbers`,
    `Here is yesterday's (${yDate}) full activity log for Invoica:\n\n${rawLog.slice(0, 12_000)}\n\nGenerate the daily continuity brief.`
  );

  const content = `# Invoica Daily Continuity Brief — ${yDate}\n*Generated ${NOW.toISOString()} by memory-agent*\n\n${continuity}\n`;
  writeBoth('daily-continuity.md', content);
  log('daily-continuity.md written');
}

async function updateLongTermMemory(rawData: string, events: string): Promise<void> {
  const ltmPath = path.join(MEMORY_DIR, 'long-term-memory.md');
  const existing = fs.existsSync(ltmPath) ? fs.readFileSync(ltmPath, 'utf8') : '';

  // Only update if there's something genuinely new (sprint completions, crashes, deploys)
  const hasNewEvents = /crash|restart|error|deploy|complete|fail|sprint|wallet|invoice/i.test(events);
  if (!hasNewEvents && existing.length > 500) {
    log('No significant new events — skipping long-term memory update');
    return;
  }

  log('Updating long-term memory...');

  const updated = await callClaude(
    `You are the institutional memory system for Invoica, an AI-native invoicing company.
You maintain the LONG-TERM corporate memory. Rules:
1. NEVER delete existing information — only add, correct, or augment
2. Keep historical incidents indexed by date
3. Track recurring patterns (e.g. "ceoBot crashes every X days")
4. Maintain a "Current State" section that is always up to date
5. Write for future agents who need context with zero onboarding
Sections to maintain:
## Company Overview | ## Infrastructure & Architecture | ## Agent Roster |
## Known Issues & Fixes (indexed by date) | ## Sprint History |
## Current State | ## Lessons Learned | ## Open Questions`,
    `EXISTING LONG-TERM MEMORY:\n${existing.slice(0, 8000)}\n\n---\n\nNEW ACTIVITY TODAY (${TODAY}):\n${rawData.slice(0, 6000)}\n\nUpdate the long-term memory. Keep ALL existing content. Add new facts. Fix any outdated entries.`
  );

  writeBoth('long-term-memory.md', `# Invoica Long-Term Memory\n*Last updated: ${NOW.toISOString()}*\n\n${updated}\n`);
  log('long-term-memory.md updated');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`Starting memory agent run — ${HOUR}`);
  log(`Memory dir: ${MEMORY_DIR}`);
  log(`Repo mirror: ${REPO_MEM}`);

  // ── Register with Mission Control ────────────────────────────────────────
  const mc = createMCClient('memory-agent', 'observer');
  await mc.connect();
  try {

  // ── 1. Collect all data ─────────────────────────────────────────────────
  log('Collecting data...');

  const gitData      = collectGitActivity();
  const pm2Logs      = collectPM2Logs();
  const sprintData   = collectSprintStatus();
  const healthData   = collectSystemHealth();
  const reportsData  = collectRecentReports();
  const supabaseData = await collectSupabaseData();
  const githubData   = await collectGitHubData();
  const vercelData   = await collectVercelDeployments();

  const allData = [gitData, sprintData, healthData, supabaseData, githubData, vercelData].join('\n\n');

  // ── 2. Summarize the hour ───────────────────────────────────────────────
  log('Summarizing with Claude...');

  const hourSummary = await callClaude(
    `You are the memory system for Invoica, an AI-native invoicing startup.
Write a concise hourly activity entry. Be factual and specific.
Include: what changed, errors seen, sprint progress, any anomalies.
Format: dense markdown bullet points. No fluff. Max 300 words.`,
    `Hourly snapshot at ${HOUR}:\n\n${allData.slice(0, 10_000)}\n\nPM2 LOGS:\n${pm2Logs.slice(0, 3_000)}`
  );

  // ── 3. Append to daily log ──────────────────────────────────────────────
  const hourlySection = `## ${HOUR}\n\n${hourSummary}\n\n<details>\n<summary>Raw data</summary>\n\n${allData.slice(0, 4_000)}\n\n</details>`;
  appendToDailyLog(hourlySection);

  // ── 4. Daily continuity brief (once per day, at first run of new day) ──
  const continuityPath = path.join(MEMORY_DIR, 'daily-continuity.md');
  const continuityExists = fs.existsSync(continuityPath);
  const isNewDay = !continuityExists ||
    !fs.readFileSync(continuityPath, 'utf8').includes(`Generated ${TODAY}`);

  if (isNewDay && NOW.getHours() >= 5) {
    // Generate from yesterday's log (only after 05:00 UTC so the log is complete)
    await generateDailyContinuity();

    // ── Trigger docs regeneration once per day (after continuity brief) ──────
    // Scans git log + backend routes → updates JSON data files → pushes → Vercel redeploys
    log('Triggering daily docs regeneration (post continuity brief)...');
    try {
      const result = spawnSync('node', [
        '-r', 'ts-node/register',
        path.join(ROOT, 'scripts', 'generate-docs.ts'),
      ], {
        cwd: ROOT,
        env: {
          ...process.env,
          TS_NODE_TRANSPILE_ONLY: 'true',
          TS_NODE_PROJECT: path.join(ROOT, 'tsconfig.json'),
        },
        timeout: 180_000,
        stdio: 'inherit',
      });
      if (result.status !== 0) {
        log(`[docs-trigger] generate-docs.ts exited with code ${result.status}`);
      } else {
        log('Daily docs regeneration complete → Vercel deploying updated docs');
      }
    } catch (e: any) {
      log(`[docs-trigger] Failed to spawn generate-docs.ts: ${e.message}`);
    }
  }

  // ── 5. Update long-term memory (every 6 hours or on significant events) ─
  const ltmPath = path.join(MEMORY_DIR, 'long-term-memory.md');
  const ltmAge  = fs.existsSync(ltmPath)
    ? Date.now() - fs.statSync(ltmPath).mtimeMs
    : Infinity;
  const ltmStale = ltmAge > 6 * 60 * 60 * 1000; // 6 hours

  if (ltmStale) {
    await updateLongTermMemory(allData, hourSummary);
  }

  // ── 6. Detect anomalies and log them prominently ────────────────────────
  const anomalies: string[] = [];
  if (pm2Logs.match(/WATCHDOG|process\.exit|EADDRINUSE/gi)?.length ?? 0 > 0)
    anomalies.push('⚠️ Watchdog/crash detected in PM2 logs');
  if (pm2Logs.match(/error/gi)?.length ?? 0 > 20)
    anomalies.push('⚠️ High error count in PM2 logs');
  if (allData.includes('Timeout') || allData.includes('ETIMEDOUT'))
    anomalies.push('⚠️ Network timeouts detected');

  if (anomalies.length > 0) {
    log(`ANOMALIES DETECTED:\n${anomalies.join('\n')}`);
    // Append anomaly marker to daily log
    const anomalySection = `## 🚨 Anomalies — ${HOUR}\n\n${anomalies.join('\n')}\n`;
    appendToDailyLog(anomalySection);
  }

  log(`✅ Memory agent run complete — ${HOUR}`);
  log(`Files written to ${MEMORY_DIR}:`);
  log(`  daily-log-${TODAY}.md`);
  if (isNewDay) log(`  daily-continuity.md (refreshed)`);
  if (ltmStale)  log(`  long-term-memory.md (updated)`);

  } finally {
    // Report accumulated token usage + disconnect from Mission Control
    if (_mcInputTokens > 0) {
      await mc.reportTokens('claude-haiku-4-5', _mcInputTokens, _mcOutputTokens, 'memory_run');
    }
    await mc.disconnect();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log(`FATAL: ${msg}`);
  process.exit(1);
});
