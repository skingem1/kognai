#!/usr/bin/env ts-node

/**
 * tax-watchdog-us.ts — Invoica US Tax & VAT Watchdog
 *
 * Monitors US federal and state-level tax regulations relevant to:
 *   - AI agent transactions and digital services
 *   - Marketplace facilitator laws
 *   - Digital goods and services tax
 *   - Crypto / stablecoin (USDC) transaction tax treatment
 *   - Autonomous agent tax obligations
 *
 * Sources monitored:
 *   - IRS.gov (federal: digital assets, digital services)
 *   - Key states: CA, NY, TX, FL, WA, IL, MA, NJ, PA, CO
 *   - MTC (Multistate Tax Commission) guidance
 *   - SSUT (Streamlined Sales and Use Tax)
 *
 * Frequency: Weekly (Monday 07:00 UTC via PM2 cron)
 *
 * Knowledge base: reports/tax/us/knowledge-base.json (compounding)
 * Output: reports/tax/us/YYYY-MM-DD-weekly-report.md
 *
 * Alerts: CEO + CTO briefing + Telegram to owner
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import 'dotenv/config';

// ── Cron guard: prevent PM2 reload from triggering this script off-schedule ──
(function checkCronGuard() {
  const _guardFile = require('path').join(process.cwd(), 'logs', 'cron-guard-tax-watchdog-us.json');
  const _minMs = 160 * 60 * 60 * 1000;
  try {
    const _last = require('fs').existsSync(_guardFile)
      ? JSON.parse(require('fs').readFileSync(_guardFile, 'utf-8')).lastRun
      : 0;
    if (Date.now() - new Date(_last).getTime() < _minMs) {
      const _ago = Math.round((Date.now() - new Date(_last).getTime()) / 3600000);
      console.log(`[CronGuard] tax-watchdog-us: last run ${_ago}h ago (min interval 160h) — skipping`);
      process.exit(0);
    }
  } catch { /* first run or stale guard */ }
  // Update last-run timestamp
  try {
    require('fs').writeFileSync(_guardFile, JSON.stringify({ lastRun: new Date().toISOString() }));
  } catch { /* non-fatal */ }
})();


const ROOT           = path.resolve(__dirname, '..');
const TAX_DIR        = path.join(ROOT, 'reports', 'tax', 'us');
const KB_FILE        = path.join(TAX_DIR, 'knowledge-base.json');
const SOUL_FILE      = path.join(ROOT, 'SOUL.md');
const BASELINE_FILE  = path.join(ROOT, 'reports', 'tax', 'tax-framework-baseline.md');

const TODAY          = new Date().toISOString().slice(0, 10);
const REPORT_FILE    = path.join(TAX_DIR, `${TODAY}-weekly-report.md`);

function ensureDir(d: string) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ─── Knowledge Base ───────────────────────────────────────────────────────

interface TaxEntry {
  id: string;         // unique: "us-irs-digital-assets-2026-01"
  source: string;
  jurisdiction: string;
  topic: string;
  summary: string;
  impact: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  firstSeen: string;
  lastUpdated: string;
  implemented: boolean;
}

interface KnowledgeBase {
  lastRun: string;
  entries: TaxEntry[];
}

function loadKB(): KnowledgeBase {
  try {
    return JSON.parse(fs.readFileSync(KB_FILE, 'utf-8'));
  } catch {
    return { lastRun: '', entries: [] };
  }
}

function saveKB(kb: KnowledgeBase) {
  ensureDir(TAX_DIR);
  fs.writeFileSync(KB_FILE, JSON.stringify(kb, null, 2));
}

// ─── HTTP / API Helpers ───────────────────────────────────────────────────

function apiCall(
  method: string, hostname: string, urlPath: string,
  headers: Record<string, string>, body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      hostname, port: 443, path: urlPath, method,
      headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}) },
    };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function callClaude(system: string, user: string, maxTokens = 2000): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: maxTokens,
    system, messages: [{ role: 'user', content: user }],
  });
  const res = await apiCall('POST', 'api.anthropic.com', '/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY!,
    'anthropic-version': '2023-06-01',
  }, body);
  return JSON.parse(res.body).content?.[0]?.text || '';
}

// Grok (XAI) — primary research engine with live web search
async function searchWithGrok(query: string): Promise<string> {
  try {
    if (!process.env.XAI_API_KEY) return '(XAI_API_KEY not set)';
    const body = JSON.stringify({
      model: 'grok-3-latest',
      messages: [
        { role: 'system', content: 'You are a tax law research specialist with live web access. Search for the most recent official regulations, guidance, and news. Be specific: include names of regulations, effective dates, rates, and jurisdiction names. Cite sources.' },
        { role: 'user', content: query },
      ],
      max_tokens: 3000,
    });
    const baseUrl = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
    const parsed = new URL(baseUrl + '/chat/completions');
    const res = await apiCall('POST', parsed.hostname, parsed.pathname + parsed.search, {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    }, body);
    const data = JSON.parse(res.body);
    return data.choices?.[0]?.message?.content || '(no results from Grok)';
  } catch (e: any) {
    return `(Grok research error: ${e.message})`;
  }
}

// ─── Research Tasks ───────────────────────────────────────────────────────

async function researchUSRegulations(): Promise<string> {
  console.log('[tax-us] Researching US tax regulations via Grok...');

  const query = `
You are a tax research specialist. Research and compile the LATEST US federal and state tax regulations relevant to:
1. AI agent transactions and autonomous digital commerce
2. Digital services tax at federal and state level (CA, NY, TX, FL, WA, IL, MA, NJ, PA, CO)
3. Cryptocurrency / stablecoin (USDC) tax treatment for business transactions
4. Marketplace facilitator laws that could apply to AI agent platforms
5. Sales tax nexus rules for digital-first companies with no physical presence
6. IRS guidance on digital assets used in business payments (Rev. Rul. 2023-14, Notice 2023-27, etc.)
7. Any new 2025-2026 legislation or regulatory proposals affecting AI/digital economy taxation
8. State-level digital economy taxes: Maryland, New York proposed AI taxes, etc.
9. 1099-DA reporting requirements for digital asset payments

Focus on regulations that would affect Invoica: a platform that processes invoices and settles payments in USDC on the Base blockchain for AI agents.

For each development, note:
- Jurisdiction (federal / state name)
- What changed or was proposed
- Effective date or status
- Impact on platforms processing AI agent payments

Search these official sources: irs.gov, congress.gov, state tax authority websites, MTC (streamlined sales tax), SSUT.
Include any news from Q4 2025 and 2026.
`;

  return searchWithGrok(query);
}

// ─── Analysis ─────────────────────────────────────────────────────────────

async function analyzeWithClaude(research: string, existingKB: KnowledgeBase): Promise<{
  newEntries: TaxEntry[];
  updatedEntries: TaxEntry[];
  summary: string;
  invoicaImpact: string;
  gaps: string[];
  priorities: string[];
}> {
  console.log('[tax-us] Analyzing with Claude...');

  const soul     = fs.existsSync(SOUL_FILE)     ? fs.readFileSync(SOUL_FILE, 'utf-8').slice(0, 2000) : '';
  const baseline = fs.existsSync(BASELINE_FILE) ? fs.readFileSync(BASELINE_FILE, 'utf-8') : '';
  const existingTopics = existingKB.entries.map(e => `${e.id}: ${e.topic}`).join('\n');

  const analysisPrompt = `
You are a senior tax counsel for Invoica — the Financial OS for AI Agents.
Invoica processes invoices in USDC on the Base blockchain for AI agents. It handles:
- x402 micropayment protocol (AI agent-to-agent payments)
- Tax compliance and VAT calculation
- Settlement detection on-chain
- Invoice generation for autonomous agents

## Invoica Baseline Tax Framework (Founder Reference Document)
${baseline.slice(0, 3500)}

## Invoica Strategy Context
${soul.slice(0, 800)}

## Research Findings
${research.slice(0, 6000)}

## Existing Knowledge Base Topics (do not duplicate)
${existingTopics || '(empty — first run)'}

## Your Task
Analyze the research and extract actionable regulatory intelligence. Return ONLY valid JSON:

{
  "newEntries": [
    {
      "id": "us-[jurisdiction]-[topic-slug]-[year]",
      "source": "IRS / State name / MTC etc",
      "jurisdiction": "Federal / California / New York / etc",
      "topic": "Short topic description",
      "summary": "What this regulation says (2-3 sentences)",
      "impact": "How this specifically affects Invoica and what we must do",
      "priority": "HIGH / MEDIUM / LOW",
      "firstSeen": "${TODAY}",
      "lastUpdated": "${TODAY}",
      "implemented": false
    }
  ],
  "updatedEntries": [],
  "summary": "Executive summary of this week's US tax landscape for Invoica (3-4 sentences)",
  "invoicaImpact": "Specific impact on Invoica operations and product (what must change, what gaps exist)",
  "gaps": ["List of compliance gaps identified in Invoica based on these regulations"],
  "priorities": ["List of highest priority items for CEO and CTO to address, ranked"]
}

Only include GENUINE new regulatory developments (not already in KB). Focus on practical impact.
`;

  const raw = await callClaude(
    'You are a senior tax counsel producing structured JSON analysis for Invoica. Return ONLY valid JSON, no markdown wrapper.',
    analysisPrompt,
    3000
  );

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch![0]);
  } catch (e) {
    console.log('[tax-us] Parse error, using fallback');
    return {
      newEntries: [],
      updatedEntries: [],
      summary: 'Analysis parsing failed — raw research saved in report.',
      invoicaImpact: 'Manual review required.',
      gaps: [],
      priorities: [],
    };
  }
}

// ─── Telegram Alert ───────────────────────────────────────────────────────

async function sendTelegramAlert(message: string) {
  const token = process.env.CEO_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID;
  if (!token || !chatId) { console.log('[tax-us] Telegram not configured — skipping alert'); return; }

  const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  try {
    await apiCall('POST', 'api.telegram.org', `/bot${token}/sendMessage`, {
      'Content-Type': 'application/json',
    }, body);
    console.log('[tax-us] Telegram alert sent to owner');
  } catch (e: any) {
    console.log(`[tax-us] Telegram error: ${e.message}`);
  }
}

// ─── CEO Briefing ─────────────────────────────────────────────────────────

async function generateCEOBriefing(analysis: Awaited<ReturnType<typeof analyzeWithClaude>>, reportPath: string): Promise<string> {
  if (!analysis.newEntries.length && !analysis.gaps.length) {
    return `🇺🇸 *US Tax Watchdog — Weekly Report*\n\nNo new regulatory developments identified this week.\n\nFull report: \`${path.basename(reportPath)}\``;
  }

  const highPriority = analysis.newEntries.filter(e => e.priority === 'HIGH');
  const medPriority  = analysis.newEntries.filter(e => e.priority === 'MEDIUM');

  let msg = `🇺🇸 *US Tax Watchdog — Weekly Report (${TODAY})*\n\n`;

  if (highPriority.length) {
    msg += `🔴 *High Priority (${highPriority.length})*\n`;
    highPriority.forEach(e => {
      msg += `• *${e.jurisdiction}* — ${e.topic}\n  _${e.impact.slice(0, 150)}_\n\n`;
    });
  }

  if (medPriority.length) {
    msg += `🟡 *Medium Priority (${medPriority.length})*\n`;
    medPriority.forEach(e => {
      msg += `• ${e.jurisdiction}: ${e.topic}\n`;
    });
    msg += '\n';
  }

  if (analysis.gaps.length) {
    msg += `*Invoica Compliance Gaps Identified:*\n`;
    analysis.gaps.slice(0, 5).forEach(g => { msg += `⚠️ ${g}\n`; });
    msg += '\n';
  }

  if (analysis.priorities.length) {
    msg += `*CEO/CTO Action Items:*\n`;
    analysis.priorities.slice(0, 4).forEach((p, i) => { msg += `${i + 1}. ${p}\n`; });
  }

  msg += `\n_Full report saved. Total US KB entries: ${analysis.newEntries.length} new._`;
  return msg;
}

// ─── CTO Briefing file ────────────────────────────────────────────────────

function writeCTOBriefing(analysis: Awaited<ReturnType<typeof analyzeWithClaude>>) {
  const ctoDir = path.join(ROOT, 'reports', 'cto-briefings');
  ensureDir(ctoDir);
  const file = path.join(ctoDir, `${TODAY}-us-tax-briefing.md`);
  const content = `# US Tax Watchdog CTO Briefing — ${TODAY}

## Summary
${analysis.summary}

## Invoica Impact
${analysis.invoicaImpact}

## Compliance Gaps (Product Action Required)
${analysis.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

## Priority Actions for CTO
${analysis.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## New Regulatory Entries
${analysis.newEntries.map(e => `
### ${e.jurisdiction}: ${e.topic} [${e.priority}]
**Source**: ${e.source}
**Summary**: ${e.summary}
**Invoica Impact**: ${e.impact}
`).join('\n')}
`;
  fs.writeFileSync(file, content);
  console.log(`[tax-us] CTO briefing: ${file}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(TAX_DIR);
  console.log(`[tax-us] Starting US Tax Watchdog — ${TODAY}`);

  // Load existing knowledge base
  const kb = loadKB();
  console.log(`[tax-us] Existing KB: ${kb.entries.length} entries`);

  // Research
  const research = await researchUSRegulations();
  console.log(`[tax-us] Research complete (${research.length} chars)`);

  // Analyze
  const analysis = await analyzeWithClaude(research, kb);

  // Update knowledge base (compound knowledge over time)
  if (analysis.newEntries.length) {
    kb.entries.push(...analysis.newEntries);
    console.log(`[tax-us] Added ${analysis.newEntries.length} new KB entries`);
  }
  for (const updated of analysis.updatedEntries) {
    const idx = kb.entries.findIndex(e => e.id === updated.id);
    if (idx >= 0) { kb.entries[idx] = { ...kb.entries[idx], ...updated, lastUpdated: TODAY }; }
  }
  kb.lastRun = TODAY;
  saveKB(kb);

  // Write full report
  const reportContent = `# US Tax Watchdog Report — ${TODAY}

## Executive Summary
${analysis.summary}

## Invoica Impact Assessment
${analysis.invoicaImpact}

## New Developments This Week
${analysis.newEntries.length === 0 ? '_No new regulatory developments identified._' :
    analysis.newEntries.map(e => `
### [${e.priority}] ${e.jurisdiction}: ${e.topic}
**Source**: ${e.source}
**Summary**: ${e.summary}
**Invoica Impact**: ${e.impact}
**Status**: ${e.implemented ? 'Implemented' : 'Pending implementation'}
`).join('\n')}

## Compliance Gaps
${analysis.gaps.length === 0 ? '_None identified this week._' : analysis.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

## Priority Actions (CEO + CTO)
${analysis.priorities.length === 0 ? '_No immediate actions required._' : analysis.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Raw Research (for audit)
<details>
<summary>Full Manus research output</summary>

${research.slice(0, 5000)}

</details>

---
*Knowledge Base: ${kb.entries.length} total entries | Last run: ${TODAY}*
`;

  fs.writeFileSync(REPORT_FILE, reportContent);
  console.log(`[tax-us] Report: ${REPORT_FILE}`);

  // CTO briefing
  writeCTOBriefing(analysis);

  // CEO Telegram briefing
  const telegramMsg = await generateCEOBriefing(analysis, REPORT_FILE);
  await sendTelegramAlert(telegramMsg);

  console.log(`[tax-us] Done. New entries: ${analysis.newEntries.length}, KB total: ${kb.entries.length}`);
}

main().catch(e => { console.error('[tax-us] Fatal:', e); process.exit(1); });
