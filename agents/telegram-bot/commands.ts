// Command handlers — Phase 1 TikTok Content Agent Telegram Bot
// Each handler receives chatId + message text, sends response(s) via sendMessage/sendPhoto.

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { sendMessage, sendPhoto } from './bot';
import { TelegramDB } from './db';
import { createCheckoutSession, isConfigured as stripeConfigured } from '../stripe/client';
import { AchiriConversationHandler } from '../achiri/index';

const REPORTS_DIR = join(process.cwd(), 'reports');

// ── Types matching pipeline output ────────────────────────────────────────────

interface PipelineResult {
  id:       string;
  url:      string;
  score:    number;
  status:   'success' | 'error';
  caption?: string;
  hashtags?: string[];
}

interface PipelineReport {
  query:   string;
  runAt:   string;
  dryRun:  boolean;
  results: PipelineResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadLatestReport(): PipelineReport | null {
  if (!existsSync(REPORTS_DIR)) return null;

  const files = readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('tiktok-pipeline-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  try {
    return JSON.parse(readFileSync(join(REPORTS_DIR, files[0]), 'utf-8')) as PipelineReport;
  } catch {
    return null;
  }
}

function loadAllReports(): PipelineReport[] {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('tiktok-pipeline-') && f.endsWith('.json'))
    .sort()
    .map(f => {
      try { return JSON.parse(readFileSync(join(REPORTS_DIR, f), 'utf-8')) as PipelineReport; }
      catch { return null; }
    })
    .filter(Boolean) as PipelineReport[];
}

function tierBadge(tier: string): string {
  return tier === 'premium' ? '⭐ Premium' : tier === 'growth' ? '🚀 Growth' : '🆓 Free';
}

// ── Command handlers ──────────────────────────────────────────────────────────

export async function handleStart(chatId: number, firstName: string, username?: string): Promise<void> {
  const record = TelegramDB.upsert(chatId, { firstName, username });
  await sendMessage(chatId, [
    `👋 Welcome to the *Kognai TikTok Content Agent*, ${record.firstName}!`,
    '',
    'I find the best public-domain archive footage, generate viral TikTok captions, and post for you — autonomously.',
    '',
    `📋 *Your account*`,
    `• Tier: ${tierBadge(record.tier)}`,
    `• Daily posts: ${record.postsPerDay}`,
    '',
    'Type /help to see what I can do.',
  ].join('\n'));
}

export async function handleHelp(chatId: number): Promise<void> {
  await sendMessage(chatId, [
    '📖 *Available Commands*',
    '',
    '/start — Register & see your account',
    '/preview — Show the next post candidate',
    '/schedule — Configure daily posting frequency',
    '/status — Latest SCS-001 pipeline run',
    '/stats — Pipeline statistics',
    '/subscribe — Upgrade your plan (coming soon)',
    '/help — This message',
  ].join('\n'));
}

export async function handlePreview(chatId: number): Promise<void> {
  const report = loadLatestReport();
  if (!report) {
    await sendMessage(chatId, '⚠️ No pipeline runs found yet. The agent hasn\'t run yet.');
    return;
  }

  const best = report.results
    .filter(r => r.status === 'success')
    .sort((a, b) => b.score - a.score)[0];

  if (!best) {
    await sendMessage(chatId, '⚠️ Latest pipeline run had no successful results.');
    return;
  }

  const hashtags = best.hashtags?.map(t => `#${t}`).join(' ') ?? '';
  const caption  = [
    `🎬 *Score: ${best.score}/100*`,
    '',
    best.caption ?? '(no caption)',
    '',
    hashtags,
    '',
    `🔍 Query: _${report.query}_`,
    `⏱ Run: ${new Date(report.runAt).toLocaleString()}${report.dryRun ? ' (dry run)' : ''}`,
  ].join('\n');

  try {
    await sendPhoto(chatId, best.url, caption);
  } catch {
    // Fallback: send as text if photo fails (e.g., dead URL)
    await sendMessage(chatId, caption + `\n\n🔗 ${best.url}`);
  }
}

export async function handleSchedule(chatId: number, text: string): Promise<void> {
  // Parse optional frequency argument: /schedule 5
  const parts = text.trim().split(/\s+/);
  const arg   = parts[1];

  if (arg) {
    const n = parseInt(arg, 10);
    if (isNaN(n) || n < 1 || n > 10) {
      await sendMessage(chatId, '⚠️ Please provide a number between 1 and 10.\nExample: `/schedule 3`');
      return;
    }
    TelegramDB.setPostsPerDay(chatId, n);
    await sendMessage(chatId, `✅ Posting frequency set to *${n} posts/day*.\n\n⏳ Live posting activates once TikTok App Review is approved (submitted 2026-03-15).`);
  } else {
    const record = TelegramDB.get(chatId);
    const current = record?.postsPerDay ?? 3;
    await sendMessage(chatId, [
      `📅 *Posting Schedule*`,
      `• Current: ${current} posts/day`,
      '',
      'To change: `/schedule <number>` (1–10)',
      '',
      '⏳ Live posting activates once TikTok App Review is approved.',
    ].join('\n'));
  }
}

export async function handleStats(chatId: number): Promise<void> {
  const reports = loadAllReports();

  if (reports.length === 0) {
    await sendMessage(chatId, '⚠️ No pipeline runs found yet.');
    return;
  }

  const allResults = reports.flatMap(r => r.results.filter(x => x.status === 'success'));
  const totalScored = allResults.length;
  const avgScore    = totalScored > 0
    ? Math.round(allResults.reduce((s, r) => s + r.score, 0) / totalScored)
    : 0;
  const topScore    = totalScored > 0 ? Math.max(...allResults.map(r => r.score)) : 0;
  const lastRun     = reports[0] ? new Date(reports[0].runAt).toLocaleString() : 'never';
  const subscribers = TelegramDB.activeCount();

  await sendMessage(chatId, [
    '📊 *Pipeline Statistics*',
    '',
    `• Total pipeline runs: ${reports.length}`,
    `• Total items scored: ${totalScored}`,
    `• Average score: ${avgScore}/100`,
    `• Top score: ${topScore}/100`,
    `• Last run: ${lastRun}`,
    `• Active subscribers: ${subscribers}`,
  ].join('\n'));
}

export async function handleSubscribe(chatId: number, planArg?: string): Promise<void> {
  const plan = planArg === 'premium' ? 'premium' : 'growth';

  if (!stripeConfigured()) {
    // Stripe not yet configured — show plan info + coming soon
    await sendMessage(chatId, [
      '💳 *Subscription Plans*',
      '',
      '🆓 *Free* — 3 posts/day, standard queue',
      '🚀 *Growth* — 10 posts/day, priority queue — $19/mo  → `/subscribe growth`',
      '⭐ *Premium* — Unlimited posts, custom queries — $49/mo  → `/subscribe premium`',
      '',
      '⏳ Payments launching soon. You\'ll be notified here when live.',
    ].join('\n'));
    return;
  }

  try {
    await sendMessage(chatId, '⏳ Creating checkout session...');
    const session = await createCheckoutSession(plan, chatId);
    const badge   = plan === 'premium' ? '⭐ Premium ($49/mo)' : '🚀 Growth ($19/mo)';
    await sendMessage(chatId, [
      `💳 *${badge}*`,
      '',
      `[Complete payment →](${session.url})`,
      '',
      'You\'ll receive a confirmation here once payment is processed.',
    ].join('\n'), { disable_web_page_preview: true });
  } catch (err) {
    process.stderr.write(`[subscribe] Stripe error: ${(err as Error).message}\n`);
    await sendMessage(chatId, '⚠️ Could not create checkout session. Please try again later.');
  }
}

function loadPublishLedger(): { total: number; today: number; latestAt: string | null } {
  const ledgerPath = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
  if (!existsSync(ledgerPath)) return { total: 0, today: 0, latestAt: null };
  try {
    const lines = readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const today = entries.filter((e: any) => (e.published_at ?? '').startsWith(todayPrefix)).length;
    const latest = entries.map((e: any) => e.published_at ?? '').sort().reverse()[0] ?? null;
    return { total: entries.length, today, latestAt: latest };
  } catch { return { total: 0, today: 0, latestAt: null }; }
}

function loadTopFormula(): string {
  const expPath = join(process.cwd(), 'workspace', 'scs001', 'experiments.jsonl');
  if (!existsSync(expPath)) return 'no data yet';
  try {
    const lines = readFileSync(expPath, 'utf-8').split('\n').filter(l => l.trim());
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const map: Record<string, { count: number; passed: number }> = {};
    for (const e of entries as any[]) {
      const f = e.hook_formula ?? 'unknown';
      if (!map[f]) map[f] = { count: 0, passed: 0 };
      map[f].count++;
      if (e.qc_passed) map[f].passed++;
    }
    const best = Object.entries(map).sort((a, b) => (b[1].passed / b[1].count) - (a[1].passed / a[1].count))[0];
    if (!best) return 'no data yet';
    const pct = Math.round(best[1].passed / best[1].count * 100);
    return `${best[0]} (${pct}%)`;
  } catch { return 'error'; }
}

function computeReadinessPct(): number {
  const required = ['TIKTOK_ACCESS_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'YOUTUBE_API_KEY', 'SCS_EDITING_MODE'];
  const ready = required.filter(v => !!process.env[v]).length;
  return Math.round(ready / required.length * 100);
}

export async function handleStatus(chatId: number): Promise<void> {
  const ledger = loadPublishLedger();
  const topFormula = loadTopFormula();
  const readinessPct = computeReadinessPct();

  // Also try latest SCS-001 pipeline run report (secondary)
  const latestPath = join(process.cwd(), 'reports', 'pipeline-runs', 'latest.json');
  let pipelineInfo = '';
  if (existsSync(latestPath)) {
    try {
      const report = JSON.parse(readFileSync(latestPath, 'utf-8'));
      const s = report.summary || {};
      const elapsed = ((report.total_elapsed_ms || 0) / 1000).toFixed(1);
      const mode = report.mode === 'live' ? '🟢 LIVE' : '🔵 MOCK';
      const errors = (report.stages || []).filter((st: any) => st.status === 'error').length;
      const started = report.started_at ? new Date(report.started_at).toLocaleString() : 'unknown';
      pipelineInfo = [
        '',
        `📡 *Last Run:* ${mode} | ${elapsed}s${errors > 0 ? ` | ⚠️ ${errors} errors` : ''}`,
        `📊 ${s.topics_found || 0} topics → ${s.published || 0} published${s.viral > 0 ? ` | 🔥 ${s.viral} viral` : ''}`,
        `⏱ _${started}_`,
      ].join('\n');
    } catch { /* ignore */ }
  }

  const readinessIcon = readinessPct >= 80 ? '🟢' : readinessPct >= 40 ? '🟡' : '🔴';
  const latestAt = ledger.latestAt ? new Date(ledger.latestAt).toLocaleString() : 'never';

  await sendMessage(chatId, [
    '📡 *Kognai Pipeline Status*',
    '',
    `📬 Published today: *${ledger.today}* | Total: *${ledger.total}*`,
    `🏆 Top formula: *${topFormula}*`,
    `${readinessIcon} Readiness: *${readinessPct}%* (${readinessPct < 100 ? 'env vars missing' : 'ready'})`,
    `🕐 Last post: _${latestAt}_`,
    pipelineInfo,
  ].filter(l => l !== undefined).join('\n'));
}

export async function handleUnknown(chatId: number, text: string): Promise<void> {
  await sendMessage(chatId, `❓ Unknown command: \`${text}\`\n\nUse /help for available commands.`);
}

// ── Achiri AI companion bridge (Sprint 116) ───────────────────────────────────

// One handler per chatId — persists memory across messages in the same process session
const achiriHandlers = new Map<number, AchiriConversationHandler>();

function getAchiriHandler(chatId: number): AchiriConversationHandler {
  if (!achiriHandlers.has(chatId)) {
    achiriHandlers.set(chatId, new AchiriConversationHandler('free', String(chatId)));
  }
  return achiriHandlers.get(chatId)!;
}

export async function handleAchiri(chatId: number, message: string): Promise<void> {
  if (!message || !message.trim()) {
    await sendMessage(chatId, 'Qouli chay 😊  /achiri <your message>');
    return;
  }
  try {
    const handler = getAchiriHandler(chatId);
    const reply = await handler.chat(message.trim());
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error('[telegram-bot] Achiri error:', err);
    await sendMessage(chatId, 'Mrigoul, ma njemtch nchouf — 3awedha marra oukhra 🙏');
  }
}
