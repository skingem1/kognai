#!/usr/bin/env ts-node
/**
 * generate-docs.ts — Auto-generates live documentation from actual codebase state
 *
 * Called daily by memory-agent (or manually). Sources of truth:
 *   - git log          → CHANGELOG.md + frontend changelog page
 *   - backend/routes/  → docs/api-contract.md + frontend API reference page
 *   - sdk/typescript/  → frontend SDK reference page
 *   - sprints/         → sprint history section of changelog
 *
 * Writes:
 *   CHANGELOG.md                                  — standard root changelog (markdown)
 *   docs/api-contract.md                          — full API contract (markdown)
 *   frontend/public/data/changelog.json           — structured JSON for frontend
 *   frontend/public/data/api-reference.json       — structured JSON for frontend
 *   frontend/app/docs/changelog/page.tsx          — rewrites React page to load from JSON
 *   frontend/app/docs/api-reference/page.tsx      — rewrites React page to load from JSON
 *
 * After writing, does git add/commit/push if anything changed → Vercel auto-deploys.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';
import 'dotenv/config';

const ROOT          = process.cwd();
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── Logging ────────────────────────────────────────────────────────────────
function log(msg: string): void {
  console.log(`[DocGen] ${new Date().toISOString().slice(0, 19)} ${msg}`);
}

// ── LLM helper ─────────────────────────────────────────────────────────────
async function callClaude(system: string, user: string, maxTokens = 3000): Promise<string> {
  if (!ANTHROPIC_KEY) { log('No ANTHROPIC_API_KEY — skipping LLM step'); return ''; }
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())?.content?.[0]?.text || ''); }
        catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.setTimeout(60_000, () => { req.destroy(); resolve(''); });
    req.write(body); req.end();
  });
}

// ── CHANGELOG GENERATION ───────────────────────────────────────────────────

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

function getGitLog(since?: string): string {
  const sinceFlag = since ? `--since="${since}"` : '--since="2026-02-20"';
  try {
    return execSync(
      `git log ${sinceFlag} --pretty=format:"%h %ad %s" --date=short`,
      { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }
    ).trim();
  } catch { return ''; }
}

function getSprintHistory(): string {
  const sprintsDir = path.join(ROOT, 'sprints');
  if (!fs.existsSync(sprintsDir)) return '';
  const files = fs.readdirSync(sprintsDir)
    .filter(f => f.match(/^week-\d+\.json$/))
    .sort((a, b) => parseInt(b.match(/\d+/)?.[0] || '0') - parseInt(a.match(/\d+/)?.[0] || '0'))
    .slice(0, 20);

  return files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sprintsDir, f), 'utf8'));
      const tasks: any[] = Array.isArray(data) ? data : (data.tasks || []);
      const done = tasks.filter(t => t.status === 'done');
      if (!done.length) return null;
      const ids = done.slice(0, 5).map(t => t.id).join(', ');
      return `${f}: ${done.length} tasks done (${ids}${done.length > 5 ? '...' : ''})`;
    } catch { return null; }
  }).filter(Boolean).join('\n');
}

async function generateChangelog(): Promise<{ entries: ChangelogEntry[]; markdown: string }> {
  log('Generating changelog from git log + sprints...');

  const gitLog     = getGitLog('2026-02-20');
  const sprints    = getSprintHistory();
  const today      = new Date().toISOString().slice(0, 10);

  // Existing entries to preserve
  const existingEntries: ChangelogEntry[] = [
    { version: '1.4.0', date: '2026-02-20', changes: [
      'New Web3 Growth plan at $24/mo with 5,000 invoices and 25,000 API calls',
      'Web3 projects see tailored pricing during onboarding',
      'Registered companies see Free + Pro ($49) + Enterprise tiers',
      'Added Plans & Pricing documentation page',
    ]},
    { version: '1.3.0', date: '2026-02-16', changes: [
      'Added backend API routes for invoices, API keys, webhooks, and settlements',
      'Added Express app entry point with middleware stack',
      'Completed SDK test coverage for retry, debug, and client-config modules',
    ]},
    { version: '1.2.0', date: '2026-02-15', changes: [
      'Fixed SDK import chain — all modules now use v2 transport and error handling',
      'Added SDK tests for pagination, events, and timeout modules',
      'New documentation pages: error handling, environments, quickstart',
    ]},
    { version: '1.1.0', date: '2026-02-14', changes: [
      'SDK consolidation — barrel exports, interceptors, environment detection',
      'New tests for rate-limit, error-compat, and request-builder',
      'Added webhook events and quickstart documentation',
    ]},
    { version: '1.0.0', date: '2026-02-13', changes: [
      'Initial release of Invoica TypeScript SDK',
      'Core client with invoice, settlement, and API key management',
      'Webhook signature verification and rate limiting',
    ]},
  ];

  // Ask LLM to produce new entries from git log
  const llmEntries = await callClaude(
    `You are a technical writer for Invoica, an AI-native invoicing platform.
Generate changelog entries from git commit history. Rules:
- Group commits into weekly releases (v1.5.0, v1.6.0, v1.7.0, etc. — increment from v1.4.0)
- Each entry: { "version": "x.y.0", "date": "YYYY-MM-DD", "changes": ["...", "..."] }
- 3-6 changes per version, written from a user/developer perspective
- Skip internal/ops commits (fix typos, merge, ci: tweaks)
- Focus on: new endpoints, features, bug fixes, SDK improvements, x402 payments, agent capabilities
- Return ONLY valid JSON array, no markdown, no explanation`,
    `Git log since v1.4.0 (2026-02-20):\n${gitLog}\n\nSprint history:\n${sprints}\n\nReturn a JSON array of new changelog entries starting from v1.5.0.`
  );

  let newEntries: ChangelogEntry[] = [];
  try {
    const parsed = JSON.parse(llmEntries.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    newEntries = Array.isArray(parsed) ? parsed : [];
  } catch {
    // Fallback: generate a single entry from known facts
    newEntries = [{
      version: '1.5.0',
      date: today,
      changes: [
        'Added x402 payment protocol — agents pay 0.001 USDC per LLM call via EIP-3009',
        'New POST /v1/ai/inference endpoint with x402 payment verification middleware',
        'Fixed GET /v1/invoices/number/:n route order (was returning 404)',
        'GET /v1/settlements now returns real settled invoices from database',
        'CEO AI bot isolated to standalone PM2 process (fixes ~4800 backend restarts)',
        'Memory agent: hourly black-box observer writing daily-log, continuity brief, and long-term memory',
      ],
    }];
  }

  // Sort: newest first
  const allEntries = [...newEntries, ...existingEntries]
    .sort((a, b) => b.date.localeCompare(a.date));

  // Build markdown
  const lines = ['# Changelog\n', 'All notable changes to Invoica are documented here.\n'];
  for (const e of allEntries) {
    lines.push(`## [${e.version}] — ${e.date}\n`);
    e.changes.forEach(c => lines.push(`- ${c}`));
    lines.push('');
  }

  return { entries: allEntries, markdown: lines.join('\n') };
}

// ── API REFERENCE GENERATION ───────────────────────────────────────────────

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  auth: string;
  tags: string[];
}

function scanRoutes(): ApiEndpoint[] {
  const routesDir = path.join(ROOT, 'backend', 'src', 'routes');
  if (!fs.existsSync(routesDir)) return [];

  const endpoints: ApiEndpoint[] = [];
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts') && !f.startsWith('__'));

  // Known descriptions (supplement LLM)
  const knownDescriptions: Record<string, string> = {
    'GET /v1/health':                     'Health check — returns API status and uptime',
    'POST /v1/invoices':                  'Create a new invoice',
    'GET /v1/invoices/number/:number':    'Get invoice by invoice number',
    'GET /v1/invoices/:id':               'Get invoice by UUID',
    'POST /v1/api-keys':                  'Create a new API key',
    'GET /v1/api-keys':                   'List all API keys for the authenticated user',
    'POST /v1/api-keys/:id/revoke':       'Revoke an API key',
    'POST /v1/api-keys/:id/rotate':       'Rotate (regenerate) an API key',
    'POST /v1/webhooks':                  'Register a new webhook endpoint',
    'GET /v1/webhooks':                   'List all registered webhooks',
    'DELETE /v1/webhooks/:id':            'Delete a webhook',
    'GET /v1/settlements':                'List all settlements (paid/completed invoices)',
    'GET /v1/settlements/:id':            'Get settlement details by ID',
    'GET /v1/ai/inference':               'Get x402 payment requirements for AI inference',
    'POST /v1/ai/inference':              'Call AI model (MiniMax or Claude) via x402 USDC payment',
    'POST /v1/ledger/send-verification':  'Send email verification for ledger access',
    'POST /v1/ledger/confirm-verification':'Confirm email verification code',
    'GET /v1/ledger':                     'Get ledger transactions (requires API key)',
    'GET /v1/ledger/summary':             'Get ledger summary statistics (requires API key)',
    'GET /v1/ledger/export.csv':          'Export ledger as CSV (requires API key)',
  };

  const authMap: Record<string, string> = {
    'requireApiKey': 'API Key (X-API-Key header)',
    'requireX402Payment': 'x402 Payment (X-Payment header, USDC on Base)',
  };

  for (const file of files) {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
    const matches = content.matchAll(/router\.(get|post|put|delete|patch)\('([^']+)'([^)]*)/gi);
    const tag = file.replace('.ts', '').replace(/-/g, ' ');

    for (const match of matches) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const middlewares = match[3] || '';
      const key = `${method} ${routePath}`;

      let auth = 'None';
      for (const [mw, label] of Object.entries(authMap)) {
        if (middlewares.includes(mw)) { auth = label; break; }
      }

      endpoints.push({
        method,
        path: routePath,
        description: knownDescriptions[key] || `${method} ${routePath}`,
        auth,
        tags: [tag],
      });
    }
  }

  return endpoints;
}

function generateApiContract(endpoints: ApiEndpoint[]): string {
  const groups: Record<string, ApiEndpoint[]> = {};
  endpoints.forEach(ep => {
    const tag = ep.tags[0] || 'other';
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(ep);
  });

  const lines = [
    '# Invoica API Contract',
    '',
    `*Auto-generated ${new Date().toISOString().slice(0, 10)} from backend/src/routes/*`,
    '',
    '## Base URL',
    '```',
    'https://invoica.wp1.host/v1',
    '```',
    '',
    '## Authentication',
    '',
    '| Method | Header | Required for |',
    '|--------|--------|-------------|',
    '| API Key | `X-API-Key: your-key` | Ledger endpoints |',
    '| x402 Payment | `X-Payment: base64(EIP-3009 proof)` | AI inference |',
    '',
  ];

  for (const [group, eps] of Object.entries(groups)) {
    lines.push(`## ${group.charAt(0).toUpperCase() + group.slice(1)}`);
    lines.push('');
    for (const ep of eps) {
      lines.push(`### \`${ep.method} ${ep.path}\``);
      lines.push(`${ep.description}`);
      lines.push(`**Auth:** ${ep.auth}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── FRONTEND PAGE GENERATORS ───────────────────────────────────────────────

function generateChangelogPage(): string {
  return `'use client';
import changelogData from '../../../public/data/changelog.json';

interface ChangeEntry {
  version: string;
  date: string;
  changes: string[];
}

export default function ChangelogPage() {
  const entries: ChangeEntry[] = changelogData;
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Changelog</h1>
      <p className="text-sm text-gray-500 mb-8">
        Auto-generated from git history · Last updated {entries[0]?.date ?? 'N/A'}
      </p>
      <div className="space-y-8">
        {entries.map((entry) => (
          <div key={entry.version} className="border-l-4 border-blue-500 pl-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl font-semibold">v{entry.version}</span>
              <span className="text-sm text-gray-500">{entry.date}</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              {entry.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
`;
}

function generateApiReferencePage(endpoints: ApiEndpoint[]): string {
  const methodStyles: Record<string, string> = {
    GET:    'bg-green-100 text-green-800',
    POST:   'bg-blue-100 text-blue-800',
    PUT:    'bg-yellow-100 text-yellow-800',
    DELETE: 'bg-red-100 text-red-800',
    PATCH:  'bg-purple-100 text-purple-800',
  };

  return `'use client';
import apiData from '../../../public/data/api-reference.json';

interface Endpoint {
  method: string;
  path: string;
  description: string;
  auth: string;
  tags: string[];
}

const methodStyles: Record<string, string> = ${JSON.stringify(methodStyles, null, 2)};

export default function ApiReferencePage() {
  const endpoints: Endpoint[] = apiData;
  const groups = endpoints.reduce((acc: Record<string, Endpoint[]>, ep) => {
    const tag = ep.tags[0] || 'other';
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(ep);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">API Reference</h1>
      <p className="text-sm text-gray-500 mb-4">
        Auto-generated · {endpoints.length} endpoints · Base URL:
        <code className="bg-gray-100 px-2 py-0.5 rounded ml-1">https://invoica.wp1.host/v1</code>
      </p>
      <section className="mb-8 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Authentication</h2>
        <p className="text-sm text-gray-600">
          Ledger endpoints require <code className="bg-white px-1 rounded">X-API-Key</code> header.
          AI inference uses x402 payment (<code className="bg-white px-1 rounded">X-Payment</code> header, USDC on Base).
        </p>
      </section>

      {Object.entries(groups).map(([group, eps]) => (
        <section key={group} className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 capitalize">{group}</h2>
          {eps.map((ep, i) => (
            <div key={i} className="border rounded-lg p-4 mb-3">
              <div className="flex items-center gap-3 mb-1">
                <span className={\`px-2 py-0.5 rounded text-xs font-bold \${methodStyles[ep.method] || 'bg-gray-100 text-gray-800'}\`}>
                  {ep.method}
                </span>
                <span className="font-mono text-sm text-gray-800">{ep.path}</span>
                {ep.auth !== 'None' && (
                  <span className="ml-auto text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">🔐 Auth</span>
                )}
              </div>
              <p className="text-gray-500 text-sm">{ep.description}</p>
              {ep.auth !== 'None' && (
                <p className="text-xs text-gray-400 mt-1">Auth: {ep.auth}</p>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
`;
}

// ── GIT COMMIT & PUSH ──────────────────────────────────────────────────────

function gitCommitAndPush(message: string): boolean {
  try {
    // Pull first to avoid conflicts
    execSync('git pull origin main --quiet', { cwd: ROOT, timeout: 30_000 });
    execSync('git add CHANGELOG.md docs/api-contract.md frontend/public/data/ frontend/app/docs/changelog/page.tsx frontend/app/docs/api-reference/page.tsx', { cwd: ROOT });

    const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (!status) { log('No doc changes — skipping commit'); return false; }

    execSync(`git commit -m "${message}"`, { cwd: ROOT, timeout: 15_000 });
    execSync('git push origin main', { cwd: ROOT, timeout: 30_000 });
    log('Docs committed and pushed → Vercel will redeploy');
    return true;
  } catch (e: any) {
    log(`Git error: ${e.message}`);
    return false;
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('Starting documentation generation...');

  // ── 1. Changelog ─────────────────────────────────────────────────────────
  const { entries, markdown: changelogMd } = await generateChangelog();
  fs.writeFileSync(path.join(ROOT, 'CHANGELOG.md'), changelogMd);
  log(`CHANGELOG.md written (${entries.length} entries)`);

  // ── 2. API reference ─────────────────────────────────────────────────────
  const endpoints = scanRoutes();
  const apiContractMd = generateApiContract(endpoints);
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'api-contract.md'), apiContractMd);
  log(`docs/api-contract.md written (${endpoints.length} endpoints)`);

  // ── 3. Write JSON data files for frontend ─────────────────────────────────
  const dataDir = path.join(ROOT, 'frontend', 'public', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'changelog.json'), JSON.stringify(entries, null, 2));
  fs.writeFileSync(path.join(dataDir, 'api-reference.json'), JSON.stringify(endpoints, null, 2));
  log('frontend/public/data/ JSON files written');

  // ── 4. Rewrite frontend pages (now data-driven) ────────────────────────────
  fs.writeFileSync(
    path.join(ROOT, 'frontend', 'app', 'docs', 'changelog', 'page.tsx'),
    generateChangelogPage()
  );
  fs.writeFileSync(
    path.join(ROOT, 'frontend', 'app', 'docs', 'api-reference', 'page.tsx'),
    generateApiReferencePage(endpoints)
  );
  log('Frontend doc pages updated (data-driven)');

  // ── 5. Commit & push → Vercel auto-deploys ───────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  gitCommitAndPush(
    `docs: auto-update changelog + API reference [${today}]\\n\\n` +
    `Generated by generate-docs.ts:\\n` +
    `  - CHANGELOG.md: ${entries.length} entries (latest: v${entries[0]?.version})\\n` +
    `  - docs/api-contract.md: ${endpoints.length} endpoints\\n` +
    `  - frontend: changelog + API reference pages now data-driven`
  );

  log('✅ Documentation generation complete');
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
