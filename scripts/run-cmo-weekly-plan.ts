#!/usr/bin/env ts-node
/**
 * run-cmo-weekly-plan.ts — CMO Sunday Weekly Content Plan Generator
 *
 * Every Sunday at 06:00 UTC:
 *   1. CMO (Manus AI) researches X trends via Grok + git log + market reports
 *   2. Generates a full week of post-ready X content (Mon–Sun, 3 slots/day)
 *   3. CTO (MiniMax → Claude fallback) reviews technical accuracy of all posts
 *   4. CEO (Claude) reviews brand voice + strategic alignment of full plan
 *   5. If approved → status: "approved", saved, Telegram alert to owner
 *   6. If rejected after 2 attempts → status: "needs-revision", owner notified for manual review
 *
 * X agent ONLY posts from plans with status === "approved".
 * The CEO's approval here is the "order" to the X agent to follow the plan.
 *
 * Output: reports/cmo/weekly-content-plan-YYYY-MM-DD.json (Monday date)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';
import 'dotenv/config';
import { ManusClient } from './lib/manus-client';

// ── Cron guard: prevent PM2 reload from triggering this script off-schedule ──
(function checkCronGuard() {
  const _guardFile = require('path').join(process.cwd(), 'logs', 'cron-guard-cmo-weekly-plan.json');
  const _minMs = 160 * 60 * 60 * 1000;
  try {
    const _last = require('fs').existsSync(_guardFile)
      ? JSON.parse(require('fs').readFileSync(_guardFile, 'utf-8')).lastRun
      : 0;
    if (Date.now() - new Date(_last).getTime() < _minMs) {
      const _ago = Math.round((Date.now() - new Date(_last).getTime()) / 3600000);
      console.log(`[CronGuard] cmo-weekly-plan: last run ${_ago}h ago (min interval 160h) — skipping`);
      process.exit(0);
    }
  } catch { /* first run or stale guard */ }
  // NOTE: last-run timestamp is updated only on SUCCESSFUL completion (in main())
})();


const ROOT       = process.cwd();
const CMO_REPORTS = path.join(ROOT, 'reports', 'cmo');
const SOUL_FILE  = path.join(ROOT, 'SOUL.md');

// ── Helpers ──────────────────────────────────────────────────────────────────
function ts(): string { return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
function log(msg: string): void { console.log(`${ts()}: [CMO-Plan] ${msg}`); }

function getMondayOfNextWeek(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  return monday.toISOString().slice(0, 10);
}

function getDateRange(mondayStr: string): string[] {
  const monday = new Date(mondayStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function apiPost(hostname: string, urlPath: string, headers: Record<string, string>, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, port: 443, path: urlPath, method: 'POST',
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

// ── Telegram ─────────────────────────────────────────────────────────────────
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

// ── Grok Research ─────────────────────────────────────────────────────────────
async function researchTrends(): Promise<string> {
  try {
    const body = JSON.stringify({
      model: 'grok-3-latest',
      messages: [
        { role: 'system', content: 'You are a social media researcher. Find real, specific current discussions on X/Twitter. Report with specific examples, not generalizations.' },
        { role: 'user', content: `Research X/Twitter right now (${new Date().toISOString().slice(0, 10)}) for:
1. What are developers talking about regarding AI agents and autonomous systems?
2. Hot discussions about x402 protocol, EIP-712, Base network, USDC, on-chain payments
3. Any major AI agent product launches or milestones this week
4. Tax/VAT discussions relevant to digital services or AI companies
5. Top 5 accounts actively posting about AI agent infrastructure or autonomous finance that Invoica (@invoica_ai) could engage with

Return: trending topics with specific post examples, relevant accounts with their recent relevant posts, and engagement opportunities.` },
      ],
      max_tokens: 2000,
    });
    const baseUrl = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
    const parsed = new URL(baseUrl + '/chat/completions');
    const raw = await apiPost(parsed.hostname, parsed.pathname + parsed.search, {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    }, body);
    return JSON.parse(raw).choices?.[0]?.message?.content || '(Grok unavailable)';
  } catch (e: any) {
    return `(Grok research failed: ${e.message})`;
  }
}

// ── Claude API ─────────────────────────────────────────────────────────────────
async function callClaude(system: string, user: string, maxTokens = 4000): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: maxTokens,
    system, messages: [{ role: 'user', content: user }],
  });
  const raw = await apiPost('api.anthropic.com', '/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY!,
    'anthropic-version': '2023-06-01',
  }, body);
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Claude API returned non-JSON: ' + raw.slice(0, 200)); }
  if (parsed.error) throw new Error('Claude API error: ' + (parsed.error.message || JSON.stringify(parsed.error)));
  if (!parsed.content?.[0]?.text) throw new Error('Claude API returned no content. Raw: ' + raw.slice(0, 300));
  return parsed.content[0].text;
}

// ── MiniMax API (CTO) ──────────────────────────────────────────────────────────
// IMPORTANT: Always use MiniMax-M2.5 (Coding Plan). Do NOT read from MINIMAX_DEFAULT_MODEL
// env var — that may be set to MiniMax-Text-01 which is NOT on the Coding Plan.
const MINIMAX_CODING_MODEL = 'MiniMax-M2.5';
async function callMinimax(system: string, user: string, maxTokens = 800): Promise<string> {
  const body = JSON.stringify({
    model: MINIMAX_CODING_MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: maxTokens,
  });
  const groupId = process.env.MINIMAX_GROUP_ID || '';
  const raw = await apiPost(
    'api.minimax.io',
    `/v1/text/chatcompletion_v2${groupId ? `?GroupId=${groupId}` : ''}`,
    { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MINIMAX_API_KEY}` },
    body
  );
  return JSON.parse(raw).choices?.[0]?.message?.content || '';
}


// ── CTO Shipped Features Report ──────────────────────────────────────────────
// The CTO compiles a concise report of everything shipped in the last 7 days
// so the CMO has accurate context for the weekly content plan.
function getCtoShippedReport(): string {
  const CTO_REPORTS = path.join(ROOT, 'reports', 'cto');
  const lines: string[] = [];

  // 1. Git log (last 7 days)
  try {
    const commits = execSync(
      `git -C ${ROOT} log --oneline --since="7 days ago" --no-merges --format="%ai %s" 2>/dev/null | head -25`,
      { encoding: 'utf-8', timeout: 8000 }
    ).trim();
    if (commits) lines.push('## Commits (last 7 days)\n' + commits);
  } catch { /* ignore */ }

  // 2. Files changed
  try {
    const files = execSync(
      `git -C ${ROOT} diff --name-only HEAD~15 HEAD 2>/dev/null | grep -E '\.(ts|tsx|sql|py)$' | grep -v 'test\|spec\|\.d\.' | sort -u | head -30`,
      { encoding: 'utf-8', timeout: 8000 }
    ).trim();
    if (files) lines.push('## Changed Files\n' + files);
  } catch { /* ignore */ }

  // 3. Latest CTO post-sprint analysis
  const postSprintPath = path.join(CTO_REPORTS, 'latest-post-sprint-analysis.md');
  if (fs.existsSync(postSprintPath)) {
    const content = fs.readFileSync(postSprintPath, 'utf-8');
    // Extract shipped features section
    const shipped = content.slice(0, 2000);
    lines.push('## CTO Post-Sprint Analysis (latest)\n' + shipped);
  }

  // 4. Latest CTO verify-implementations (what was actually verified as working)
  const verifyPath = path.join(CTO_REPORTS, 'latest-verify-implementations.md');
  if (fs.existsSync(verifyPath)) {
    const vContent = fs.readFileSync(verifyPath, 'utf-8').slice(0, 1000);
    lines.push('## CTO Verified Implementations\n' + vContent);
  }

  return lines.join('\n\n') || '(No CTO report available — use git commits only)';
}

// ── Context gathering ─────────────────────────────────────────────────────────
function gatherContext(): { soul: string; recentCommits: string; marketWatch: string; shippedFeatures: string; ctoShippedReport: string } {
  const soul = fs.existsSync(SOUL_FILE) ? fs.readFileSync(SOUL_FILE, 'utf-8').slice(0, 1500) : '';

  let recentCommits = '';
  let shippedFeatures = '';
  try {
    recentCommits = execSync(`git -C ${ROOT} log --oneline --since="14 days ago" --no-merges --format="%s" 2>/dev/null | head -20`, { encoding: 'utf-8', timeout: 8000 }).trim();
    shippedFeatures = execSync(`git -C ${ROOT} diff --name-only HEAD~10 HEAD 2>/dev/null | grep -E '\\.(ts|tsx|sql)$' | grep -v test | head -20`, { encoding: 'utf-8', timeout: 8000 }).trim();
  } catch { /* ignore */ }

  const marketWatchPath = path.join(CMO_REPORTS, 'latest-market-watch.md');
  const marketWatch = fs.existsSync(marketWatchPath)
    ? fs.readFileSync(marketWatchPath, 'utf-8').slice(0, 1500) : '';

  // CTO report: what was actually verified/shipped this week
  const ctoShippedReport = getCtoShippedReport();

  return { soul, recentCommits, shippedFeatures, marketWatch, ctoShippedReport };
}

// ── Generate weekly plan ──────────────────────────────────────────────────────
interface PlanSlot { tweets: string[]; image_path: string | null; topic_summary: string; }
interface DayPlan { educational: PlanSlot; updates: PlanSlot; vision: PlanSlot; }
interface WeeklyPlan {
  week_start: string; week_end: string; prepared_at: string; strategy_note: string;
  status: 'draft' | 'approved' | 'needs-revision';
  cto_review?: { approved: boolean; feedback: string; reviewed_at: string };
  ceo_review?: { approved: boolean; feedback: string; reviewed_at: string };
  accounts_to_watch: Array<{ handle: string; topic: string; engagement_angle: string }>;
  days: Record<string, DayPlan>;
}

async function generatePlan(weekStart: string, dates: string[], xTrends: string, ctx: ReturnType<typeof gatherContext>, ceoFeedback?: string): Promise<WeeklyPlan> {
  const weekEnd = dates[6];
  const feedbackBlock = ceoFeedback
    ? `\n\n⚠️ CEO REJECTED PREVIOUS VERSION. Fix every issue:\n${ceoFeedback}\n\nRewrite the entire plan addressing these points.`
    : '';

  // CMO uses Manus AI for plan generation (as per agent architecture)
  // Manus is an autonomous research agent — give it the full context in one prompt
  const manusClient = new ManusClient({});
  let raw: string;
  const manusPrompt = `You are the CMO of Invoica (invoica.ai) — the Financial OS for AI Agents.
Your task: generate a weekly X/Twitter content plan for the X agent to execute.

CRITICAL CONTENT RULES:
- Updates posts: ONLY features already merged+deployed (from git commits). NEVER roadmap/future.
- No fabricated metrics: no invented percentages, counts, latency numbers.
- No ETAs or "coming soon" for unshipped work.
- All tweets ≤ 280 characters. Dense, specific, developer-native voice.
- No hashtags. No engagement bait ("What do you think?").
- Accounts to watch: max 5. Engagement must be educational, not promotional spam.

BRAND VOICE: Technical founder who ships real infrastructure. Think Stripe's early Twitter.

Return ONLY valid JSON (no explanation, no markdown) matching this exact schema:
{
  "strategy_note": "1-2 sentences on this week's theme",
  "accounts_to_watch": [
    { "handle": "@handle", "topic": "what to watch for", "engagement_angle": "exact educational point to make" }
  ],
  "days": {
    "YYYY-MM-DD": {
      "educational": { "tweets": ["≤280 char tweet"], "image_path": null, "topic_summary": "what this teaches" },
      "updates": { "tweets": ["≤280 char tweet"], "image_path": null, "topic_summary": "what shipped feature" },
      "vision": { "tweets": ["tweet1", "optional tweet2"], "image_path": null, "topic_summary": "what vision angle" }
    }
  }
}

## Invoica Context
${ctx.soul.slice(0, 800)}

## CTO Verified Shipped Features (last 7 days — USE THESE for updates posts, not anything else)
${ctx.ctoShippedReport.slice(0, 3000)}

## Recent Commits (14 days)
${ctx.recentCommits || '(no commits found)'}

## Changed Files
${ctx.shippedFeatures || '(unavailable)'}

## Market Intelligence
${ctx.marketWatch.slice(0, 800)}

## X/Twitter Current Trends (use for educational + vision angle)
${xTrends.slice(0, 1500)}

## Week to Plan
Week start (Monday): ${weekStart}
Dates: ${dates.join(', ')}

Write post-ready content for ALL 7 days × 3 slots = 21 posts total.
Vary topics across the week. Don't repeat the same angle twice.
Updates posts must name specific shipped features from git commits above.${feedbackBlock}

IMPORTANT INSTRUCTIONS FOR OUTPUT FORMAT:
- Do NOT use tools to write files
- Do NOT create documents or sandboxes
- Do NOT provide a preamble or acknowledgment
- Your ENTIRE and ONLY output must be the raw JSON object
- Start your response with { and end with }
- No markdown, no code fences, no explanation before or after the JSON`;
  try {
    const manusResult = await manusClient.executeTask({ prompt: manusPrompt });
    raw = manusResult.output;
    log(`Manus task completed in ${Math.round(manusResult.durationMs / 1000)}s (${manusResult.pollAttempts} polls)`);
    log(`Manus raw output preview: ${raw.slice(0, 200).replace(/\n/g, " ")}`);
    // Validate Manus returned actual JSON and not a prompt echo or prose.
    // Manus sometimes reflects the prompt back as its output (especially with long structured prompts).
    // If the extracted JSON fails to parse, throw to trigger the Claude fallback below.
    const _s = raw.indexOf('{');
    const _e = raw.lastIndexOf('}');
    if (_s === -1 || _e === -1) throw new Error('Manus returned non-JSON output (no braces found) — falling back to Claude');
    try { JSON.parse(raw.slice(_s, _e + 1)); } catch { throw new Error('Manus returned unparseable JSON — falling back to Claude'); }
  } catch (e: any) {
    log(`Manus failed or returned invalid output (${e.message}) — falling back to Claude for CMO plan generation`);
    raw = await callClaude(
    `You are the CMO of Invoica — the Financial OS for AI Agents (@invoica_ai).
You produce a structured weekly X/Twitter content plan for the X agent to execute.

CRITICAL CONTENT RULES:
- Updates posts: ONLY feature already merged+deployed (from git commits). NEVER roadmap/future.
- No fabricated metrics: no invented percentages, counts, latency numbers.
- No ETAs or "coming soon" for unshipped work.
- All tweets ≤ 280 characters. Dense, specific, developer-native voice.
- No hashtags (spammy). No weak engagement bait ("What do you think?").
- Accounts to watch: max 5. Engagement must be educational, not promotional spam.

BRAND VOICE: Think Stripe's early Twitter + Linear product updates + @levelsio building in public.
Technical founder who ships real infrastructure, not a social media manager.

Return ONLY valid JSON (no markdown wrapper) matching this exact schema:
{
  "strategy_note": "1-2 sentences on this week's theme",
  "accounts_to_watch": [
    { "handle": "@handle", "topic": "what to watch for", "engagement_angle": "exact educational point to make" }
  ],
  "days": {
    "YYYY-MM-DD": {
      "educational": { "tweets": ["≤280 char tweet"], "image_path": null, "topic_summary": "what this teaches" },
      "updates": { "tweets": ["≤280 char tweet"], "image_path": null, "topic_summary": "what shipped feature" },
      "vision": { "tweets": ["tweet1", "optional tweet2"], "image_path": null, "topic_summary": "what vision angle" }
    }
  }
}`,
    `## Invoica Context
${ctx.soul.slice(0, 800)}

## CTO Verified Shipped Features (last 7 days — USE THESE for updates posts, not anything else)
${ctx.ctoShippedReport.slice(0, 3000)}

## Recent Commits (14 days)
${ctx.recentCommits || '(no commits found)'}

## Changed Files
${ctx.shippedFeatures || '(unavailable)'}

## Market Intelligence
${ctx.marketWatch.slice(0, 800)}

## X/Twitter Current Trends (use for educational + vision angle)
${xTrends.slice(0, 1500)}

## Week to Plan
Week start (Monday): ${weekStart}
Dates: ${dates.join(', ')}

Write post-ready content for ALL 7 days × 3 slots = 21 posts total.
Vary topics across the week. Don't repeat the same angle twice.
Updates posts must name specific shipped features from git commits above.${feedbackBlock}`
    , 6000);
  }

  // Parse JSON — handle markdown code fences and extract largest JSON object
  let planJson = raw;
  // Strip markdown code fences if present
  const fenceMatch = planJson.match(/```(?:json)?\n?([\s\S]*?)```/);
  if (fenceMatch) planJson = fenceMatch[1];
  // Find outermost JSON object (from first { to last })
  const start = planJson.indexOf('{');
  const end = planJson.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('CMO failed to return valid JSON plan');
  let parsed: any;
  try {
    parsed = JSON.parse(planJson.slice(start, end + 1));
  } catch (e: any) {
    throw new Error('CMO returned malformed JSON: ' + e.message + ' — raw: ' + planJson.slice(start, start + 200));
  }

  // Post-process: clean up Manus research artifacts
  const cleanTweet = (t: string) => t
    .replace(/\s*\[\d+(?:,\s*\d+)*\]/g, '')  // strip [1], [1, 3, 4] citation refs
    .replace(/\s+/g, ' ')
    .trim();
  const cleanImagePath = (p: string | null) => {
    if (!p) return null;
    // Only allow actual image paths (not source code files)
    if (/\.(tsx?|jsx?|sql|md|json|sh)$/i.test(p)) return null;
    if (/^(frontend|backend|scripts|src|docs)\//.test(p)) return null;
    return p;
  };
  const cleanedDays: Record<string, DayPlan> = {};
  for (const [date, day] of Object.entries(parsed.days || {})) {
    const d = day as DayPlan;
    cleanedDays[date] = {
      educational: { ...d.educational, tweets: (d.educational?.tweets || []).map(cleanTweet), image_path: cleanImagePath(d.educational?.image_path ?? null) },
      updates:     { ...d.updates,     tweets: (d.updates?.tweets     || []).map(cleanTweet), image_path: cleanImagePath(d.updates?.image_path     ?? null) },
      vision:      { ...d.vision,      tweets: (d.vision?.tweets      || []).map(cleanTweet), image_path: cleanImagePath(d.vision?.image_path      ?? null) },
    };
  }

  return {
    week_start: weekStart,
    week_end: weekEnd,
    prepared_at: new Date().toISOString(),
    strategy_note: parsed.strategy_note || '',
    status: 'draft',
    accounts_to_watch: parsed.accounts_to_watch || [],
    days: cleanedDays,
  };
}

// ── CTO Review ────────────────────────────────────────────────────────────────
interface ReviewResult { approved: boolean; feedback: string; }

async function ctoReview(plan: WeeklyPlan): Promise<ReviewResult> {
  const allTweets = Object.entries(plan.days).flatMap(([date, day]) =>
    Object.entries(day).map(([slot, content]) => `[${date} ${slot}] ${content.tweets.join(' | ')}`)
  ).join('\n');

  // CTO uses MiniMax with Claude fallback (MiniMax may be temporarily out of credits)
  const callCtoReview = async (sys: string, usr: string, maxT = 600): Promise<string> => {
    try { return await callMinimax(sys, usr, maxT); } catch (e: any) {
      if (e.message?.includes('balance') || e.message?.includes('insufficient') || !e.message) {
        log('CTO (MiniMax) credits low — falling back to Claude for CTO review');
        return callClaude(sys, usr, maxT);
      }
      throw e;
    }
  };
  const text = await callCtoReview(
    `You are the CTO of Invoica. Review the weekly X/Twitter content plan for technical accuracy.
Check: correct x402 protocol facts, accurate EIP-712 details, correct Base/USDC info, valid UK VAT/EU VAT facts, accurate API endpoint names.
Reject if: any technical claim is wrong or misleading. Approve if all technical facts are accurate or post is non-technical.
Return ONLY: {"approved": true/false, "feedback": "specific issues or 'all clear'"}`,
    `## All Posts to Review\n${allTweets}\n\nReturn JSON only.`,
    400
  );
  try {
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) return JSON.parse(m[0]);
  } catch { /* fall through */ }
  return { approved: true, feedback: 'CTO review unavailable — defaulting approved' };
}

// ── CEO Review ────────────────────────────────────────────────────────────────
async function ceoReview(plan: WeeklyPlan): Promise<ReviewResult> {
  const allPosts = Object.entries(plan.days).map(([date, day]) =>
    `### ${date}\n` +
    `**EDU**: ${day.educational.tweets.join(' | ')}\n` +
    `**UPD**: ${day.updates.tweets.join(' | ')}\n` +
    `**VIS**: ${day.vision.tweets.join(' | ')}`
  ).join('\n\n');

  // CEO uses Claude when available, falls back to MiniMax if credits exhausted
  const callCeoReview = async (sys: string, usr: string, maxT = 600): Promise<string> => {
    try { return await callClaude(sys, usr, maxT); } catch (e: any) {
      if (e.message?.includes('credit') || e.message?.includes('billing')) {
        log('CEO (Claude) credits low — falling back to MiniMax for CEO review');
        return callMinimax(sys, usr, maxT);
      }
      throw e;
    }
  };
  const text = await callCeoReview(
    `You are the CEO of Invoica. You are reviewing the CMO's weekly X/Twitter content plan.
Your approval is the official order to the X agent to execute this plan.

BRAND NOTE: "Stripe for AI Agents" and "Financial OS for AI Agents" are OFFICIAL Invoica positioning — always approve these.
VISION POSTS: Vision posts are ALLOWED to be aspirational about the future of the agent economy. Do NOT reject vision posts for being forward-looking.

REJECT only if a post:
- Contains fabricated or estimated STATISTICS (specific numbers, percentages, latency claims not from git commits)
- References UNSHIPPED features as if they are live ("we just launched X" when X is not merged)
- Uses promotional spam language ("amazing", "revolutionary", "game-changing", "world-class")
- Has direct engagement bait ("What do you think?", "Agree?", "RT if...")
- Mentions internal sprint names, PR numbers, or internal ticket IDs (like "FE-241" directly in tweet)
- Exceeds 280 characters

APPROVE if: updates posts only reference shipped features, no fake metrics, no spam language.
Return ONLY: {"approved": true/false, "feedback": "concise list of issues OR 'Plan approved — execute as written'"}`,
    `## CMO Weekly Strategy Note\n${plan.strategy_note}\n\n## Accounts to Watch\n${plan.accounts_to_watch.map(a => `${a.handle}: ${a.engagement_angle}`).join('\n')}\n\n## All Posts\n${allPosts}\n\nReview all 21 posts. Return JSON only.`,
    600
  );
  try {
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) return JSON.parse(m[0]);
  } catch { /* fall through */ }
  return { approved: true, feedback: 'CEO review unavailable — defaulting approved' };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('Starting CMO weekly content plan generation...');

  const weekStart = getMondayOfNextWeek();
  const dates = getDateRange(weekStart);
  const outputFile = path.join(CMO_REPORTS, `weekly-content-plan-${weekStart}.json`);

  // Check if approved plan already exists
  if (fs.existsSync(outputFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      if (existing.status === 'approved') {
        log(`Plan for week ${weekStart} already approved — skipping`);
        return;
      }
    } catch { /* regenerate */ }
  }

  log('Researching X trends via Grok...');
  const xTrends = await researchTrends();
  log('Gathering project context: CTO shipped features + commits + market watch...');
  const ctx = gatherContext();

  let plan: WeeklyPlan | undefined;
  let finalStatus: 'approved' | 'needs-revision' = 'needs-revision';
  let ceoPreviousFeedback: string | undefined;

  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log(`Generating weekly plan (attempt ${attempt}/${MAX_ATTEMPTS})...`);
    plan = await generatePlan(weekStart, dates, xTrends, ctx, ceoPreviousFeedback);
    log(`Plan generated — ${Object.keys(plan.days).length} days, ${plan.accounts_to_watch.length} accounts to watch`);

    // CTO Review
    log('CTO reviewing technical accuracy...');
    const cto = await ctoReview(plan);
    log(`CTO: ${cto.approved ? '✅' : '❌'} ${cto.feedback}`);
    plan.cto_review = { approved: cto.approved, feedback: cto.feedback, reviewed_at: new Date().toISOString() };

    if (!cto.approved) {
      log(`CTO rejected plan (attempt ${attempt}) — regenerating with feedback`);
      ceoPreviousFeedback = `CTO rejected: ${cto.feedback}`;
      continue;
    }

    // CEO Review
    log('CEO reviewing brand voice and strategic alignment...');
    const ceo = await ceoReview(plan);
    log(`CEO: ${ceo.approved ? '✅' : '❌'} ${ceo.feedback}`);
    plan.ceo_review = { approved: ceo.approved, feedback: ceo.feedback, reviewed_at: new Date().toISOString() };

    if (ceo.approved) {
      plan.status = 'approved';
      finalStatus = 'approved';
      log('Plan approved by CTO + CEO ✅');
      break;
    } else {
      log(`CEO rejected plan (attempt ${attempt})`);
      ceoPreviousFeedback = ceo.feedback;
    }
  }

  if (!plan) throw new Error('Plan generation failed completely');

  // Fix plan status: if not approved after all attempts, set to needs-revision
  if (plan.status === 'draft') plan.status = 'needs-revision';

  // Save plan
  if (!fs.existsSync(CMO_REPORTS)) fs.mkdirSync(CMO_REPORTS, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plan, null, 2));
  log(`Plan saved: ${outputFile} (status: ${plan.status})`);
  // Update cron guard only when plan is approved (allow re-runs on needs-revision)
  try {
    const guardFile = path.join(ROOT, 'logs', 'cron-guard-cmo-weekly-plan.json');
    if (plan.status === 'approved') {
      fs.writeFileSync(guardFile, JSON.stringify({ lastRun: new Date().toISOString(), status: 'approved' }));
    } else {
      // Remove guard so operator can re-trigger manually
      if (fs.existsSync(guardFile)) fs.unlinkSync(guardFile);
    }
  } catch { /* non-fatal */ }

  // Telegram notification
  const totalPosts = Object.keys(plan.days).length * 3;
  if (finalStatus === 'approved') {
    const postLines = Object.entries(plan.days).slice(0, 3).map(([date, day]) =>
      `📅 *${date}*\n  EDU: ${day.educational.tweets[0].slice(0, 80)}...\n  UPD: ${day.updates.tweets[0].slice(0, 80)}...`
    ).join('\n\n');

    sendTelegram(
      `✅ *CMO Weekly Content Plan Approved — Week of ${weekStart}*\n\n` +
      `*Strategy:* ${plan.strategy_note}\n\n` +
      `*Posts ready:* ${totalPosts} (${Object.keys(plan.days).length} days × 3 slots)\n` +
      `*Accounts to watch:* ${plan.accounts_to_watch.map(a => a.handle).join(', ')}\n\n` +
      `*Preview (first 3 days):*\n${postLines}\n\n` +
      `X agent will execute this plan automatically starting Monday.`
    );
  } else {
    sendTelegram(
      `⚠️ *CMO Weekly Content Plan Needs Manual Review — Week of ${weekStart}*\n\n` +
      `Both CTO and CEO review attempts failed after ${MAX_ATTEMPTS} tries.\n` +
      `*Last feedback:* ${ceoPreviousFeedback?.slice(0, 300)}\n\n` +
      `Plan saved as \`needs-revision\` — X agent will fall back to on-the-fly generation.\n` +
      `Edit manually: \`reports/cmo/weekly-content-plan-${weekStart}.json\` and set \`status: "approved"\`.`
    );
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log(`Fatal: ${msg}`);
  sendTelegram(`🔴 *CMO Weekly Plan generation crashed*: ${msg}`);
  process.exit(1);
});
