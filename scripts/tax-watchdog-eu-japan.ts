#!/usr/bin/env ts-node

/**
 * tax-watchdog-eu-japan.ts — Invoica EU5 + Japan Tax & VAT Watchdog
 *
 * Monitors EU and Japanese tax regulations relevant to:
 *   - VAT on digital services (EU VAT Directive + "VAT in the Digital Age" reform)
 *   - AI agent transactions and automated B2B/B2C commerce
 *   - Crypto/stablecoin tax treatment (EU MiCA, Japan FSA)
 *   - DAC7 (digital platform reporting)
 *   - Japanese Consumption Tax on cross-border digital services
 *
 * Jurisdictions:
 *   EU: European Commission, Germany (BMF), France (DGFiP),
 *       Spain (AEAT), Italy (Agenzia delle Entrate), Netherlands (Belastingdienst)
 *   Japan: National Tax Agency (NTA), Financial Services Agency (FSA)
 *
 * Frequency: Weekly (Monday 08:00 UTC via PM2 cron)
 *
 * Knowledge base: reports/tax/eu-japan/knowledge-base.json (compounding)
 * Output: reports/tax/eu-japan/YYYY-MM-DD-weekly-report.md
 *
 * Alerts: CEO + CTO briefing + Telegram to owner
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import 'dotenv/config';

// ── Cron guard: prevent PM2 reload from triggering this script off-schedule ──
(function checkCronGuard() {
  const _guardFile = require('path').join(process.cwd(), 'logs', 'cron-guard-tax-watchdog-eu-japan.json');
  const _minMs = 160 * 60 * 60 * 1000;
  try {
    const _last = require('fs').existsSync(_guardFile)
      ? JSON.parse(require('fs').readFileSync(_guardFile, 'utf-8')).lastRun
      : 0;
    if (Date.now() - new Date(_last).getTime() < _minMs) {
      const _ago = Math.round((Date.now() - new Date(_last).getTime()) / 3600000);
      console.log(`[CronGuard] tax-watchdog-eu-japan: last run ${_ago}h ago (min interval 160h) — skipping`);
      process.exit(0);
    }
  } catch { /* first run or stale guard */ }
  // Update last-run timestamp
  try {
    require('fs').writeFileSync(_guardFile, JSON.stringify({ lastRun: new Date().toISOString() }));
  } catch { /* non-fatal */ }
})();


const ROOT        = path.resolve(__dirname, '..');
const TAX_DIR     = path.join(ROOT, 'reports', 'tax', 'eu-japan');
const KB_FILE     = path.join(TAX_DIR, 'knowledge-base.json');
const SOUL_FILE   = path.join(ROOT, 'SOUL.md');
const BASELINE_FILE = path.join(ROOT, 'reports', 'tax', 'tax-framework-baseline.md');
const TODAY       = new Date().toISOString().slice(0, 10);
const REPORT_FILE = path.join(TAX_DIR, `${TODAY}-weekly-report.md`);

function ensureDir(d: string) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ─── Knowledge Base ───────────────────────────────────────────────────────

interface TaxEntry {
  id: string;
  source: string;
  jurisdiction: string;
  topic: string;
  summary: string;
  impact: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  firstSeen: string;
  lastUpdated: string;
  implemented: boolean;
  vatRate?: string;
  effectiveDate?: string;
}

interface KnowledgeBase {
  lastRun: string;
  entries: TaxEntry[];
}

function loadKB(): KnowledgeBase {
  try { return JSON.parse(fs.readFileSync(KB_FILE, 'utf-8')); }
  catch { return { lastRun: '', entries: [] }; }
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

async function callClaude(system: string, user: string, maxTokens = 2500): Promise<string> {
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
        { role: 'system', content: 'You are an international tax law research specialist with live web access. Search for the most recent official regulations, VAT directives, and government guidance. Be specific: include regulation names, effective dates, VAT rates, and jurisdiction names. Cite sources.' },
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

async function researchEU(): Promise<string> {
  console.log('[tax-eu-jp] Researching EU VAT/tax regulations via Grok...');

  return searchWithGrok(`
You are a European tax research specialist. Research and compile the LATEST EU regulations relevant to Invoica:
A platform that processes USDC (stablecoin) invoices and payments for AI agents on the Base blockchain.

Focus areas:
1. EU VAT Directive updates for digital services (2025-2026)
   - "VAT in the Digital Age" (ViDA) reform package — latest status and implementation dates
   - OSS (One-Stop-Shop) VAT registration requirements for AI platforms
   - B2B vs B2C digital services VAT rules

2. Germany (BMF - Bundeszentralamt für Steuern):
   - Digital services VAT treatment
   - Crypto/stablecoin transaction tax guidance (any 2025-2026 guidance letters)
   - AI platform service classification

3. France (DGFiP - Direction Générale des Finances Publiques):
   - French digital services VAT (TVA sur services numériques)
   - PAFI (Plateforme automatisée de filtrage des infractions) impact on payment platforms
   - Any 2025-2026 finance law provisions affecting digital economy

4. Spain (AEAT - Agencia Estatal de Administración Tributaria):
   - IVA (VAT) on digital services, current rate 21%
   - Any new digital platform reporting requirements
   - Crypto/stablecoin business transactions treatment

5. Italy (Agenzia delle Entrate):
   - IVA on digital services
   - DAC7 implementation — digital platform reporting to tax authority
   - Crypto tax provisions in 2025-2026 budget law

6. Netherlands (Belastingdienst):
   - BTW (VAT) on digital services
   - Dutch approach to crypto business transactions
   - Any sandbox or innovative fintech tax framework

7. EU-wide:
   - MiCA (Markets in Crypto-Assets Regulation) — tax implications for stablecoin payments
   - DAC8 directive — crypto asset reporting by service providers
   - EU AI Act — any tax/compliance dimensions for AI agent platforms
   - CESOP (Central Electronic System of Payment information) — payment tracking

8. For each country: current VAT rate on digital B2B services, threshold for registration, reporting obligations

Search official sources: ec.europa.eu, bundesfinanzministerium.de, impots.gouv.fr, agenciatributaria.es, agenziaentrate.gov.it, belastingdienst.nl, consilium.europa.eu
Include 2025-2026 developments.
`);
}

async function researchJapan(): Promise<string> {
  console.log('[tax-eu-jp] Researching Japan tax regulations via Grok...');

  return searchWithGrok(`
Research Japan's National Tax Agency (NTA) and FSA regulations relevant to Invoica — a platform processing USDC payments for AI agents:

1. Japanese Consumption Tax (JCT) on cross-border digital services:
   - Current rate: 10% standard, 8% reduced
   - "Specified platform" rules for foreign digital service providers
   - B2B reverse charge mechanism — how it applies to AI agent platforms
   - Registration requirements for foreign providers (since Oct 2015, updated rules)

2. NTA guidance on crypto/stablecoin tax treatment (2025-2026):
   - USDC treatment for business income
   - Stablecoin-denominated invoice settlement — is this a taxable crypto event?
   - Updated NTA FAQ on crypto tax for businesses

3. FSA (Financial Services Agency) on stablecoins:
   - Payment Services Act amendments for stablecoin regulations (June 2023 law, implementation)
   - USDC specifically: is it a regulated stablecoin in Japan?
   - Licensing requirements for platforms accepting stablecoin payments

4. Japan AI Strategy — any tax incentives or special rules for AI companies
5. Invoice system reform (インボイス制度) — qualified invoice issuer system (started Oct 2023)
   - How this applies to foreign AI platforms invoicing Japanese businesses
   - Digital invoice requirements

6. Any 2025-2026 budget proposals or tax authority guidance on AI economy

Search: nta.go.jp, fsa.go.jp, mof.go.jp, meti.go.jp, parliament.go.jp
Include English-language summaries where available.
`);
}

// ─── Analysis ─────────────────────────────────────────────────────────────

async function analyzeWithClaude(
  euResearch: string,
  jpResearch: string,
  existingKB: KnowledgeBase
): Promise<{
  newEntries: TaxEntry[];
  updatedEntries: TaxEntry[];
  summary: string;
  invoicaImpact: string;
  gaps: string[];
  priorities: string[];
  vatRates: Record<string, string>;
}> {
  console.log('[tax-eu-jp] Analyzing with Claude...');
  const soul     = fs.existsSync(SOUL_FILE)     ? fs.readFileSync(SOUL_FILE, 'utf-8').slice(0, 1500) : '';
  const baseline = fs.existsSync(BASELINE_FILE) ? fs.readFileSync(BASELINE_FILE, 'utf-8') : '';
  const existingTopics = existingKB.entries.map(e => `${e.id}: ${e.topic}`).join('\n');

  const raw = await callClaude(
    'You are a senior international tax counsel for Invoica. Return ONLY valid JSON, no markdown wrapper. Be concise in summaries to fit within token limits.',
    `You are analyzing EU5 and Japan tax regulations for Invoica (USDC invoices on Base blockchain for AI agents).

## Invoica Baseline Framework (key rules only)
${baseline.slice(0, 1800)}

## Existing KB (do not duplicate)
${existingTopics || '(empty — first run)'}

## EU Research Findings
${euResearch.slice(0, 3000)}

## Japan Research Findings
${jpResearch.slice(0, 2500)}

## Task — Return valid JSON:
{
  "newEntries": [
    {
      "id": "eu-[country-code]-[topic-slug]-[year]",
      "source": "Official source name",
      "jurisdiction": "EU / Germany / France / Spain / Italy / Netherlands / Japan",
      "topic": "Short topic description",
      "summary": "What this regulation says (2-3 sentences)",
      "impact": "Specific impact on Invoica — what must we build/change",
      "priority": "HIGH / MEDIUM / LOW",
      "firstSeen": "${TODAY}",
      "lastUpdated": "${TODAY}",
      "implemented": false,
      "vatRate": "21% / 20% / 10% / etc (if applicable)",
      "effectiveDate": "YYYY-MM-DD or 'In effect' or 'Proposed'"
    }
  ],
  "updatedEntries": [],
  "summary": "Executive summary of EU+Japan tax landscape for Invoica (3-4 sentences)",
  "invoicaImpact": "What Invoica must build or change to comply with EU+Japan regulations",
  "gaps": ["Specific compliance gaps in Invoica based on these regulations"],
  "priorities": ["Ranked action items for CEO and CTO"],
  "vatRates": {
    "Germany": "19%",
    "France": "20%",
    "Spain": "21%",
    "Italy": "22%",
    "Netherlands": "21%",
    "Japan_standard": "10%"
  }
}

Focus on genuine new developments, practical Invoica impact, and concrete product gaps. Keep each summary under 2 sentences to stay within token limits.`
    , 4096
  );

  try {
    // Robust JSON extraction — handle incomplete responses
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON object found');
    let jsonStr = jsonMatch[0];
    // Attempt to close unclosed JSON if truncated
    const openBrackets = (jsonStr.match(/\[/g) || []).length;
    const closeBrackets = (jsonStr.match(/\]/g) || []).length;
    const openBraces = (jsonStr.match(/\{/g) || []).length;
    const closeBraces = (jsonStr.match(/\}/g) || []).length;
    if (openBrackets > closeBrackets) jsonStr += ']'.repeat(openBrackets - closeBrackets);
    if (openBraces > closeBraces) jsonStr += '}'.repeat(openBraces - closeBraces);
    const parsed = JSON.parse(jsonStr);
    // Normalize: ensure all array fields are actually arrays (LLM may omit them)
    return {
      newEntries:     Array.isArray(parsed.newEntries)     ? parsed.newEntries     : [],
      updatedEntries: Array.isArray(parsed.updatedEntries) ? parsed.updatedEntries : [],
      summary:        parsed.summary        || 'No summary provided.',
      invoicaImpact:  parsed.invoicaImpact  || 'See raw research in report.',
      gaps:           Array.isArray(parsed.gaps)           ? parsed.gaps           : [],
      priorities:     Array.isArray(parsed.priorities)     ? parsed.priorities     : [],
      vatRates:       parsed.vatRates && typeof parsed.vatRates === 'object' ? parsed.vatRates : {},
    };
  } catch {
    return {
      newEntries: [], updatedEntries: [],
      summary: 'Analysis parsing failed — manual review required.',
      invoicaImpact: 'See raw research in report.',
      gaps: [], priorities: [],
      vatRates: {
        Germany: '19%', France: '20%', Spain: '21%',
        Italy: '22%', Netherlands: '21%', Japan_standard: '10%',
      },
    };
  }
}

// ─── Telegram Alert ───────────────────────────────────────────────────────

async function sendTelegramAlert(message: string) {
  const token = process.env.CEO_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID;
  if (!token || !chatId) { console.log('[tax-eu-jp] Telegram not configured'); return; }
  const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  try {
    await apiCall('POST', 'api.telegram.org', `/bot${token}/sendMessage`, {
      'Content-Type': 'application/json',
    }, body);
    console.log('[tax-eu-jp] Telegram alert sent');
  } catch (e: any) {
    console.log(`[tax-eu-jp] Telegram error: ${e.message}`);
  }
}

// ─── CEO Telegram Briefing ────────────────────────────────────────────────

function buildTelegramBriefing(analysis: Awaited<ReturnType<typeof analyzeWithClaude>>, totalKB: number): string {
  const highPriority = analysis.newEntries.filter(e => e.priority === 'HIGH');
  const medPriority  = analysis.newEntries.filter(e => e.priority === 'MEDIUM');

  if (!analysis.newEntries.length && !analysis.gaps.length) {
    return `🇪🇺🇯🇵 *EU+Japan Tax Watchdog — Weekly (${TODAY})*\n\nNo new regulatory developments this week.\n_KB: ${totalKB} entries_`;
  }

  let msg = `🇪🇺🇯🇵 *EU+Japan Tax Watchdog — ${TODAY}*\n\n`;
  msg += `_${analysis.summary.slice(0, 300)}_\n\n`;

  if (highPriority.length) {
    msg += `🔴 *${highPriority.length} High Priority Item(s)*\n`;
    highPriority.forEach(e => {
      msg += `• *${e.jurisdiction}* — ${e.topic}\n`;
      if (e.vatRate) msg += `  VAT: ${e.vatRate}`;
      if (e.effectiveDate) msg += ` | Effective: ${e.effectiveDate}`;
      msg += `\n  _${e.impact.slice(0, 120)}_\n\n`;
    });
  }

  if (medPriority.length) {
    msg += `🟡 *${medPriority.length} Medium Priority*\n`;
    medPriority.slice(0, 3).forEach(e => { msg += `• ${e.jurisdiction}: ${e.topic}\n`; });
    msg += '\n';
  }

  if (analysis.gaps.length) {
    msg += `*⚠️ Invoica Compliance Gaps:*\n`;
    analysis.gaps.slice(0, 4).forEach(g => { msg += `• ${g.slice(0, 100)}\n`; });
    msg += '\n';
  }

  if (analysis.priorities.length) {
    msg += `*📋 CEO/CTO Action Items:*\n`;
    analysis.priorities.slice(0, 4).forEach((p, i) => { msg += `${i + 1}. ${p.slice(0, 120)}\n`; });
  }

  // VAT rates summary
  if (analysis.vatRates && Object.keys(analysis.vatRates).length) {
    msg += `\n*Current VAT Rates on Digital Services:*\n`;
    Object.entries(analysis.vatRates).forEach(([country, rate]) => {
      msg += `${country}: ${rate}  `;
    });
  }

  msg += `\n\n_KB: ${totalKB} total entries | New this week: ${analysis.newEntries.length}_`;
  return msg;
}

// ─── CTO Briefing ─────────────────────────────────────────────────────────

function writeCTOBriefing(analysis: Awaited<ReturnType<typeof analyzeWithClaude>>) {
  const ctoDir = path.join(ROOT, 'reports', 'cto-briefings');
  ensureDir(ctoDir);
  const file = path.join(ctoDir, `${TODAY}-eu-japan-tax-briefing.md`);
  fs.writeFileSync(file, `# EU+Japan Tax Watchdog CTO Briefing — ${TODAY}

## Summary
${analysis.summary}

## Invoica Product Impact
${analysis.invoicaImpact}

## Compliance Gaps (Product Action Required)
${analysis.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n') || 'None identified.'}

## Priority Actions
${analysis.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n') || 'None required this week.'}

## VAT Rate Reference
${Object.entries(analysis.vatRates || {}).map(([c, r]) => `- ${c}: ${r}`).join('\n')}

## New Regulatory Entries
${analysis.newEntries.map(e => `
### [${e.priority}] ${e.jurisdiction}: ${e.topic}
**Source**: ${e.source}
**VAT Rate**: ${e.vatRate || 'N/A'} | **Effective**: ${e.effectiveDate || 'N/A'}
**Summary**: ${e.summary}
**Invoica Impact**: ${e.impact}
**Status**: ${e.implemented ? '✅ Implemented' : '⏳ Pending'}
`).join('\n')}
`);
  console.log(`[tax-eu-jp] CTO briefing: ${file}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(TAX_DIR);
  console.log(`[tax-eu-jp] Starting EU+Japan Tax Watchdog — ${TODAY}`);

  const kb = loadKB();
  console.log(`[tax-eu-jp] Existing KB: ${kb.entries.length} entries`);

  // Run EU and Japan research in parallel
  console.log('[tax-eu-jp] Running parallel research (EU + Japan)...');
  const [euResearch, jpResearch] = await Promise.all([
    researchEU(),
    researchJapan(),
  ]);
  console.log(`[tax-eu-jp] EU: ${euResearch.length} chars | Japan: ${jpResearch.length} chars`);

  // Analyze
  const analysis = await analyzeWithClaude(euResearch, jpResearch, kb);

  // Update KB (defensive guards in case LLM omits arrays)
  kb.entries.push(...(analysis.newEntries || []));
  for (const u of (analysis.updatedEntries || [])) {
    const idx = kb.entries.findIndex(e => e.id === u.id);
    if (idx >= 0) kb.entries[idx] = { ...kb.entries[idx], ...u, lastUpdated: TODAY };
  }
  kb.lastRun = TODAY;
  saveKB(kb);

  // Full report
  const report = `# EU+Japan Tax Watchdog Report — ${TODAY}

## Executive Summary
${analysis.summary}

## Invoica Impact Assessment
${analysis.invoicaImpact}

## VAT Rate Reference Card
| Jurisdiction | VAT Rate on Digital B2B Services |
|---|---|
${Object.entries(analysis.vatRates || {}).map(([c, r]) => `| ${c} | ${r} |`).join('\n')}

## New Developments This Week
${analysis.newEntries.length === 0 ? '_No new developments identified._' :
    analysis.newEntries.map(e => `
### [${e.priority}] ${e.jurisdiction}: ${e.topic}
**Source**: ${e.source}
**VAT Rate**: ${e.vatRate || 'N/A'} | **Effective**: ${e.effectiveDate || 'N/A'}
**Summary**: ${e.summary}
**Invoica Impact**: ${e.impact}
`).join('\n')}

## Compliance Gaps
${analysis.gaps.length === 0 ? '_None identified._' : analysis.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

## Priority Actions (CEO + CTO)
${analysis.priorities.length === 0 ? '_No immediate actions._' : analysis.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Raw EU Research
<details><summary>EU Manus Research</summary>

${euResearch.slice(0, 4000)}

</details>

## Raw Japan Research
<details><summary>Japan Manus Research</summary>

${jpResearch.slice(0, 3000)}

</details>

---
*KB: ${kb.entries.length} total entries | Last run: ${TODAY}*
`;

  fs.writeFileSync(REPORT_FILE, report);
  console.log(`[tax-eu-jp] Report: ${REPORT_FILE}`);

  writeCTOBriefing(analysis);

  const telegramMsg = buildTelegramBriefing(analysis, kb.entries.length);
  await sendTelegramAlert(telegramMsg);

  console.log(`[tax-eu-jp] Done. New: ${analysis.newEntries.length}, KB total: ${kb.entries.length}`);
}

main().catch(e => { console.error('[tax-eu-jp] Fatal:', e); process.exit(1); });
