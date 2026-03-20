// Command handlers — Phase 1 TikTok Content Agent Telegram Bot
// Each handler receives chatId + message text, sends response(s) via sendMessage/sendPhoto.

import { readdirSync, readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { sendMessage, sendPhoto, sendVideo } from './bot';
import { TelegramDB } from './db';
import { createCheckoutSession, isConfigured as stripeConfigured } from '../stripe/client';
// Achiri HTTP bridge (Sprint 130) — routes to ACHIRI_BASE_URL instead of in-process import
const ACHIRI_BASE_URL = (process.env.ACHIRI_BASE_URL ?? 'http://localhost:3420').replace(/\/$/, '');

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
    `👋 Welcome to *Kognai*, ${record.firstName}!`,
    '',
    '🎬 *TikTok Content Agent*',
    'I find public-domain archive footage, generate viral captions, and post for you — autonomously.',
    `• Tier: ${tierBadge(record.tier)}`,
    `• Daily posts: ${record.postsPerDay}`,
    '',
    '🤖 *Achiri — AI Companion* _(Alpha Apr 25)_',
    'Culturally adaptive AI that speaks Darija, Arabic & French.',
    'Free tier: 50 messages/day. Try it now:',
    '→ `/achiri مرحبا، كيفاش تنجم تعاوني؟`',
    '',
    'Type /help for all commands.',
  ].join('\n'));
}

export async function handleHelp(chatId: number, ownerChatId?: string): Promise<void> {
  const isOwner = ownerChatId && String(chatId) === String(ownerChatId);

  if (!isOwner) {
    // Sprint 320: User-friendly help for alpha users
    await sendMessage(chatId, [
      '🤖 *Achiri — Your Tunisian AI Companion*',
      '',
      '💬 *Chat with me:*',
      '/achiri <message> — Talk to me in Darija, French, or English',
      '',
      '📋 *Your tools:*',
      '/achiriprofile — See your profile (language, interests)',
      '/waitlist — Join the alpha if you\'re not in yet',
      '/start — Set up your account',
      '/subscribe — Upgrade for more features',
      '/help — This message',
      '',
      '💡 In group chats, just @mention me!',
      '',
      '_Achiri Alpha — launching Apr 25 🇹🇳_',
    ].join('\n'));
    return;
  }

  // Full operator help
  await sendMessage(chatId, [
    '📖 *Operator Commands*',
    '',
    '🎬 *TikTok Pipeline*',
    '/start /preview /schedule /status /stats /subscribe',
    '/gate /postreminder /review /queue /pace /today',
    '/record <id> <views> /updateviews <id> <views>',
    '/postnow /postbatch [N] /caption [id] /sendvideo <id>',
    '/calendar /viral /viralstats',
    '/autopost /verifyposts /activate',
    '/stripestatus /tiktokstatus /tiktokauth',
    '/pipeline /runpipeline /lastrun /metrics /revenue',
    '',
    '🤖 *Achiri*',
    '/achiri <msg> /achiriprofile /achirihealth',
    '/achiristats /achirifeedback /achiriexport [id]',
    '/achirierrors /achiriready /achiriretention /achiriquality',
    '/achirianalytics /achiritopics',
    '/waitlist /inviteachiri <id> /deploystatus',
    '',
    '⚙️ *System*',
    '/pm2status /health /preflight /dedup',
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

// ── Sprint 120: Manual post tracker reader ────────────────────────────────────
function loadManualPosts(): { count: number; totalViews: number } {
  const p = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');
  if (!existsSync(p)) return { count: 0, totalViews: 0 };
  try {
    const lines = readFileSync(p, 'utf-8').split('\n').filter(l => l.trim());
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
    const totalViews = entries.reduce((s: number, e: any) => s + (e.views ?? 0), 0);
    return { count: entries.length, totalViews };
  } catch { return { count: 0, totalViews: 0 }; }
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
  const manual = loadManualPosts();

  // Gate progress (Apr 7 Phase 1.5 kill switch)
  const postsOk  = manual.count >= 30;
  const viewsOk  = manual.totalViews >= 500;
  const gateIcon = (postsOk && viewsOk) ? '✅' : (postsOk || viewsOk) ? '⚠️' : '❌';
  const gateLine = `${gateIcon} Real posts: *${manual.count}/30* | Views: *${manual.totalViews}/500* | Gate: Apr 7`;

  // Latest smoke test (reports/smoke-test-latest.json)
  const smokePath = join(process.cwd(), 'reports', 'smoke-test-latest.json');
  let pipelineInfo = '';
  if (existsSync(smokePath)) {
    try {
      const report = JSON.parse(readFileSync(smokePath, 'utf-8'));
      const ok = report.passed ? '✅' : '❌';
      const stages = report.stage_count ?? 0;
      const errors = report.error_count ?? 0;
      const ts = report.timestamp ? new Date(report.timestamp).toLocaleString() : 'unknown';
      const s = report.summary || {};
      pipelineInfo = [
        '',
        `🔬 *Smoke Test:* ${ok} ${stages} stages${errors > 0 ? ` | ⚠️ ${errors} errors` : ''}`,
        `📊 ${s.topics_found || 0} topics → ${s.clips_qualified || 0} clips → ${s.videos_published || 0} published`,
        `⏱ _${ts}_`,
      ].join('\n');
    } catch { /* ignore */ }
  }

  const readinessIcon = readinessPct >= 80 ? '🟢' : readinessPct >= 40 ? '🟡' : '🔴';
  const latestAt = ledger.latestAt ? new Date(ledger.latestAt).toLocaleString() : 'never';

  await sendMessage(chatId, [
    '📡 *Kognai Pipeline Status*',
    '',
    `📬 Pipeline today: *${ledger.today}* | Total: *${ledger.total}* (dry-run)`,
    gateLine,
    `🏆 Top formula: *${topFormula}*`,
    `${readinessIcon} Readiness: *${readinessPct}%* (${readinessPct < 100 ? 'env vars missing' : 'ready'})`,
    `🕐 Last pipeline post: _${latestAt}_`,
    pipelineInfo,
  ].filter(l => l !== undefined).join('\n'));
}

export async function handleUnknown(chatId: number, text: string): Promise<void> {
  await sendMessage(chatId, `❓ Unknown command: \`${text}\`\n\nUse /help for available commands.`);
}

// ── Phase 1.5 gate review (Sprint 132) ────────────────────────────────────────
export async function handleGate(chatId: number): Promise<void> {
  const manual = loadManualPosts();
  const postsCount  = manual.count;
  const totalViews  = manual.totalViews;
  const avgViews    = postsCount > 0 ? Math.round(totalViews / postsCount) : 0;
  const passesPostCount = postsCount >= 30;
  const passesViews     = totalViews >= 500;
  const overallPass     = passesPostCount && passesViews;

  const gateDate  = new Date('2026-04-07T00:00:00Z');
  const now       = new Date();
  const daysLeft  = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / 86400000));
  const daysLabel = daysLeft === 0 ? 'TODAY' : `${daysLeft} days`;

  // Pace calculation
  const postsNeeded = Math.max(0, 30 - postsCount);
  const pacePerDay  = daysLeft > 0 ? (postsNeeded / daysLeft).toFixed(1) : '∞';

  // Urgency level
  const urgency = daysLeft <= 7
    ? '🔴 URGENT' : daysLeft <= 14
    ? '🟡 WARNING' : '🟢 ON TRACK';

  // Queue count — how many videos available to post
  const ledgerPath = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
  let queueCount = 0;
  if (existsSync(ledgerPath)) {
    try {
      const recordedIds = new Set<string>();
      if (manual.count > 0) {
        const manualPath = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');
        readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim())
          .forEach(l => { try { recordedIds.add(JSON.parse(l).video_id); } catch {} });
      }
      queueCount = readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim())
        .filter(l => { try { return !recordedIds.has(JSON.parse(l).video_id); } catch { return false; } }).length;
    } catch {}
  }

  const icon       = overallPass ? '✅' : '❌';
  const verdict    = overallPass ? 'PROCEED → Phase 2A' : 'KILL SWITCH TRIGGERED';
  const postIcon   = passesPostCount ? '✅' : '❌';
  const viewsIcon  = passesViews ? '✅' : '❌';

  const lines = [
    `📊 *Phase 1.5 Gate Review* — Apr 7 (${daysLabel}) ${urgency}`,
    '',
    `${postIcon} Posts:  *${postsCount}/30*`,
    `${viewsIcon} Views:  *${totalViews}/500* (avg ${avgViews}/post)`,
    `📊 Pace:  *${pacePerDay} posts/day* needed`,
    `📼 Queue: *${queueCount}* videos ready to post`,
    '',
    `${icon} *${verdict}*`,
  ];

  if (!overallPass) {
    const needed = [];
    if (!passesPostCount) needed.push(`${postsNeeded} more posts`);
    if (!passesViews) needed.push(`${500 - totalViews} more views`);
    lines.push('', `Need: ${needed.join(' + ')}`);
    if (queueCount > 0) {
      lines.push('Use /postbatch to see videos ready to post');
    }
    lines.push('Use /record <id> <views> to log a posted video');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── Achiri AI companion bridge (Sprint 130/131) ───────────────────────────────
// Routes to ACHIRI_BASE_URL/chat via HTTP POST.
// Sprint 131: tier wired from TelegramDB + ACHIRI_ALPHA_WHITELIST access gate.
// Set ACHIRI_BASE_URL=http://65.108.90.178/achiri for Hetzner production.

// TelegramDB tier → Achiri tier mapping
const ACHIRI_TIER_MAP: Record<string, string> = {
  free:    'free',
  growth:  'tnd_basic',
  premium: 'tnd_premium',
};

// Alpha access: ACHIRI_ALPHA_ONLY=true enforces whitelist. Default=false (open).
const ACHIRI_ALPHA_ONLY      = process.env.ACHIRI_ALPHA_ONLY === 'true';
// Env-var whitelist (static, read at startup)
const ACHIRI_ALPHA_WHITELIST_ENV = new Set(
  (process.env.ACHIRI_ALPHA_WHITELIST ?? '').split(',').map(s => s.trim()).filter(Boolean)
);
const ACHIRI_OWNER_ID = process.env.OWNER_TELEGRAM_CHAT_ID ?? '';

// File-based whitelist — checked at runtime so bot restart not required when inviting
const ALPHA_WHITELIST_PATH = join(process.cwd(), 'workspace', 'achiri', 'alpha-whitelist.jsonl');

function checkAlphaAccess(chatId: number): boolean {
  // Env-var whitelist (loaded at startup)
  if (ACHIRI_ALPHA_WHITELIST_ENV.has(String(chatId))) return true;
  // File-based whitelist (read at runtime — survives bot restart)
  if (!existsSync(ALPHA_WHITELIST_PATH)) return false;
  try {
    const lines = readFileSync(ALPHA_WHITELIST_PATH, 'utf-8').split('\n').filter(l => l.trim());
    return lines.some(line => {
      try { return JSON.parse(line).chatId === String(chatId); } catch { return false; }
    });
  } catch { return false; }
}

export async function handleAchiri(chatId: number, message: string, userId?: number): Promise<void> {
  // Sprint 319: userId param for group chats — sender's ID distinct from group chatId
  const effectiveUserId = userId ?? chatId;

  // Alpha gate — owner always allowed; whitelist gates non-owners when ACHIRI_ALPHA_ONLY=true
  if (ACHIRI_ALPHA_ONLY && String(effectiveUserId) !== ACHIRI_OWNER_ID && !checkAlphaAccess(effectiveUserId)) {
    await sendMessage(chatId, 'Achiri Lite Alpha — invitation only. DM @kognai_bot to join the waitlist! 🙏');
    return;
  }

  if (!message || !message.trim()) {
    await sendMessage(chatId, 'Qouli chay 😊  /achiri <your message>');
    return;
  }

  // Resolve Achiri tier from TelegramDB subscription tier
  const record = TelegramDB.get(effectiveUserId);
  const achiriTier = ACHIRI_TIER_MAP[record?.tier ?? 'free'] ?? 'free';

  try {
    const res = await fetch(ACHIRI_BASE_URL + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: String(effectiveUserId), tier: achiriTier, message: message.trim() }),
    });
    const data = await res.json() as {
      reply?: string;
      error?: string;
      upgrade_url?: string;
      reset_at?: string;
    };

    if (data.error === 'limit_exceeded') {
      const parts = [data.reply ?? 'Wselti l7edd el-yawmi.'];
      if (data.upgrade_url) {
        parts.push('\n🔗 Upgrade: ' + data.upgrade_url);
      } else if (data.reset_at) {
        const reset = new Date(data.reset_at).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' });
        parts.push('\n⏰ Tarja3 men ba3d ' + reset + ' (UTC).');
      }
      await sendMessage(chatId, parts.join(''));
      return;
    }

    await sendMessage(chatId, data.reply ?? 'Ma fjemt — 3awedha marra oukhra 🙏');
  } catch (err) {
    console.error('[telegram-bot] Achiri HTTP error:', err);
    await sendMessage(chatId, 'Mrigoul, ma njemtch nchouf — 3awedha marra oukhra 🙏');
  }
}

// ── Achiri alpha waitlist (Sprint 136) ────────────────────────────────────────
// /waitlist           — any user joins the waitlist
// /waitlist list      — owner-only: show all entries + count

const WAITLIST_PATH = join(process.cwd(), 'workspace', 'achiri', 'waitlist.jsonl');

interface WaitlistEntry {
  chatId:    string;
  firstName: string;
  username?: string;
  joinedAt:  string;
}

function loadWaitlist(): WaitlistEntry[] {
  if (!existsSync(WAITLIST_PATH)) return [];
  try {
    return readFileSync(WAITLIST_PATH, 'utf-8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) as WaitlistEntry; } catch { return null; } })
      .filter(Boolean) as WaitlistEntry[];
  } catch { return []; }
}

export async function handleWaitlist(
  chatId: number,
  firstName: string,
  username: string | undefined,
  subCmd: string | undefined,
  ownerChatId: string
): Promise<void> {
  // Owner-only subcommands: list + export
  if (subCmd === 'list' || subCmd === 'export') {
    if (String(chatId) !== ownerChatId) {
      await sendMessage(chatId, '🔒 Owner only.');
      return;
    }
    const entries = loadWaitlist();
    if (entries.length === 0) {
      await sendMessage(chatId, '📋 Achiri waitlist: empty');
      return;
    }

    if (subCmd === 'export') {
      // Ready-to-paste env var string for ACHIRI_ALPHA_WHITELIST
      const ids = entries.map(e => e.chatId).join(',');
      await sendMessage(chatId, [
        `📤 *Waitlist Export* — ${entries.length} users`,
        '',
        '`ACHIRI_ALPHA_WHITELIST=' + ids + '`',
        '',
        '_Paste into .env, then pm2 restart telegram-bot_',
      ].join('\n'));
      return;
    }

    const lines = entries.map((e, i) =>
      `${i + 1}. \`${e.chatId}\` — ${e.firstName}${e.username ? ' (@' + e.username + ')' : ''} — ${e.joinedAt.slice(0, 10)}`
    );
    await sendMessage(chatId, `📋 *Achiri Waitlist* (${entries.length} entries)\n\n${lines.join('\n')}\n\n_/waitlist export — get env var string_`);
    return;
  }

  // Any user — join waitlist
  const existing = loadWaitlist();
  const alreadyOn = existing.some(e => e.chatId === String(chatId));

  if (alreadyOn) {
    await sendMessage(chatId, '✅ You\'re already on the Achiri waitlist — we\'ll notify you when it launches (Apr 25)! 🚀');
    return;
  }

  const entry: WaitlistEntry = {
    chatId:    String(chatId),
    firstName,
    username,
    joinedAt:  new Date().toISOString(),
  };

  const dir = dirname(WAITLIST_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(WAITLIST_PATH, JSON.stringify(entry) + '\n', 'utf-8');

  await sendMessage(chatId, [
    '🎉 You\'re on the *Achiri alpha waitlist*!',
    '',
    'Achiri is a culturally adaptive AI companion that speaks Darija, Arabic & French.',
    '',
    '📅 Alpha launches *Apr 25* — you\'ll get an invite here.',
    '',
    'Want a preview? Try: `/achiri مرحبا`',
  ].join('\n'));
}

// ── Achiri health check — Sprint 138 ──────────────────────────────────────────
// Owner-only: pings ACHIRI_BASE_URL/health and reports UP/DOWN + latency.
export async function handleAchiriHealth(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const url = ACHIRI_BASE_URL + '/health';
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (res.ok) {
      const body = await res.json() as { status?: string; version?: string };
      await sendMessage(chatId, `✅ Achiri API: UP (${latency}ms) — version ${body.version ?? '?'}`);
    } else {
      await sendMessage(chatId, `⚠️ Achiri API: HTTP ${res.status} (${latency}ms)`);
    }
  } catch (err: unknown) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    await sendMessage(chatId, `❌ Achiri API: DOWN (${latency}ms) — ${msg}`);
  }
}

// ── Achiri alpha invite — Sprint 146 ──────────────────────────────────────────
// Owner-only: /inviteachiri <chat_id> — adds user to file-based alpha whitelist.
// File: workspace/achiri/alpha-whitelist.jsonl (read at runtime by checkAlphaAccess).
export async function handleInviteAchiri(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const args = text.trim().split(/\s+/);
  const targetId = args[1];

  if (!targetId || !/^\d+$/.test(targetId)) {
    await sendMessage(chatId, '⚠️ Usage: /inviteachiri <chat_id>\nExample: /inviteachiri 123456789');
    return;
  }

  // Check already invited
  let existing: string[] = [];
  if (existsSync(ALPHA_WHITELIST_PATH)) {
    try {
      existing = readFileSync(ALPHA_WHITELIST_PATH, 'utf-8')
        .split('\n').filter(l => l.trim())
        .map(l => { try { return JSON.parse(l).chatId; } catch { return null; } })
        .filter(Boolean) as string[];
    } catch { /* ignore */ }
  }

  if (existing.includes(targetId) || ACHIRI_ALPHA_WHITELIST_ENV.has(targetId)) {
    await sendMessage(chatId, `ℹ️ \`${targetId}\` is already in the Achiri alpha whitelist.`);
    return;
  }

  const entry = { chatId: targetId, invitedAt: new Date().toISOString(), invitedBy: String(ownerChatId) };
  const dir = dirname(ALPHA_WHITELIST_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(ALPHA_WHITELIST_PATH, JSON.stringify(entry) + '\n', 'utf-8');

  const totalInvited = existing.length + 1;
  await sendMessage(chatId, [
    `✅ Invited \`${targetId}\` to Achiri alpha.`,
    `📋 File whitelist: ${totalInvited} user(s).`,
    `_No bot restart needed — access is live immediately._`,
  ].join('\n'));

  // Send onboarding DM to invited user (Sprint 148)
  // Wrapped in try-catch — user may not have started the bot yet
  try {
    await sendMessage(parseInt(targetId), [
      '🎉 You have been invited to *Achiri Lite Alpha*!',
      '',
      'Achiri is a culturally adaptive AI companion that speaks Darija, Arabic & French.',
      '',
      '📅 Alpha launches *Apr 25* — your access is now active.',
      'Try it now: `/achiri مرحبا`',
      '',
      '_Questions? DM @kognai_bot_',
    ].join('\n'));
  } catch (dmErr) {
    console.error('[telegram-bot] handleInviteAchiri: DM to', targetId, 'failed (user may not have started bot):', (dmErr as Error).message);
  }
}

// ── Post reminder — Sprint 140 ─────────────────────────────────────────────────
// Owner-only: gate progress + queue size + exact posting workflow commands.
const MANUAL_POSTS_PATH_BOT = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');
const LEDGER_PATH_BOT        = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
const POSTS_TARGET_BOT = 30;
const VIEWS_TARGET_BOT = 500;

export async function handlePostReminder(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  // Load manual posts
  let recordedPosts = 0;
  let totalViews = 0;
  if (existsSync(MANUAL_POSTS_PATH_BOT)) {
    const lines = readFileSync(MANUAL_POSTS_PATH_BOT, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const p = JSON.parse(line);
        recordedPosts++;
        totalViews += p.views ?? 0;
      } catch { /* skip */ }
    }
  }

  // Load publish ledger (queue size)
  let queueSize = 0;
  if (existsSync(LEDGER_PATH_BOT)) {
    const lines = readFileSync(LEDGER_PATH_BOT, 'utf-8').split('\n').filter(l => l.trim());
    queueSize = lines.length;
  }

  // Cadence calc
  const APR_7 = new Date('2026-04-07T00:00:00Z');
  const daysToGate = Math.ceil((APR_7.getTime() - Date.now()) / 86400000);
  const postsRemaining = Math.max(0, POSTS_TARGET_BOT - recordedPosts);
  const cadence = daysToGate > 0 ? (postsRemaining / daysToGate).toFixed(1) : 'NOW';

  const postsBar = `${recordedPosts}/${POSTS_TARGET_BOT}`;
  const viewsBar = `${totalViews}/${VIEWS_TARGET_BOT}`;

  const lines: string[] = [
    '📋 *Post Reminder — Apr 7 Gate*',
    '',
    `📊 *Gate Progress*`,
    `Posts: ${postsBar} ${recordedPosts >= POSTS_TARGET_BOT ? '✅' : ''}`,
    `Views: ${viewsBar} ${totalViews >= VIEWS_TARGET_BOT ? '✅' : ''}`,
    `Days left: ${daysToGate > 0 ? daysToGate : 'PASSED'}`,
    '',
    `⏱ *Cadence needed:* ${cadence} posts/day`,
    '',
    `🎬 *Queue:* ${queueSize} videos ready in ledger`,
    '',
    '🔧 *Workflow:*',
    '```',
    '# 1. Review available videos',
    'npx ts-node scripts/scs001/review-videos.ts',
    '',
    '# 2. Post on TikTok manually, then record',
    'npx ts-node scripts/scs001/record-manual-post.ts \\',
    '  --video-id <id> --views <n> --title "<title>"',
    '',
    '# 3. Check gate status',
    'npx ts-node scripts/scs001/record-manual-post.ts --list',
    '```',
  ];

  await sendMessage(chatId, lines.join('\n'));
}

// ── Review videos — Sprint 142 ─────────────────────────────────────────────────
// Owner-only: shows top-3 QC-passed videos from latest pipeline run.
const EXPERIMENTS_PATH_BOT = join(process.cwd(), 'workspace', 'scs001', 'experiments.jsonl');
const WORKSPACE_SCS001      = join(process.cwd(), 'workspace', 'scs001');

interface ReviewVideoMeta {
  video_id:            string;
  hook_formula:        string;
  speaker:             string;
  qc_passed:           boolean;
  mp4_path:            string;
  partial_viral_score?: number;
}

function loadExperimentsForReview(): Map<string, ReviewVideoMeta> {
  const map = new Map<string, ReviewVideoMeta>();
  if (!existsSync(EXPERIMENTS_PATH_BOT)) return map;
  try {
    const lines = readFileSync(EXPERIMENTS_PATH_BOT, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const e = JSON.parse(trimmed);
        const id = e.clip_id ?? e.video_id ?? '';
        if (id) {
          map.set(id, {
            video_id:            id,
            hook_formula:        e.hook_formula ?? 'unknown',
            speaker:             e.speaker ?? 'unknown',
            qc_passed:           !!e.qc_passed,
            partial_viral_score: e.partial_viral_score,
            mp4_path:     '',
          });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return map;
}

function getLatestRunDirForReview(): string | null {
  if (!existsSync(WORKSPACE_SCS001)) return null;
  try {
    const { statSync } = require('fs') as typeof import('fs');
    const dirs = readdirSync(WORKSPACE_SCS001)
      .filter(d => d.startsWith('run-'))
      .map(d => ({ name: d, mtime: statSync(join(WORKSPACE_SCS001, d)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return dirs.length > 0 ? join(WORKSPACE_SCS001, dirs[0].name) : null;
  } catch { return null; }
}

export async function handleReview(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const runDir = getLatestRunDirForReview();
  if (!runDir) {
    await sendMessage(chatId, '⚠️ No pipeline runs found. Run the pipeline first.');
    return;
  }

  const captionDir = join(runDir, 'caption');
  if (!existsSync(captionDir)) {
    await sendMessage(chatId, `⚠️ No caption dir in latest run: ${runDir}`);
    return;
  }

  const experiments = loadExperimentsForReview();
  const { basename: pathBasename } = require('path') as typeof import('path');

  const mp4s = readdirSync(captionDir).filter(f => f.endsWith('-captioned.mp4'));
  const videos: ReviewVideoMeta[] = mp4s.map(mp4 => {
    const videoId = mp4.replace('-captioned.mp4', '');
    const meta = experiments.get(videoId);
    return {
      video_id:            videoId,
      hook_formula:        meta?.hook_formula ?? 'unknown',
      speaker:             meta?.speaker ?? 'unknown',
      qc_passed:           meta?.qc_passed ?? false,
      mp4_path:            join(captionDir, mp4),
      partial_viral_score: meta?.partial_viral_score,
    };
  });

  // QC-passed first, then by viral score descending, then take top 3
  const sorted = [...videos].sort((a, b) =>
    (b.qc_passed ? 1 : 0) - (a.qc_passed ? 1 : 0) || (b.partial_viral_score ?? 0) - (a.partial_viral_score ?? 0)
  );
  const top3 = sorted.slice(0, 3);

  if (top3.length === 0) {
    await sendMessage(chatId, '⚠️ No videos found in latest run caption dir.');
    return;
  }

  const runName = pathBasename(runDir);
  const passedCount = videos.filter(v => v.qc_passed).length;

  const msgLines: string[] = [
    `🎬 *Video Review — ${runName}*`,
    `${videos.length} total | ${passedCount} QC-passed | showing top ${top3.length}`,
    '',
  ];

  for (let i = 0; i < top3.length; i++) {
    const v = top3[i];
    const idShort = v.video_id.slice(0, 20);
    const qcIcon = v.qc_passed ? '✅' : '❌';
    msgLines.push(`*${i + 1}. ${qcIcon} ${idShort}*`);
    msgLines.push(`   Formula: ${v.hook_formula}`);
    msgLines.push(`   Speaker: ${v.speaker}`);
    if (v.partial_viral_score != null) msgLines.push(`   Viral: ${v.partial_viral_score.toFixed(2)}`);
    msgLines.push(`   Path: \`${v.mp4_path}\``);
    msgLines.push(`   Record: \`npx ts-node scripts/scs001/record-manual-post.ts --video-id ${v.video_id} --views 0\``);
    msgLines.push('');
  }

  msgLines.push('After posting, update --views <actual_count>');

  await sendMessage(chatId, msgLines.join('\n'));
}

// ── Record manual post — Sprint 143 ────────────────────────────────────────────
// Owner-only: /record <video_id> <views> [title...]
// Appends entry to manual-posts.jsonl + returns gate progress.
const MANUAL_POSTS_PATH_RECORD = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');
const POSTS_TARGET_RECORD = 30;
const VIEWS_TARGET_RECORD = 500;

export async function handleRecord(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const args = text.trim().split(/\s+/);
  // args[0] = '/record', args[1] = video_id, args[2] = views, args[3+] = title
  const videoId = args[1];
  const views   = parseInt(args[2] ?? '', 10);
  const title   = args.slice(3).join(' ') || undefined;

  if (!videoId || isNaN(views)) {
    await sendMessage(chatId, [
      '⚠️ Usage: `/record <video_id> <views> [title]`',
      '',
      'Example:',
      '`/record abc123def456 142 "This is the title"`',
    ].join('\n'));
    return;
  }

  // Append to manual-posts.jsonl
  const now = new Date().toISOString();
  const entry = { video_id: videoId, views, ...(title ? { title } : {}), posted_at: now, recorded_at: now };
  const dir = require('path').dirname(MANUAL_POSTS_PATH_RECORD);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(MANUAL_POSTS_PATH_RECORD, JSON.stringify(entry) + '\n', 'utf-8');

  // Load all posts for gate progress
  let totalPosts = 0;
  let totalViews = 0;
  if (existsSync(MANUAL_POSTS_PATH_RECORD)) {
    const lines = readFileSync(MANUAL_POSTS_PATH_RECORD, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const p = JSON.parse(line);
        totalPosts++;
        totalViews += p.views ?? 0;
      } catch { /* skip */ }
    }
  }

  const APR_7_RECORD = new Date('2026-04-07T00:00:00Z');
  const daysToGate = Math.ceil((APR_7_RECORD.getTime() - Date.now()) / 86400000);
  const postsRemaining = Math.max(0, POSTS_TARGET_RECORD - totalPosts);
  const cadence = daysToGate > 0 ? (postsRemaining / daysToGate).toFixed(1) : 'NOW';

  const postsBar = `${totalPosts}/${POSTS_TARGET_RECORD}${totalPosts >= POSTS_TARGET_RECORD ? ' ✅' : ''}`;
  const viewsBar = `${totalViews}/${VIEWS_TARGET_RECORD}${totalViews >= VIEWS_TARGET_RECORD ? ' ✅' : ''}`;

  const msgLines: string[] = [
    `✅ *Recorded:* \`${videoId}\``,
    `Views: ${views}${title ? ` — ${title}` : ''}`,
    '',
    '📊 *Gate Progress — Apr 7*',
    `Posts: ${postsBar}`,
    `Views: ${viewsBar}`,
    `Cadence: ${cadence} posts/day`,
    `Days left: ${daysToGate > 0 ? daysToGate : 'PASSED'}`,
  ];

  await sendMessage(chatId, msgLines.join('\n'));
}

// ── Update views — Sprint 144 ──────────────────────────────────────────────────
// Owner-only: /updateviews <video_id> <views>
// Updates views on an existing manual-posts.jsonl entry (e.g. real count after 24h).
export async function handleUpdateViews(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const args    = text.trim().split(/\s+/);
  const videoId = args[1];
  const views   = parseInt(args[2] ?? '', 10);

  if (!videoId || isNaN(views)) {
    await sendMessage(chatId, [
      '⚠️ Usage: `/updateviews <video_id> <views>`',
      '',
      'Example: `/updateviews abc123def456 387`',
    ].join('\n'));
    return;
  }

  if (!existsSync(MANUAL_POSTS_PATH_RECORD)) {
    await sendMessage(chatId, '⚠️ manual-posts.jsonl not found. Use /record first.');
    return;
  }

  const rawLines = readFileSync(MANUAL_POSTS_PATH_RECORD, 'utf-8').split('\n');
  let found = false;
  const rewritten = rawLines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    try {
      const entry = JSON.parse(trimmed);
      if (entry.video_id === videoId) {
        found = true;
        entry.views = views;
        entry.updated_at = new Date().toISOString();
        return JSON.stringify(entry);
      }
    } catch { /* skip */ }
    return line;
  });

  if (!found) {
    await sendMessage(chatId, `⚠️ \`${videoId}\` not found in manual-posts.jsonl. Check /postreminder for recorded IDs.`);
    return;
  }

  writeFileSync(MANUAL_POSTS_PATH_RECORD, rewritten.join('\n'), 'utf-8');

  // Recompute gate progress
  let totalPosts = 0;
  let totalViews = 0;
  for (const line of rewritten) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const p = JSON.parse(trimmed);
      totalPosts++;
      totalViews += p.views ?? 0;
    } catch { /* skip */ }
  }

  const APR_7_UV = new Date('2026-04-07T00:00:00Z');
  const daysToGate = Math.ceil((APR_7_UV.getTime() - Date.now()) / 86400000);
  const postsRemaining = Math.max(0, 30 - totalPosts);
  const cadence = daysToGate > 0 ? (postsRemaining / daysToGate).toFixed(1) : 'NOW';

  const postsBar = `${totalPosts}/30${totalPosts >= 30 ? ' ✅' : ''}`;
  const viewsBar = `${totalViews}/500${totalViews >= 500 ? ' ✅' : ''}`;

  await sendMessage(chatId, [
    `✅ *Updated:* \`${videoId}\` → ${views} views`,
    '',
    '📊 *Gate Progress — Apr 7*',
    `Posts: ${postsBar}`,
    `Views: ${viewsBar}`,
    `Cadence: ${cadence} posts/day`,
    `Days left: ${daysToGate > 0 ? daysToGate : 'PASSED'}`,
  ].join('\n'));
}

// ── Achiri deploy status — Sprint 147 ─────────────────────────────────────────
// Owner-only: shows full Achiri alpha deploy checklist.
// Prerequisites: ACHIRI_BASE_URL (non-localhost), ACHIRI_ALPHA_ONLY, API health,
// alpha-whitelist.jsonl count, waitlist count, deploy-achiri.sh present.
export async function handleDeployStatus(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const lines: string[] = ['🚀 *Achiri Alpha Deploy Status*', ''];

  // (1) ACHIRI_BASE_URL
  const baseUrl = process.env.ACHIRI_BASE_URL ?? '';
  const urlIsRemote = baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1');
  lines.push(urlIsRemote
    ? `✅ ACHIRI_BASE_URL: \`${baseUrl}\``
    : `⚠️ ACHIRI_BASE_URL: ${baseUrl ? `\`${baseUrl}\` (localhost — update to Hetzner URL)` : 'not set'}`
  );
  if (!urlIsRemote) lines.push(`   _Set: ACHIRI_BASE_URL=http://65.108.90.178/achiri_`);

  // (2) ACHIRI_ALPHA_ONLY
  const alphaOnly = process.env.ACHIRI_ALPHA_ONLY === 'true';
  lines.push(alphaOnly
    ? `✅ ACHIRI_ALPHA_ONLY: true (alpha gate active)`
    : `⏳ ACHIRI_ALPHA_ONLY: not set (open access — set true when alpha-ready)`
  );

  // (3) Achiri API health (3s timeout)
  const healthUrl = (baseUrl || 'http://localhost:3420') + '/health';
  const start = Date.now();
  let healthLine = '';
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(t);
    const latency = Date.now() - start;
    healthLine = res.ok
      ? `✅ Achiri API: UP (${latency}ms) — ${healthUrl}`
      : `❌ Achiri API: HTTP ${res.status} (${latency}ms)`;
  } catch {
    const latency = Date.now() - start;
    healthLine = `❌ Achiri API: DOWN (${latency}ms) — ${healthUrl}`;
  }
  lines.push(healthLine);
  if (healthLine.startsWith('❌') && !urlIsRemote) {
    lines.push(`   _Run: ./scripts/deploy-achiri.sh_`);
  }

  // (4) deploy-achiri.sh present
  const deployScriptPath = join(process.cwd(), 'scripts', 'deploy-achiri.sh');
  lines.push(existsSync(deployScriptPath)
    ? `✅ deploy-achiri.sh: present`
    : `❌ deploy-achiri.sh: missing (Sprint 129 required)`
  );

  lines.push('');

  // (5) Alpha whitelist (file-based, Sprint 146)
  let invitedCount = 0;
  if (existsSync(ALPHA_WHITELIST_PATH)) {
    try {
      invitedCount = readFileSync(ALPHA_WHITELIST_PATH, 'utf-8')
        .split('\n').filter(l => l.trim()).length;
    } catch { /* ignore */ }
  }
  lines.push(`📋 Alpha whitelist: ${invitedCount} invited`);

  // (6) Waitlist count
  const wl = join(process.cwd(), 'workspace', 'achiri', 'waitlist.jsonl');
  let waitlistCount = 0;
  if (existsSync(wl)) {
    try {
      waitlistCount = readFileSync(wl, 'utf-8').split('\n').filter(l => l.trim()).length;
    } catch { /* ignore */ }
  }
  lines.push(`🙋 Waitlist: ${waitlistCount} users`);

  // Remaining steps
  const remaining: string[] = [];
  if (!urlIsRemote) remaining.push('Set ACHIRI_BASE_URL=http://65.108.90.178/achiri in .env');
  if (healthLine.startsWith('❌')) remaining.push('Run ./scripts/deploy-achiri.sh (or pm2 start --only achiri-api on Hetzner)');
  if (!alphaOnly) remaining.push('When ready: set ACHIRI_ALPHA_ONLY=true in .env, pm2 restart telegram-bot');
  if (invitedCount === 0) remaining.push('Invite alpha users: /inviteachiri <chat_id>');

  if (remaining.length > 0) {
    lines.push('', '📌 *Remaining steps:*');
    remaining.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  } else {
    lines.push('', '✅ *All prerequisites met — Achiri alpha ready to launch!*');
  }

  const daysToAlpha = Math.ceil((new Date('2026-04-25T00:00:00Z').getTime() - Date.now()) / 86400000);
  lines.push('', `📅 Achiri alpha: Apr 25 (${daysToAlpha}d)`);

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 153: /tiktokstatus — TikTok live mode readiness ──────────────────

export async function handleTiktokStatus(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const tokenSet  = Boolean(process.env.TIKTOK_ACCESS_TOKEN);
  const scsMode   = process.env.SCS_MODE ?? 'mock';
  const live      = tokenSet && scsMode === 'live';

  const manual  = loadManualPosts();
  const ledger  = loadPublishLedger();

  const postIcon  = manual.count >= 30 ? '✅' : '❌';
  const viewsIcon = manual.totalViews >= 500 ? '✅' : '❌';

  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));

  const lines: string[] = [
    `🎬 *TikTok Status* — ${live ? '🟢 LIVE MODE' : '🔴 MANUAL MODE'}`,
    '',
    tokenSet ? '✅ TIKTOK_ACCESS_TOKEN' : '❌ TIKTOK_ACCESS_TOKEN (missing)',
    `ℹ️  SCS_MODE: ${scsMode}`,
    '',
    `*Gate progress (Apr 7 — ${daysLeft}d):*`,
    `${postIcon} Posts:  *${manual.count}/30*`,
    `${viewsIcon} Views:  *${manual.totalViews}/500*`,
    '',
    `*Pipeline queue:*`,
    `• Generated: ${ledger.total} | Posted: ${manual.count} | Unposted: ${ledger.total - manual.count}`,
  ];

  if (!live) {
    const steps: string[] = [];
    if (!tokenSet) steps.push('Set TIKTOK_ACCESS_TOKEN in .env (requires TikTok App Review)');
    if (scsMode !== 'live') steps.push('Set SCS_MODE=live in .env');
    if (steps.length > 0) {
      lines.push('', '📌 *To enable live posting:*');
      steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push(`${steps.length + 1}. pm2 start ecosystem.config.js --only scs001-live`);
    }
    lines.push('', '_Until then: use manual posting workflow — /queue → /record_');
  } else {
    lines.push('', '✅ *Live mode active — pipeline posting to TikTok automatically.*');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 150: /queue — Posting queue: unposted videos + daily pace ─────────

export async function handleQueue(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  // Load ledger entries
  const ledgerPath = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
  const manualPath = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');

  let ledgerEntries: Array<{ video_id: string; published_at: string }> = [];
  if (existsSync(ledgerPath)) {
    try {
      ledgerEntries = readFileSync(ledgerPath, 'utf-8')
        .split('\n').filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean) as Array<{ video_id: string; published_at: string }>;
    } catch { /* ignore */ }
  }

  const recordedIds = new Set<string>();
  if (existsSync(manualPath)) {
    try {
      readFileSync(manualPath, 'utf-8')
        .split('\n').filter(l => l.trim())
        .forEach(l => { try { const e = JSON.parse(l); if (e.video_id) recordedIds.add(e.video_id); } catch { /* skip */ } });
    } catch { /* ignore */ }
  }

  const ledgerCount  = ledgerEntries.length;
  const recordedCount = recordedIds.size;
  const queueExperiments = loadExperimentsForReview();
  const allUnposted = ledgerEntries.filter(e => !recordedIds.has(e.video_id));
  allUnposted.sort((a, b) => {
    const va = queueExperiments.get(a.video_id)?.partial_viral_score ?? -1;
    const vb = queueExperiments.get(b.video_id)?.partial_viral_score ?? -1;
    return vb - va;
  });
  const unposted = allUnposted.slice(0, 5);
  const unpostedTotal = allUnposted.length;

  const gateDate   = new Date('2026-04-07T00:00:00Z');
  const daysLeft   = Math.max(1, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));
  const postsNeeded = Math.max(0, 30 - recordedCount);
  const pacePerDay  = postsNeeded > 0 ? Math.ceil(postsNeeded / daysLeft) : 0;

  const lines: string[] = [
    `📋 *Posting Queue* — Apr 7 gate (${daysLeft}d)`,
    '',
    `📼 Pipeline: *${ledgerCount}* generated | *${recordedCount}* posted | *${unpostedTotal}* unposted`,
    `⚡ Pace needed: *${pacePerDay}/day* to hit 30 posts`,
    '',
    unposted.length > 0 ? `*Top ${unposted.length} to post now:*` : '✅ Queue empty or all videos recorded.',
  ];

  unposted.forEach((e, i) => {
    const vs = queueExperiments.get(e.video_id)?.partial_viral_score;
    const vsTag = vs != null ? ` 🧬 ${vs}` : '';
    lines.push(``, `${i + 1}. \`${e.video_id}\`${vsTag}`);
    lines.push(`   → \`/record ${e.video_id} 0\``);
    lines.push(`   _(update views later: /updateviews ${e.video_id} <views>)_`);
  });

  if (postsNeeded === 0) {
    lines.push('', '🎉 *30 posts reached — gate criteria met!*');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 149: /stripestatus — Stripe go-live checklist ────────────────────

export async function handleStripeStatus(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const envCheck = (key: string): string =>
    process.env[key] ? `✅ ${key}` : `❌ ${key} (missing)`;

  const keySet      = Boolean(process.env.STRIPE_SECRET_KEY);
  const growthSet   = Boolean(process.env.STRIPE_PRICE_GROWTH);
  const premiumSet  = Boolean(process.env.STRIPE_PRICE_PREMIUM);
  const webhookSet  = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const webhookPort = process.env.STRIPE_WEBHOOK_PORT || '3001';

  // Ping stripe webhook /health
  let webhookHealth = '⏳ checking...';
  try {
    await new Promise<void>((resolve, reject) => {
      const req = require('http').get(
        { hostname: '127.0.0.1', port: parseInt(webhookPort, 10), path: '/health', timeout: 2000 },
        (res: any) => { webhookHealth = res.statusCode === 200 ? '✅ UP' : `⚠️ HTTP ${res.statusCode}`; resolve(); }
      );
      req.on('error', () => { webhookHealth = '❌ DOWN (not running)'; resolve(); });
      req.on('timeout', () => { req.destroy(); webhookHealth = '❌ TIMEOUT'; resolve(); });
    });
  } catch { webhookHealth = '❌ DOWN'; }

  const subscribers = TelegramDB.activeCount();
  const allSet      = keySet && growthSet && premiumSet && webhookSet;
  const webhookUp   = webhookHealth.startsWith('✅');
  const live        = allSet && webhookUp;

  const lines: string[] = [
    `💳 *Stripe Status* — ${live ? '🟢 LIVE' : '🔴 NOT LIVE'}`,
    '',
    '*Env vars:*',
    envCheck('STRIPE_SECRET_KEY'),
    envCheck('STRIPE_PRICE_GROWTH'),
    envCheck('STRIPE_PRICE_PREMIUM'),
    envCheck('STRIPE_WEBHOOK_SECRET'),
    `ℹ️  STRIPE_WEBHOOK_PORT: ${webhookPort}`,
    '',
    `*Webhook server (port ${webhookPort}):* ${webhookHealth}`,
    `*Active subscribers:* ${subscribers}`,
  ];

  const steps: string[] = [];
  if (!keySet)     steps.push('Set STRIPE_SECRET_KEY=sk_live_... in .env');
  if (!growthSet)  steps.push('Set STRIPE_PRICE_GROWTH=price_... in .env');
  if (!premiumSet) steps.push('Set STRIPE_PRICE_PREMIUM=price_... in .env');
  if (!webhookSet) steps.push('Set STRIPE_WEBHOOK_SECRET=whsec_... in .env');
  if (!webhookUp)  steps.push('pm2 start ecosystem.config.js --only kognai-stripe-webhook');
  if (steps.length > 0) {
    lines.push('', '📌 *Next steps:*');
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  } else {
    lines.push('', '✅ *All prerequisites met — Stripe is live!*');
    lines.push('Forward prod events: stripe listen --forward-to localhost:' + webhookPort + '/webhook');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 154: /postnow — Manual posting assistant ─────────────────────────

function runIdToEpoch(runId: string): number | null {
  try {
    // runId: scs001-2026-03-16T16-39-58-797Z
    const ts = runId.replace('scs001-', '');
    const [datePart, timePart] = ts.split('T');
    const tp = timePart.replace('Z', '').split('-');
    const iso = `${datePart}T${tp[0]}:${tp[1]}:${tp[2]}.${tp[3]}Z`;
    const ms = new Date(iso).getTime();
    return isNaN(ms) ? null : ms;
  } catch { return null; }
}

// Sprint 164: directory-scan helpers — robust to epoch off-by-1ms issues
function findCaptionedMp4(cwd: string, videoId: string): string | null {
  try {
    const scsDir = join(cwd, 'workspace', 'scs001');
    const runDirs = readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

function findScriptJson(cwd: string, videoId: string): string | null {
  try {
    const scsDir = join(cwd, 'workspace', 'scs001');
    const runDirs = readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = join(scsDir, dir, 'script', `${videoId}-script.json`);
      if (existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

function nextPostingSlot(): string {
  const now = new Date();
  const h = now.getHours();
  const slots = [7, 12, 18, 21];
  const next = slots.find(s => s > h);
  if (next !== undefined) return `Today at ${String(next).padStart(2, '0')}:00`;
  return 'Tomorrow at 07:00';
}

export async function handlePostNow(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const cwd = process.cwd();
  const ledgerPath = join(cwd, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const manualPath = join(cwd, 'workspace', 'scs001', 'manual-posts.jsonl');
  const topicsPath = join(cwd, 'workspace', 'scs001', 'viral-topics.json');

  // Load recorded ids
  const recordedIds = new Set<string>();
  if (existsSync(manualPath)) {
    try {
      readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { const e = JSON.parse(l); if (e.video_id) recordedIds.add(e.video_id); } catch { /* skip */ } });
    } catch { /* ignore */ }
  }

  // Load hashtags from viral-topics.json
  let viralHashtags: string[] = [];
  if (existsSync(topicsPath)) {
    try {
      const vt = JSON.parse(readFileSync(topicsPath, 'utf-8'));
      viralHashtags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`);
    } catch { /* ignore */ }
  }
  if (viralHashtags.length === 0) viralHashtags = ['#ai', '#tech'];
  const hashtags = [...viralHashtags, '#fyp', '#viral', '#learnontiktok'].join(' ');

  // Load ledger and find unposted entries with valid mp4 files
  interface LedgerEntry { video_id: string; run_id: string; speaker?: string; topic?: string; }
  const ready: Array<LedgerEntry & { filePath: string }> = [];

  if (existsSync(ledgerPath)) {
    const entries: LedgerEntry[] = readFileSync(ledgerPath, 'utf-8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean) as LedgerEntry[];

    for (const e of entries) {
      if (recordedIds.has(e.video_id)) continue;
      const mp4 = findCaptionedMp4(cwd, e.video_id);
      if (mp4) {
        ready.push({ ...e, filePath: mp4 });
      }
    }
  }

  // Sort by viral score (highest first), then take top 3
  const experiments = loadExperimentsForReview();
  ready.sort((a, b) => {
    const va = experiments.get(a.video_id)?.partial_viral_score ?? -1;
    const vb = experiments.get(b.video_id)?.partial_viral_score ?? -1;
    return vb - va;
  });
  ready.splice(3);

  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(1, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));
  const postsNeeded = Math.max(0, 30 - recordedIds.size);
  const slot = nextPostingSlot();

  if (ready.length === 0) {
    await sendMessage(chatId, [
      `🎬 *Post Now* — Apr 7 gate (${daysLeft}d, ${postsNeeded} posts needed)`,
      '',
      '⚠️ No ready videos found on disk.',
      'Run the pipeline first: `pm2 start ecosystem.config.js --only scs001-pipeline`',
    ].join('\n'));
    return;
  }

  const lines: string[] = [
    `🎬 *Post Now* — Apr 7 gate (${daysLeft}d, ${postsNeeded} posts needed)`,
    `⏰ Post at: *${slot}*`,
    '',
  ];

  ready.forEach((v, i) => {
    const homePath = v.filePath.replace(process.env.HOME ?? '/Users/tarekmnif', '~');
    const viralScore = experiments.get(v.video_id)?.partial_viral_score;
    lines.push(`*${i + 1}. \`${v.video_id}\`*`);
    if (viralScore != null) lines.push(`   🧬 Viral: ${viralScore}`);
    if (v.speaker) lines.push(`   🎙️ Speaker: ${v.speaker}`);
    if (v.topic)   lines.push(`   📝 Topic: ${v.topic.slice(0, 70)}`);
    lines.push(`   📁 \`${homePath}\``);
    lines.push(`   🏷️ ${hashtags}`);
    lines.push(`   → After posting: \`/record ${v.video_id} 0\``);
    if (i < ready.length - 1) lines.push('');
  });

  await sendMessage(chatId, lines.join('\n'));

  // Sprint 226+277: Send actual video files via Telegram with enriched captions
  for (const v of ready) {
    const exp = experiments.get(v.video_id);
    const captionParts: string[] = [];
    if (exp?.partial_viral_score != null) captionParts.push(`Viral: ${exp.partial_viral_score}`);
    if (exp?.speaker && exp.speaker !== 'unknown') captionParts.push(exp.speaker);
    if (exp?.hook_formula && exp.hook_formula !== 'unknown') captionParts.push(`Hook: ${exp.hook_formula}`);
    if (v.topic) captionParts.push(v.topic.slice(0, 80));
    captionParts.push(hashtags);
    captionParts.push(`\n/record ${v.video_id} 0`);
    try {
      await sendVideo(chatId, v.filePath, captionParts.join('\n'));
    } catch (err) {
      await sendMessage(chatId, `⚠️ Could not send \`${v.video_id}\`: ${(err as Error).message?.slice(0, 100)}`);
    }
  }
}

// ── Sprint 156: /caption [video_id] — Ready-to-paste TikTok caption ───────────

export async function handleCaption(chatId: number, ownerChatId: string, videoId?: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const cwd = process.cwd();
  const ledgerPath = join(cwd, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const manualPath = join(cwd, 'workspace', 'scs001', 'manual-posts.jsonl');
  const topicsPath = join(cwd, 'workspace', 'scs001', 'viral-topics.json');

  // Load recorded ids (to skip when searching for top unposted)
  const recordedIds = new Set<string>();
  if (existsSync(manualPath)) {
    try {
      readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { const e = JSON.parse(l); if (e.video_id) recordedIds.add(e.video_id); } catch { /* skip */ } });
    } catch { /* ignore */ }
  }

  // Load hashtags from viral-topics.json
  let viralHashtags: string[] = [];
  if (existsSync(topicsPath)) {
    try {
      const vt = JSON.parse(readFileSync(topicsPath, 'utf-8'));
      viralHashtags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`);
    } catch { /* ignore */ }
  }
  if (viralHashtags.length === 0) viralHashtags = ['#ai', '#tech'];
  const hashtags = [...viralHashtags, '#fyp', '#viral', '#learnontiktok'].join(' ');

  // Find target ledger entry
  interface LedgerEntry { video_id: string; run_id: string; speaker?: string; topic?: string; }
  let entry: LedgerEntry | null = null;

  if (existsSync(ledgerPath)) {
    const entries: LedgerEntry[] = readFileSync(ledgerPath, 'utf-8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean) as LedgerEntry[];

    if (videoId) {
      entry = entries.find(e => e.video_id === videoId) ?? null;
    } else {
      // Find first unposted entry with a captioned mp4 on disk
      for (const e of entries) {
        if (recordedIds.has(e.video_id)) continue;
        if (findCaptionedMp4(cwd, e.video_id)) { entry = e; break; }
      }
    }
  }

  if (!entry) {
    const msg = videoId
      ? `❓ Video \`${videoId}\` not found in ledger.`
      : '⚠️ No ready unposted videos found. Run pipeline or use `/caption <video_id>`.';
    await sendMessage(chatId, msg);
    return;
  }

  // Try to load hook from script JSON
  let hookText: string = entry.topic ?? entry.video_id;
  const scriptPath = findScriptJson(cwd, entry.video_id);
  if (scriptPath) {
    try {
      const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));
      hookText = script.hook ?? script.title ?? script.headline ?? hookText;
    } catch { /* fallback to topic */ }
  }

  const caption = `${hookText}\n\n${hashtags}`;

  await sendMessage(chatId, [
    `📋 *TikTok caption for* \`${entry.video_id}\`:`,
    entry.speaker ? `🎙️ ${entry.speaker}` : '',
  ].filter(Boolean).join('\n'));

  // Send caption as code block — tap to copy on mobile
  await sendMessage(chatId, '```\n' + caption + '\n```');
}

// ── Sprint 158: /pace — Dynamic posting pace calculator ───────────────────────

export async function handlePace(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const cwd = process.cwd();
  const manualPath = join(cwd, 'workspace', 'scs001', 'manual-posts.jsonl');

  const POSTS_TARGET = 30;
  const GATE_DATE    = new Date('2026-04-07T00:00:00Z');

  // Load recorded posts
  const entries: Array<{ video_id: string; recorded_at?: string }> = [];
  if (existsSync(manualPath)) {
    try {
      readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => {
          try { const e = JSON.parse(l); if (e.video_id) entries.push(e); } catch { /* skip */ }
        });
    } catch { /* ignore */ }
  }

  const recordedCount = entries.length;
  const postsNeeded   = Math.max(0, POSTS_TARGET - recordedCount);
  const now           = Date.now();
  const daysLeft      = Math.max(1, Math.ceil((GATE_DATE.getTime() - now) / 86400000));
  const rateNeeded    = postsNeeded / daysLeft;
  const todayTarget   = Math.ceil(postsNeeded / daysLeft);

  // Compute velocity (avg posts/day since first recorded post)
  let velocity = 0;
  if (recordedCount > 0) {
    const timestamps = entries
      .map(e => e.recorded_at ? new Date(e.recorded_at).getTime() : 0)
      .filter(t => t > 0)
      .sort();
    if (timestamps.length >= 1) {
      const firstTs = timestamps[0];
      const daysSinceFirst = Math.max(1, Math.ceil((now - firstTs) / 86400000));
      velocity = recordedCount / daysSinceFirst;
    }
  }

  // Status
  let statusEmoji: string;
  let statusText: string;
  if (recordedCount >= POSTS_TARGET) {
    statusEmoji = '🎉';
    statusText  = 'Gate met!';
  } else if (recordedCount === 0) {
    statusEmoji = '🚨';
    statusText  = 'Not started';
  } else if (velocity >= rateNeeded) {
    statusEmoji = '✅';
    statusText  = 'On track';
  } else {
    statusEmoji = '⚠️';
    statusText  = 'Behind pace';
  }

  const lines: string[] = [
    `📊 *Posting Pace* — Apr 7 gate`,
    '',
    `${statusEmoji} Status: *${statusText}*`,
    `📹 Posted: ${recordedCount}/${POSTS_TARGET}`,
    `📅 Days left: ${daysLeft}`,
    `🎯 Need: ${rateNeeded.toFixed(1)}/day`,
    `📌 Today: post *${todayTarget}* video(s)`,
  ];

  if (recordedCount > 0) {
    lines.push(`📈 Velocity: ${velocity.toFixed(1)}/day avg`);
  }

  if (recordedCount < POSTS_TARGET) {
    lines.push('');
    lines.push(`→ Use /postnow or /caption to get started`);
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 159: /today — daily operator morning cockpit ──────────────────────

export async function handleToday(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const POSTS_TARGET = 30;
  const GATE_DATE    = new Date('2026-04-07T00:00:00Z');

  const manualPath  = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');
  const ledgerPath  = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
  const topicsPath  = join(process.cwd(), 'workspace', 'scs001', 'viral-topics.json');

  // 1. Recorded posts
  let recordedCount = 0;
  const recordedIds = new Set<string>();
  if (existsSync(manualPath)) {
    try {
      readFileSync(manualPath, 'utf-8')
        .split('\n').filter(l => l.trim())
        .forEach(l => { try { const e = JSON.parse(l); if (e.video_id) { recordedIds.add(e.video_id); recordedCount++; } } catch { /* skip */ } });
    } catch { /* ignore */ }
  }

  // 2. Pace math
  const now         = Date.now();
  const postsNeeded = Math.max(0, POSTS_TARGET - recordedCount);
  const daysLeft    = Math.max(1, Math.ceil((GATE_DATE.getTime() - now) / 86400000));
  const todayTarget = recordedCount >= POSTS_TARGET ? 0 : Math.ceil(postsNeeded / daysLeft);
  const rateNeeded  = postsNeeded / daysLeft;

  // 3. Today's scheduled video from content calendar (enriched with speaker/hook/topic)
  const calPath = join(process.cwd(), 'workspace', 'scs001', 'content-calendar.json');
  let todaySchedule: Array<{ video_id: string; slot: string; speaker?: string; hook_formula?: string; topic?: string; viral_score?: number }> = [];
  let nextVideoId: string | null = null;
  if (existsSync(calPath)) {
    try {
      const cal = JSON.parse(readFileSync(calPath, 'utf-8'));
      const todayKey = new Date().toISOString().split('T')[0];
      todaySchedule = (cal.schedule?.[todayKey] ?? []).filter((s: any) => !recordedIds.has(s.video_id));
      if (todaySchedule.length > 0) nextVideoId = todaySchedule[0].video_id;
    } catch { /* ignore */ }
  }
  // Fallback to ledger if calendar empty
  if (!nextVideoId && existsSync(ledgerPath)) {
    try {
      const ledgerEntries = readFileSync(ledgerPath, 'utf-8')
        .split('\n').filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean) as Array<{ video_id: string; published_at: string }>;
      const unposted = ledgerEntries
        .filter(e => !recordedIds.has(e.video_id))
        .sort((a, b) => b.published_at.localeCompare(a.published_at));
      if (unposted.length > 0) nextVideoId = unposted[0].video_id;
    } catch { /* ignore */ }
  }

  // 4. Viral topics (top 3)
  let topics: string[] = [];
  if (existsSync(topicsPath)) {
    try {
      const data = JSON.parse(readFileSync(topicsPath, 'utf-8'));
      topics = (Array.isArray(data.topics) ? data.topics : []).slice(0, 3);
    } catch { /* ignore */ }
  }

  // 5. Build message
  if (recordedCount >= POSTS_TARGET) {
    await sendMessage(chatId, `🎉 *Gate met!* 30/30 posts recorded. Phase 1 gate criteria achieved.`);
    return;
  }

  const lines: string[] = [
    `🌅 *Good morning* — Today's mission`,
    '',
    `🎯 Post *${todayTarget}* video(s) today (${rateNeeded.toFixed(1)}/day needed)`,
    `📅 ${daysLeft} days left | ${recordedCount}/30 posted`,
    '',
  ];

  if (todaySchedule.length > 0) {
    lines.push(`📹 *Today's scheduled videos:*`);
    for (const item of todaySchedule) {
      lines.push(`⏰ *${item.slot}* — \`${item.video_id}\``);
      if (item.speaker && item.speaker !== 'unknown') lines.push(`   🎙️ ${item.speaker}`);
      if (item.hook_formula) lines.push(`   🎣 ${item.hook_formula}`);
      if (item.topic) lines.push(`   📝 ${(item.topic as string).slice(0, 50)}`);
      lines.push(`   → /caption ${item.video_id}`);
    }
    lines.push(`→ /postnow for full posting checklist`);
  } else if (nextVideoId) {
    lines.push(`📹 *Next video to post:*`);
    lines.push(`\`${nextVideoId}\``);
    lines.push(`→ /caption ${nextVideoId}`);
    lines.push(`→ /postnow for full checklist`);
  } else {
    lines.push(`📹 Queue empty — run the pipeline or check /queue`);
  }

  if (topics.length > 0) {
    lines.push('');
    lines.push(`🔥 *Trending topics:*`);
    topics.forEach(t => lines.push(`• ${t}`));
  }

  lines.push('');
  lines.push(`→ /queue for full list | /pace for pace math`);

  await sendMessage(chatId, lines.join('\n'));
}
// ── Sprint 160: /viral — trending topics content inspiration ─────────────────

export async function handleViral(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const topicsPath = join(process.cwd(), 'workspace', 'scs001', 'viral-topics.json');

  if (!existsSync(topicsPath)) {
    await sendMessage(chatId, '⚠️ No viral topics yet — pipeline must run first. Check /queue.');
    return;
  }

  let topics: string[] = [];
  let freshness = 'unknown';

  try {
    const data = JSON.parse(readFileSync(topicsPath, 'utf-8'));
    topics = (Array.isArray(data.topics) ? data.topics : []).slice(0, 10);
  } catch {
    await sendMessage(chatId, '⚠️ Failed to read viral-topics.json. Check /queue.');
    return;
  }

  if (topics.length === 0) {
    await sendMessage(chatId, '⚠️ No viral topics yet — pipeline must run first. Check /queue.');
    return;
  }

  try {
    const stat = statSync(topicsPath);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageH  = Math.floor(ageMs / 3600000);
    if (ageH === 0) {
      const ageMin = Math.floor(ageMs / 60000);
      freshness = `${ageMin}m ago`;
    } else if (ageH < 24) {
      freshness = `${ageH}h ago`;
    } else {
      const ageD = Math.floor(ageH / 24);
      freshness = `${ageD}d ago`;
    }
  } catch { /* ignore */ }

  const lines: string[] = [
    `🔥 *Viral Topics* — top ${topics.length} trending`,
    `_(Updated: ${freshness})_`,
    '',
  ];

  topics.forEach((t, i) => lines.push(`${i + 1}. ${t}`));

  lines.push('');
  lines.push(`💡 Use these as your next video topics.`);
  lines.push(`→ /today for today's target | /queue for ready videos`);

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 163: /pm2status — PM2 process watchboard ─────────────────────────

interface Pm2Process {
  name: string;
  pm2_env: {
    status: string;
    pm_uptime: number;
    restart_time: number;
    pm_id: number;
  };
}

function formatUptime(uptimeMs: number): string {
  if (!uptimeMs || uptimeMs <= 0) return 'stopped';
  const totalMin = Math.floor(uptimeMs / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'online':   return '🟢';
    case 'stopped':  return '⭕';
    case 'errored':  return '🔴';
    case 'launching':return '🟡';
    default:         return '⚪';
  }
}

export async function handlePm2Status(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  let processes: Pm2Process[] = [];
  try {
    const raw = execSync('pm2 jlist', { timeout: 10000, encoding: 'utf-8' });
    processes = JSON.parse(raw);
  } catch (e: any) {
    await sendMessage(chatId, `⚠️ pm2 jlist failed: ${(e as Error).message?.slice(0, 200) ?? 'unknown error'}`);
    return;
  }

  if (!Array.isArray(processes) || processes.length === 0) {
    await sendMessage(chatId, '⚠️ No PM2 processes found. Is PM2 running?');
    return;
  }

  const online = processes.filter(p => p.pm2_env?.status === 'online').length;
  const lines: string[] = [
    `⚙️ *PM2 Processes* (${online}/${processes.length} online)`,
    '',
  ];

  for (const p of processes) {
    const env    = p.pm2_env ?? { status: 'unknown', pm_uptime: 0, restart_time: 0, pm_id: 0 };
    const emoji  = statusEmoji(env.status ?? 'unknown');
    const uptime = env.status === 'online' ? formatUptime(Date.now() - (env.pm_uptime ?? 0)) : env.status;
    const restarts = env.restart_time ?? 0;
    lines.push(`${emoji} \`${p.name}\` — ${uptime}, R:${restarts}`);
  }

  lines.push('');
  lines.push('🟢=online ⭕=stopped 🔴=errored | R=restarts');

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 167: /postbatch [N] — Batch post N videos with captions ──────────
// Shows next N unposted captioned videos (file path + caption + /record command).
// Reduces operator friction: one command replaces N×(/postnow + /caption + note).

export async function handlePostBatch(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const cwd = process.cwd();

  // Parse N from text (e.g. "/postbatch 3" → 3)
  const args = text.trim().split(/\s+/);
  const rawN = parseInt(args[1] ?? '5', 10);
  const N = isNaN(rawN) ? 5 : Math.min(Math.max(rawN, 1), 10);

  const ledgerPath = join(cwd, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const manualPath = join(cwd, 'workspace', 'scs001', 'manual-posts.jsonl');
  const topicsPath = join(cwd, 'workspace', 'scs001', 'viral-topics.json');

  // Load recorded ids
  const recordedIds = new Set<string>();
  if (existsSync(manualPath)) {
    try {
      readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { const e = JSON.parse(l); if (e.video_id) recordedIds.add(e.video_id); } catch { /* skip */ } });
    } catch { /* ignore */ }
  }

  // Load hashtags
  let viralHashtags: string[] = [];
  if (existsSync(topicsPath)) {
    try {
      const vt = JSON.parse(readFileSync(topicsPath, 'utf-8'));
      viralHashtags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`);
    } catch { /* ignore */ }
  }
  if (viralHashtags.length === 0) viralHashtags = ['#ai', '#tech'];
  const hashtags = [...viralHashtags, '#fyp', '#viral', '#learnontiktok'].join(' ');

  if (!existsSync(ledgerPath)) {
    await sendMessage(chatId, '⚠️ publish-ledger.jsonl not found. Run pipeline first.');
    return;
  }

  interface LedgerEntry { video_id: string; run_id: string; speaker?: string; topic?: string; }
  const allEntries: LedgerEntry[] = readFileSync(ledgerPath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as LedgerEntry[];

  // Find all unposted entries with valid captioned mp4 on disk, then sort by viral score
  const allReady: Array<{ entry: LedgerEntry; mp4: string }> = [];
  for (const e of allEntries) {
    if (recordedIds.has(e.video_id)) continue;
    const mp4 = findCaptionedMp4(cwd, e.video_id);
    if (mp4) allReady.push({ entry: e, mp4 });
  }
  const batchExperiments = loadExperimentsForReview();
  allReady.sort((a, b) => {
    const va = batchExperiments.get(a.entry.video_id)?.partial_viral_score ?? -1;
    const vb = batchExperiments.get(b.entry.video_id)?.partial_viral_score ?? -1;
    return vb - va;
  });
  const batch = allReady.slice(0, N);

  if (batch.length === 0) {
    await sendMessage(chatId, '⚠️ No ready unposted videos found. Run pipeline or check /queue.');
    return;
  }

  // Header
  await sendMessage(chatId,
    `📦 *Post Batch (${batch.length}/${N} videos)*\n\nPost each video to TikTok, then run the \`/record\` command shown.`
  );

  // One message per video
  for (let i = 0; i < batch.length; i++) {
    const { entry, mp4 } = batch[i];

    // Try to load hook from script JSON
    let hookText: string = entry.topic ?? entry.video_id;
    const scriptPath = findScriptJson(cwd, entry.video_id);
    if (scriptPath) {
      try {
        const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));
        hookText = script.hook ?? script.title ?? script.headline ?? hookText;
      } catch { /* fallback */ }
    }

    const caption = `${hookText}\n\n${hashtags}`;
    const batchExp = batchExperiments.get(entry.video_id);
    const speakerName = batchExp?.speaker && batchExp.speaker !== 'unknown' ? batchExp.speaker : entry.speaker;
    const speakerLine = speakerName ? `🎙️ ${speakerName}` : '';
    const hookLine = batchExp?.hook_formula && batchExp.hook_formula !== 'unknown' ? `🎣 ${batchExp.hook_formula}` : '';

    const viralScore = batchExp?.partial_viral_score;
    const viralLine = viralScore != null ? `🧬 Viral: ${viralScore}` : '';

    const header = [
      `🎬 *Video ${i + 1}/${batch.length}:* \`${entry.video_id}\``,
      viralLine,
      speakerLine,
      hookLine,
      `📁 \`${mp4}\``,
    ].filter(Boolean).join('\n');

    await sendMessage(chatId, header);
    await sendMessage(chatId, '```\n' + caption + '\n```');

    // Sprint 226: Send actual video file via Telegram for easy save-to-phone
    try {
      const vidMeta = [hookText];
      if (speakerName) vidMeta.push(speakerName);
      await sendVideo(chatId, mp4, `${vidMeta.join(' — ')}\n${hashtags}\n\n/record ${entry.video_id} 0`);
    } catch (err) {
      await sendMessage(chatId, `⚠️ Could not send video: ${(err as Error).message?.slice(0, 100)}`);
    }

    await sendMessage(chatId, `✅ After posting: \`/record ${entry.video_id} 0\``);
  }

  await sendMessage(chatId, `─\n📊 Done. Record views with \`/record <id> <views>\` then check gate: \`/gate\``);
}

// ── SPRINT-171-PUB: /sendvideo — Deliver captioned video via Telegram ────────
// Usage: /sendvideo [video_id]
// Owner-only. Omit video_id to auto-pick the next unsent ready video.
// Logs sent videos to workspace/scs001/telegram-sent.jsonl.

export async function handleSendVideo(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const cwd        = process.cwd();
  const ledgerPath = join(cwd, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const sentPath   = join(cwd, 'workspace', 'scs001', 'telegram-sent.jsonl');
  const topicsPath = join(cwd, 'workspace', 'scs001', 'viral-topics.json');

  if (!existsSync(ledgerPath)) {
    await sendMessage(chatId, '⚠️ publish-ledger.jsonl not found. Run pipeline first.');
    return;
  }

  // Load already-sent IDs
  const sentIds = new Set<string>();
  if (existsSync(sentPath)) {
    try {
      readFileSync(sentPath, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { const e = JSON.parse(l); if (e.video_id) sentIds.add(e.video_id); } catch { /* skip */ } });
    } catch { /* ignore */ }
  }

  // Load ledger
  interface SendVideoLedgerEntry { video_id: string; run_id: string; speaker?: string; topic?: string; }
  const allEntries: SendVideoLedgerEntry[] = readFileSync(ledgerPath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as SendVideoLedgerEntry[];

  // Determine target video_id
  const requestedId = text.split(/\s+/)[1]?.trim();
  let target: { entry: SendVideoLedgerEntry; mp4: string } | null = null;

  if (requestedId) {
    const entry = allEntries.find(e => e.video_id === requestedId);
    if (!entry) {
      await sendMessage(chatId, `⚠️ video_id \`${requestedId}\` not found in ledger.`);
      return;
    }
    const mp4 = findCaptionedMp4(cwd, requestedId);
    if (!mp4) {
      await sendMessage(chatId, `⚠️ No captioned MP4 found on disk for \`${requestedId}\`.`);
      return;
    }
    target = { entry, mp4 };
  } else {
    // Auto-pick: first unsent with a valid captioned mp4
    for (const entry of allEntries) {
      if (sentIds.has(entry.video_id)) continue;
      const mp4 = findCaptionedMp4(cwd, entry.video_id);
      if (mp4) { target = { entry, mp4 }; break; }
    }
    if (!target) {
      await sendMessage(chatId, '✅ All ready videos already sent via Telegram. Nothing new to deliver.\n\nRun pipeline or check `/queue`.');
      return;
    }
  }

  // Build caption
  let hookText: string = target.entry.topic ?? target.entry.video_id;
  const scriptPath = findScriptJson(cwd, target.entry.video_id);
  if (scriptPath) {
    try {
      const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));
      hookText = script.hook ?? script.title ?? script.headline ?? hookText;
    } catch { /* fallback */ }
  }

  let viralHashtags: string[] = [];
  if (existsSync(topicsPath)) {
    try {
      const vt = JSON.parse(readFileSync(topicsPath, 'utf-8'));
      viralHashtags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`);
    } catch { /* ignore */ }
  }
  if (viralHashtags.length === 0) viralHashtags = ['#ai', '#tech'];
  const hashtags = [...viralHashtags, '#fyp', '#viral', '#learnontiktok'].join(' ');
  const caption  = `${hookText}\n\n${hashtags}`;

  await sendMessage(chatId, `📤 Sending \`${target.entry.video_id}\`…`);

  try {
    await sendVideo(chatId, target.mp4, caption);
  } catch (err) {
    await sendMessage(chatId, `❌ sendVideo failed: ${(err as Error).message}`);
    return;
  }

  // Log to telegram-sent.jsonl
  mkdirSync(join(cwd, 'workspace', 'scs001'), { recursive: true });
  appendFileSync(sentPath, JSON.stringify({
    video_id: target.entry.video_id,
    sent_at:  new Date().toISOString(),
    mp4:      target.mp4,
  }) + '\n', 'utf-8');

  await sendMessage(chatId,
    `✅ *Video delivered!*\n\n` +
    `🎬 \`${target.entry.video_id}\`\n\n` +
    `📋 *Caption (copy & paste to TikTok):*\n\`\`\`\n${caption}\n\`\`\`\n\n` +
    `✅ After posting: \`/record ${target.entry.video_id} 0\``
  );
}

// ── Sprint 192: /viralstats — Viral score summary ───────────────────────────

export async function handleViralStats(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const experiments = loadExperimentsForReview();
  const entries = Array.from(experiments.values());
  const scored = entries.filter(e => e.partial_viral_score != null);

  if (scored.length === 0) {
    await sendMessage(chatId, '🧬 *Viral Stats*\n\nNo viral scores yet. Run batch scorer:\n`npx ts-node scripts/scs001/batch-viral-score.ts`');
    return;
  }

  const scores = scored.map(e => e.partial_viral_score!);
  const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3);
  const max = Math.max(...scores).toFixed(3);
  const min = Math.min(...scores).toFixed(3);
  const above07 = scores.filter(s => s >= 0.7).length;

  // Top 3 highest-scored
  scored.sort((a, b) => (b.partial_viral_score ?? 0) - (a.partial_viral_score ?? 0));
  const top3 = scored.slice(0, 3);

  const lines: string[] = [
    '🧬 *Viral Score Summary*',
    '',
    `📊 Scored: *${scored.length}* / ${entries.length} experiments`,
    `📈 Average: *${avg}* | Max: *${max}* | Min: *${min}*`,
    `🔥 High (≥0.7): *${above07}*`,
    '',
    '*Top 3 by Viral Score:*',
  ];

  top3.forEach((e, i) => {
    lines.push(`${i + 1}. \`${e.video_id}\` — 🧬 ${e.partial_viral_score} | ${e.hook_formula} | ${e.speaker}`);
  });

  lines.push('', '💡 Use /postnow to post the highest-scoring video');

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 193: /calendar — Content calendar for today ───────────────────────

export async function handleCalendar(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== String(ownerChatId)) {
    await sendMessage(chatId, '⛔ Owner-only command.');
    return;
  }

  const calPath = join(process.cwd(), 'workspace', 'scs001', 'content-calendar.json');
  if (!existsSync(calPath)) {
    await sendMessage(chatId, '📅 *Content Calendar*\n\nNo calendar found. Generate one:\n`npx ts-node scripts/scs001/generate-content-calendar.ts`');
    return;
  }

  let calendar: any;
  try { calendar = JSON.parse(readFileSync(calPath, 'utf-8')); } catch {
    await sendMessage(chatId, '⚠️ Failed to parse content-calendar.json');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const todayItems: any[] = calendar.schedule?.[today] ?? [];

  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));

  const lines: string[] = [
    `📅 *Content Calendar* — ${today}`,
    `⏰ Gate: ${daysLeft}d | Total assigned: ${calendar.total_videos_assigned ?? 0}`,
    '',
  ];

  if (todayItems.length === 0) {
    lines.push('✅ No videos scheduled for today (rest day or calendar exhausted).');
  } else {
    lines.push(`*Today's ${todayItems.length} videos:*`);
    todayItems.forEach((item: any, i: number) => {
      const vs = item.viral_score != null ? `🧬 ${item.viral_score}` : '';
      lines.push(``, `${i + 1}. ⏰ *${item.slot}* — \`${item.video_id}\``);
      if (vs) lines.push(`   ${vs}`);
      if (item.speaker && item.speaker !== 'unknown') lines.push(`   🎙️ ${item.speaker}`);
      if (item.hook_formula) lines.push(`   🎣 Hook: ${item.hook_formula}`);
      if (item.topic) lines.push(`   📝 ${item.topic.slice(0, 60)}`);
      lines.push(`   → \`/record ${item.video_id} 0\``);
    });
  }

  // Show tomorrow preview
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const tomorrowItems: any[] = calendar.schedule?.[tomorrowStr] ?? [];
  if (tomorrowItems.length > 0) {
    lines.push('', `📆 Tomorrow (${tomorrowStr}): ${tomorrowItems.length} videos scheduled`);
  }

  lines.push('', '💡 /postnow for files + captions | /postbatch for bulk');

  await sendMessage(chatId, lines.join('\n'));

  // Sprint 231: Send today's scheduled video files via Telegram
  const cwd = process.cwd();
  const topicsPath = join(cwd, 'workspace', 'scs001', 'viral-topics.json');
  let calHashtags = '#ai #tech #fyp #viral #learnontiktok';
  try {
    const vt = JSON.parse(readFileSync(topicsPath, 'utf-8'));
    const tags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`);
    if (tags.length > 0) calHashtags = [...tags, '#fyp', '#viral', '#learnontiktok'].join(' ');
  } catch { /* fallback */ }

  for (const item of todayItems) {
    const mp4 = findCaptionedMp4(cwd, item.video_id);
    if (mp4) {
      try {
        const meta = [item.slot, item.video_id];
        if (item.speaker && item.speaker !== 'unknown') meta.push(item.speaker);
        if (item.hook_formula) meta.push(`Hook: ${item.hook_formula}`);
        await sendVideo(chatId, mp4, `${meta.join(' — ')}\n${calHashtags}\n\n/record ${item.video_id} 0`);
      } catch (err) {
        await sendMessage(chatId, `⚠️ Could not send \`${item.video_id}\`: ${(err as Error).message?.slice(0, 100)}`);
      }
    }
  }
}

// ── /health — System Health Check (Sprint 198) ──────────────────────────────

export async function handleHealth(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) { await sendMessage(chatId, '🔒 Owner only.'); return; }

  const lines: string[] = ['🏥 *System Health Check*', ''];
  const ROOT = join(process.cwd());

  // 1. Environment variables
  const envChecks: Array<[string, string]> = [
    ['TIKTOK_ACCESS_TOKEN', '🎬 TikTok Live Posting'],
    ['STRIPE_SECRET_KEY', '💳 Stripe Payments'],
    ['ANTHROPIC_API_KEY', '🧠 Claude API'],
    ['SUPABASE_URL', '🗄️ Supabase'],
    ['TELEGRAM_BOT_TOKEN', '📱 Telegram Bot'],
    ['ACHIRI_BASE_URL', '🤖 Achiri Remote'],
  ];
  lines.push('*Environment*');
  for (const [key, label] of envChecks) {
    const val = process.env[key];
    const ok = val && val.length > 5;
    lines.push(`${ok ? '✅' : '❌'} ${label} (\`${key}\`)`);
  }

  // 2. Gate progress
  lines.push('', '*Phase 1.5 Gate (Apr 7)*');
  try {
    // Sprint 228: Fix path — manual-posts.jsonl is in workspace/scs001/, not data/
    const postsPath = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
    let postCount = 0;
    let totalViews = 0;
    if (existsSync(postsPath)) {
      const postLines = readFileSync(postsPath, 'utf-8').trim().split('\n').filter(Boolean);
      postCount = postLines.length;
      for (const l of postLines) {
        try { totalViews += JSON.parse(l).views || 0; } catch { /* skip */ }
      }
    }
    const daysLeft = Math.ceil((new Date('2026-04-07').getTime() - Date.now()) / 86400000);
    const postsNeeded = 30 - postCount;
    const pace = daysLeft > 0 ? Math.ceil(postsNeeded / daysLeft) : 0;
    lines.push(`📊 Posts: ${postCount}/30 | Views: ${totalViews}/500`);
    lines.push(`📅 ${daysLeft} days left | Need ${pace}/day`);
    if (postCount === 0) lines.push('⚠️ *No posts recorded — start posting NOW*');
  } catch { lines.push('❌ Could not read gate data'); }

  // 3. PM2 processes
  lines.push('', '*PM2 Processes*');
  try {
    const pm2Out = execSync('pm2 jlist 2>/dev/null', { timeout: 5000 }).toString();
    const procs = JSON.parse(pm2Out);
    const kognaiNames = ['kognai', 'telegram-bot', 'achiri-api', 'scs001', 'clawrouter', 'vault-dashboard'];
    const kognaiProcs = procs.filter((p: any) => kognaiNames.some(prefix => p.name.startsWith(prefix)));
    if (kognaiProcs.length === 0) {
      lines.push('⚠️ No kognai PM2 processes running');
    } else {
      for (const p of kognaiProcs.slice(0, 8)) {
        const status = p.pm2_env?.status;
        const emoji = status === 'online' ? '🟢' : status === 'stopped' ? '🟡' : '🔴';
        lines.push(`${emoji} ${p.name} (${status})`);
      }
      if (kognaiProcs.length > 8) lines.push(`... +${kognaiProcs.length - 8} more`);
    }
  } catch { lines.push('⚠️ PM2 not available or no processes'); }

  // 4. Achiri health
  lines.push('', '*Achiri*');
  try {
    const achiriUrl = process.env.ACHIRI_BASE_URL || 'http://localhost:3420';
    const resp = execSync(`curl -s --max-time 3 ${achiriUrl}/health`, { timeout: 5000 }).toString();
    lines.push(`✅ Achiri UP at ${achiriUrl}`);
  } catch { lines.push('❌ Achiri DOWN or unreachable'); }

  // 5. Pipeline queue
  lines.push('', '*Pipeline*');
  try {
    // Sprint 228: Fix path — files are in workspace/scs001/, not data/
    const ledgerPath = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
    const postsPathPipeline = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
    let ledgerCount = 0;
    let postedIds = new Set<string>();
    if (existsSync(ledgerPath)) {
      ledgerCount = readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean).length;
    }
    if (existsSync(postsPathPipeline)) {
      const pLines = readFileSync(postsPathPipeline, 'utf-8').trim().split('\n').filter(Boolean);
      for (const l of pLines) { try { postedIds.add(JSON.parse(l).video_id); } catch { /* */ } }
    }
    lines.push(`📦 ${ledgerCount} videos in ledger | ${postedIds.size} posted | ${ledgerCount - postedIds.size} unposted`);
  } catch { lines.push('❌ Could not read pipeline data'); }

  // 6. Last sprint from git
  lines.push('', '*Development*');
  try {
    const gitLog = execSync('git log --oneline -1', { timeout: 5000 }).toString().trim();
    lines.push(`🔨 Last commit: \`${gitLog}\``);
  } catch { lines.push('❌ Could not read git log'); }

  // Summary
  const envOk = envChecks.filter(([k]) => { const v = process.env[k]; return v && v.length > 5; }).length;
  lines.push('', `*Summary: ${envOk}/${envChecks.length} env vars set*`);

  await sendMessage(chatId, lines.join('\n'));
}

// ── /preflight — Production Preflight Checklist (Sprint 200) ─────────────

export async function handlePreflight(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) { await sendMessage(chatId, '🔒 Owner only.'); return; }

  await sendMessage(chatId, '🚀 Running production preflight...');

  try {
    const output = execSync('npx ts-node scripts/production-preflight.ts --json 2>/dev/null', {
      timeout: 30000,
      cwd: process.cwd(),
    }).toString();

    const result = JSON.parse(output);
    const { checks: chks, summary } = result;

    const lines: string[] = [
      `🚀 *Production Preflight* — ${summary.passed}/${summary.total} passed`,
      '',
    ];

    // Group by category
    const categories = new Map<string, typeof chks>();
    for (const c of chks) {
      if (!categories.has(c.category)) categories.set(c.category, []);
      categories.get(c.category)!.push(c);
    }

    categories.forEach((items, cat) => {
      lines.push(`*${cat}*`);
      for (const item of items) {
        lines.push(`${item.pass ? '✅' : '❌'} ${item.name}`);
      }
      lines.push('');
    });

    if (summary.actions.length > 0) {
      lines.push(`🔧 *Action items (${summary.actions.length}):*`);
      for (const a of summary.actions.slice(0, 8)) {
        lines.push(`• ${a.name}: ${a.action}`);
      }
      if (summary.actions.length > 8) lines.push(`... +${summary.actions.length - 8} more`);
    }

    await sendMessage(chatId, lines.join('\n'));
  } catch (e: any) {
    // Preflight script exits 1 on failures — parse its JSON output from stderr
    try {
      const output = execSync('npx ts-node scripts/production-preflight.ts --json 2>&1 || true', {
        timeout: 30000,
        cwd: process.cwd(),
      }).toString();
      const result = JSON.parse(output);
      const { summary } = result;

      const failed = result.checks.filter((c: any) => !c.pass);
      const lines = [
        `🚀 *Preflight* — ${summary.passed}/${summary.total} passed`,
        '',
        '*Failed checks:*',
        ...failed.map((c: any) => `❌ ${c.name}: ${c.detail}`),
        '',
        `🔧 *${summary.actions.length} action items* — run full check: \`npx ts-node scripts/production-preflight.ts\``,
      ];
      await sendMessage(chatId, lines.join('\n'));
    } catch {
      await sendMessage(chatId, '❌ Preflight check failed to run. Try CLI: `npx ts-node scripts/production-preflight.ts`');
    }
  }
}

// ── TikTok OAuth — Sprint 232 ────────────────────────────────────────────────
// Owner-only: generates TikTok OAuth URL and checks token status.
export async function handleTiktokAuth(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const clientKey    = process.env.TIKTOK_CLIENT_KEY    || '';
  const accessToken  = process.env.TIKTOK_ACCESS_TOKEN  || '';
  const port         = process.env.TIKTOK_OAUTH_PORT    || '3456';
  const redirectUri  = process.env.TIKTOK_REDIRECT_URI  || `http://localhost:${port}/callback`;

  // Check existing token status
  const metaPath = join(process.cwd(), 'data', 'tiktok-token-meta.json');
  let tokenStatus = '❌ No token';
  if (accessToken) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      const expiresAt = new Date(meta.expires_at);
      const now = new Date();
      if (expiresAt > now) {
        const hoursLeft = Math.round((expiresAt.getTime() - now.getTime()) / 3600000);
        tokenStatus = `✅ Active (expires in ${hoursLeft}h)`;
      } else {
        tokenStatus = '⚠️ Expired — needs refresh';
      }
    } catch {
      tokenStatus = '✅ Set (no metadata — check manually)';
    }
  }

  if (!clientKey) {
    await sendMessage(chatId, '❌ TIKTOK\\_CLIENT\\_KEY not set in .env. Cannot start OAuth.');
    return;
  }

  const scopes = 'user.info.basic,video.publish';
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: scopes,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: 'kognai-' + Date.now(),
  });
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  const lines = [
    '🔑 *TikTok OAuth 2.0*',
    '',
    `*Token status:* ${tokenStatus}`,
    '',
    '*To get/refresh token:*',
    '1️⃣ On Mac Mini, run:',
    '`npx ts-node scripts/tiktok-oauth.ts`',
    '',
    '2️⃣ Open the auth URL in browser',
    '3️⃣ Authorize the app',
    '4️⃣ Token auto-saved to .env',
    '',
    `*Auth URL (if server running):*`,
    authUrl,
    '',
    '*Refresh existing token:*',
    '`npx ts-node scripts/tiktok-refresh-token.ts`',
    '',
    `Scopes: \`${scopes}\``,
    `Redirect: \`${redirectUri}\``,
  ];

  await sendMessage(chatId, lines.join('\n'));
}

// ── Auto-Post status — Sprint 233 ────────────────────────────────────────────
// Owner-only: shows auto-post daemon status and allows triggering manual run.
export async function handleAutoPost(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const arg = text.split(/\s+/)[1]?.toLowerCase();

  // /autopost run — trigger immediate run
  if (arg === 'run') {
    await sendMessage(chatId, '🚀 Triggering auto-post run...');
    try {
      const output = execSync('npx ts-node scripts/scs001/auto-post.ts 2>&1', {
        timeout: 60000,
        cwd: process.cwd(),
        env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
      }).toString();
      const lastLines = output.split('\n').filter(l => l.trim()).slice(-5).join('\n');
      await sendMessage(chatId, `✅ *Auto-post complete*\n\`\`\`\n${lastLines}\n\`\`\``);
    } catch (err: any) {
      const out = err.stdout?.toString() || err.message;
      await sendMessage(chatId, `❌ Auto-post failed:\n\`\`\`\n${out.slice(-300)}\n\`\`\``);
    }
    return;
  }

  // /autopost dry — trigger dry run
  if (arg === 'dry') {
    await sendMessage(chatId, '🧪 Triggering auto-post dry run...');
    try {
      const output = execSync('AUTO_POST_DRY_RUN=1 npx ts-node scripts/scs001/auto-post.ts 2>&1', {
        timeout: 60000,
        cwd: process.cwd(),
        env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true', AUTO_POST_DRY_RUN: '1' },
      }).toString();
      const lastLines = output.split('\n').filter(l => l.trim()).slice(-5).join('\n');
      await sendMessage(chatId, `🧪 *Dry run complete*\n\`\`\`\n${lastLines}\n\`\`\``);
    } catch (err: any) {
      const out = err.stdout?.toString() || err.message;
      await sendMessage(chatId, `❌ Dry run failed:\n\`\`\`\n${out.slice(-300)}\n\`\`\``);
    }
    return;
  }

  // Default: show status
  const tokenSet = Boolean(process.env.TIKTOK_ACCESS_TOKEN);
  const logPath = join(process.cwd(), 'logs', 'auto-post.jsonl');
  let lastPost = 'Never';
  let totalAutoPosted = 0;
  if (existsSync(logPath)) {
    try {
      const lines = readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
      const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const posts = events.filter((e: any) => e.event === 'posted' || e.event === 'dry_run');
      totalAutoPosted = posts.length;
      if (posts.length > 0) {
        lastPost = posts[posts.length - 1].timestamp;
      }
    } catch {}
  }

  // Count queue
  const manualPath = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');
  const ledgerPath = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
  let queueCount = 0;
  const recordedIds = new Set<string>();
  if (existsSync(manualPath)) {
    try {
      readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { recordedIds.add(JSON.parse(l).video_id); } catch {} });
    } catch {}
  }
  if (existsSync(ledgerPath)) {
    try {
      readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { if (!recordedIds.has(JSON.parse(l).video_id)) queueCount++; } catch {} });
    } catch {}
  }

  const msg = [
    '🤖 *Auto-Post Daemon* (Sprint 233)',
    '',
    `🔑 Token: ${tokenSet ? '✅ Set' : '❌ Missing — run /tiktokauth'}`,
    `📊 Auto-posted: *${totalAutoPosted}*`,
    `📼 Queue: *${queueCount}* videos`,
    `🕐 Last post: ${lastPost}`,
    `⏰ Schedule: 08:00 + 19:00 daily (PM2)`,
    '',
    '*Commands:*',
    '/autopost run — Post now (live)',
    '/autopost dry — Test run (no actual post)',
    '/autopost — This status',
  ];

  await sendMessage(chatId, msg.join('\n'));
}

// ── /verifyposts — Post-publish verification status — Sprint 234 ─────────────
export async function handleVerifyPosts(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const arg = text.split(/\s+/)[1]?.toLowerCase();

  // /verifyposts run — trigger verification now
  if (arg === 'run') {
    await sendMessage(chatId, '🔍 Running post verification...');
    try {
      const output = execSync('npx ts-node scripts/scs001/verify-posts.ts 2>&1', {
        timeout: 60000,
        cwd: process.cwd(),
        env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
      }).toString();
      const lastLines = output.split('\n').filter(l => l.trim()).slice(-5).join('\n');
      await sendMessage(chatId, `✅ *Verification complete*\n\`\`\`\n${lastLines}\n\`\`\``);
    } catch (err: any) {
      const out = err.stdout?.toString() || err.message;
      await sendMessage(chatId, `❌ Verification failed:\n\`\`\`\n${out.slice(-300)}\n\`\`\``);
    }
    return;
  }

  // Default: show verification status
  const verifyLogPath = join(process.cwd(), 'logs', 'verify-posts.jsonl');
  const autoPostLogPath = join(process.cwd(), 'logs', 'auto-post.jsonl');

  let totalPosted = 0, published = 0, failed = 0, processing = 0, unverified = 0;

  // Count auto-posted
  if (existsSync(autoPostLogPath)) {
    try {
      readFileSync(autoPostLogPath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
        try { if (JSON.parse(l).event === 'posted') totalPosted++; } catch {}
      });
    } catch {}
  }

  // Count verification results
  const verifyMap = new Map<string, string>();
  if (existsSync(verifyLogPath)) {
    try {
      readFileSync(verifyLogPath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
        try {
          const e = JSON.parse(l);
          if (e.event === 'verified') verifyMap.set(e.publish_id, e.status);
        } catch {}
      });
    } catch {}
  }

  verifyMap.forEach((status) => {
    if (status === 'published') published++;
    else if (status === 'failed') failed++;
    else processing++;
  });
  unverified = totalPosted - verifyMap.size;

  const lines = [
    '🔍 *Post Verification Status*',
    '',
    `📊 Total auto-posted: *${totalPosted}*`,
    `✅ Verified live: *${published}*`,
    `❌ Failed: *${failed}*`,
    `⏳ Processing: *${processing}*`,
    `❓ Unverified: *${unverified}*`,
    '',
    `⏰ Auto-check: 09:00 + 20:00 daily (PM2)`,
    '',
    '*Commands:*',
    '/verifyposts run — Check now',
    '/verifyposts — This status',
  ];

  await sendMessage(chatId, lines.join('\n'));
}

// ── /activate — Operator Activation Checklist — Sprint 235 ───────────────────
// Checks all prerequisites for Phase 1.5 go-live and provides step-by-step guide.
export async function handleActivate(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const lines: string[] = ['🚀 *Phase 1.5 Activation Checklist*', ''];

  // Gate countdown
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));
  const manual = loadManualPosts();
  const postsNeeded = Math.max(0, 30 - manual.count);
  const pacePerDay = daysLeft > 0 ? (postsNeeded / daysLeft).toFixed(1) : '∞';
  lines.push(`📅 *Apr 7 Gate:* ${daysLeft} days | ${manual.count}/30 posts | Need ${pacePerDay}/day`);
  lines.push('');

  // Check items
  interface CheckItem {
    name: string;
    pass: boolean;
    action?: string;
  }

  const checks: CheckItem[] = [];

  // 1. TikTok Access Token
  const tokenSet = Boolean(process.env.TIKTOK_ACCESS_TOKEN);
  const tokenMeta = join(process.cwd(), 'data', 'tiktok-token-meta.json');
  let tokenExpired = false;
  if (tokenSet && existsSync(tokenMeta)) {
    try {
      const meta = JSON.parse(readFileSync(tokenMeta, 'utf-8'));
      tokenExpired = new Date(meta.expires_at) < new Date();
    } catch {}
  }
  checks.push({
    name: 'TikTok Access Token',
    pass: tokenSet && !tokenExpired,
    action: tokenSet && tokenExpired
      ? 'Token expired. Run: `npx ts-node scripts/tiktok-refresh-token.ts`'
      : !tokenSet
      ? 'Run OAuth flow:\n`npx ts-node scripts/tiktok-oauth.ts`\nThen authorize in browser.'
      : undefined,
  });

  // 2. Video queue
  const ledgerPath = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
  const recordedIds = new Set<string>();
  if (existsSync(join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl'))) {
    try {
      readFileSync(join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl'), 'utf-8')
        .split('\n').filter(l => l.trim())
        .forEach(l => { try { recordedIds.add(JSON.parse(l).video_id); } catch {} });
    } catch {}
  }
  let queueCount = 0;
  if (existsSync(ledgerPath)) {
    try {
      readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim())
        .forEach(l => { try { if (!recordedIds.has(JSON.parse(l).video_id)) queueCount++; } catch {} });
    } catch {}
  }
  checks.push({
    name: `Video Queue (${queueCount} ready)`,
    pass: queueCount >= postsNeeded,
    action: queueCount < postsNeeded
      ? `Need ${postsNeeded - queueCount} more videos. Run pipeline: \`pm2 start ecosystem.config.js --only scs001-pipeline\``
      : undefined,
  });

  // 3. Supabase (for video hosting)
  const supabaseOk = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  checks.push({
    name: 'Supabase (video hosting)',
    pass: supabaseOk,
    action: !supabaseOk ? 'Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env' : undefined,
  });

  // 4. PM2 auto-post cron
  let autoPostRunning = false;
  try {
    const pm2Out = execSync('pm2 jlist 2>/dev/null', { timeout: 5000 }).toString();
    const procs = JSON.parse(pm2Out);
    autoPostRunning = procs.some((p: any) => p.name === 'kognai-auto-post');
  } catch {}
  checks.push({
    name: 'Auto-Post PM2 Cron',
    pass: autoPostRunning,
    action: !autoPostRunning
      ? 'Start: `pm2 start ecosystem.config.js --only kognai-auto-post`'
      : undefined,
  });

  // 5. Token refresh cron
  let refreshRunning = false;
  try {
    const pm2Out = execSync('pm2 jlist 2>/dev/null', { timeout: 5000 }).toString();
    const procs = JSON.parse(pm2Out);
    refreshRunning = procs.some((p: any) => p.name === 'kognai-token-refresh');
  } catch {}
  checks.push({
    name: 'Token Refresh PM2 Cron',
    pass: refreshRunning,
    action: !refreshRunning
      ? 'Start: `pm2 start ecosystem.config.js --only kognai-token-refresh`'
      : undefined,
  });

  // 6. Verify posts cron
  let verifyRunning = false;
  try {
    const pm2Out = execSync('pm2 jlist 2>/dev/null', { timeout: 5000 }).toString();
    const procs = JSON.parse(pm2Out);
    verifyRunning = procs.some((p: any) => p.name === 'kognai-verify-posts');
  } catch {}
  checks.push({
    name: 'Post Verification PM2 Cron',
    pass: verifyRunning,
    action: !verifyRunning
      ? 'Start: `pm2 start ecosystem.config.js --only kognai-verify-posts`'
      : undefined,
  });

  // Render checks
  const passCount = checks.filter(c => c.pass).length;
  const allPass = passCount === checks.length;

  lines.push(`*Checklist: ${passCount}/${checks.length}*`);
  lines.push('');

  let stepNum = 1;
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌';
    lines.push(`${icon} ${check.name}`);
    if (!check.pass && check.action) {
      lines.push(`   *Step ${stepNum}:* ${check.action}`);
      stepNum++;
    }
  }

  lines.push('');
  if (allPass) {
    lines.push('🎉 *ALL CHECKS PASS — Auto-posting is LIVE!*');
    lines.push(`📊 Posting ${queueCount} videos at 2/day (08:00 + 19:00)`);
    lines.push(`📅 Gate target: 30 posts by Apr 7`);
  } else {
    lines.push(`⚠️ *${checks.length - passCount} step(s) needed before go-live*`);
    lines.push('Complete the steps above, then run `/activate` again.');
  }

  // Quick start for complete beginners
  if (!tokenSet) {
    lines.push('');
    lines.push('*Quick Start (2 min):*');
    lines.push('```');
    lines.push('# 1. Get TikTok token');
    lines.push('npx ts-node scripts/tiktok-oauth.ts');
    lines.push('# 2. Open URL in browser, authorize');
    lines.push('# 3. Start auto-posting');
    lines.push('pm2 start ecosystem.config.js --only kognai-auto-post');
    lines.push('pm2 start ecosystem.config.js --only kognai-token-refresh');
    lines.push('pm2 start ecosystem.config.js --only kognai-verify-posts');
    lines.push('# 4. Done! Check /gate for progress');
    lines.push('```');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── /achiristats — Achiri Usage Analytics — Sprint 236 ───────────────────────
// Owner-only: shows Achiri conversation metrics, daily active users, memory stats.
export async function handleAchiriStats(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const lines: string[] = ['📊 *Achiri Usage Analytics*', ''];

  // 1. API stats (live from Achiri server)
  const achiriUrl = (process.env.ACHIRI_BASE_URL ?? 'http://localhost:3420').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(achiriUrl + '/stats', { signal: controller.signal });
    clearTimeout(t);
    if (res.ok) {
      const stats = await res.json() as { users: number; total_turns: number; uptime_s: number };
      const uptimeH = Math.round(stats.uptime_s / 3600);
      lines.push('*Server Stats (live)*');
      lines.push(`👥 Total users: *${stats.users}*`);
      lines.push(`💬 Total turns: *${stats.total_turns}*`);
      lines.push(`⏱️ Uptime: *${uptimeH}h*`);
    } else {
      lines.push('⚠️ Achiri API returned ' + res.status);
    }
  } catch {
    lines.push('❌ Achiri API unreachable');
  }

  // 2. Daily counts from workspace/achiri/daily-counts.json
  const countsPath = join(process.cwd(), 'workspace', 'achiri', 'daily-counts.json');
  if (existsSync(countsPath)) {
    try {
      const counts = JSON.parse(readFileSync(countsPath, 'utf-8')) as Record<string, Record<string, number>>;
      const days = Object.keys(counts).sort().reverse();
      const today = new Date().toISOString().slice(0, 10);

      lines.push('');
      lines.push('*Daily Activity (last 7 days)*');

      const recent = days.slice(0, 7);
      for (const day of recent) {
        const users = Object.keys(counts[day]);
        const msgs = Object.values(counts[day]).reduce((a, b) => a + b, 0);
        const isToday = day === today;
        lines.push(`${isToday ? '📅' : '  '} ${day}: *${msgs}* msgs from *${users.length}* user(s)`);
      }

      // Aggregate stats
      const allDays = Object.keys(counts);
      const totalMsgs = allDays.reduce((sum, d) =>
        sum + Object.values(counts[d]).reduce((a, b) => a + b, 0), 0);
      const uniqueUsers = new Set<string>();
      allDays.forEach(d => Object.keys(counts[d]).forEach(u => uniqueUsers.add(u)));
      const avgMsgsPerDay = allDays.length > 0 ? Math.round(totalMsgs / allDays.length) : 0;

      lines.push('');
      lines.push('*All-Time*');
      lines.push(`📊 Total messages: *${totalMsgs}*`);
      lines.push(`👥 Unique users: *${uniqueUsers.size}*`);
      lines.push(`📈 Avg msgs/day: *${avgMsgsPerDay}*`);
      lines.push(`📅 Active days: *${allDays.length}*`);
    } catch {
      lines.push('⚠️ Could not parse daily-counts.json');
    }
  } else {
    lines.push('');
    lines.push('📊 No daily counts data yet');
  }

  // 3. Memory files
  const memDir = join(process.cwd(), 'workspace', 'achiri', 'memory');
  if (existsSync(memDir)) {
    try {
      const memFiles = readdirSync(memDir).filter(f => f.endsWith('.jsonl'));
      let totalTurns = 0;
      let maxTurns = 0;
      let maxTurnsUser = '';
      for (const f of memFiles) {
        const turnCount = readFileSync(join(memDir, f), 'utf-8').split('\n').filter(l => l.trim()).length;
        totalTurns += turnCount;
        if (turnCount > maxTurns) {
          maxTurns = turnCount;
          maxTurnsUser = f.replace('.jsonl', '');
        }
      }
      lines.push('');
      lines.push('*Memory*');
      lines.push(`🧠 Users with memory: *${memFiles.length}*`);
      lines.push(`💬 Total stored turns: *${totalTurns}*`);
      if (maxTurnsUser) {
        lines.push(`🏆 Most active: \`${maxTurnsUser}\` (${maxTurns} turns)`);
      }
    } catch {}
  }

  // 4. Waitlist
  const wlPath = join(process.cwd(), 'workspace', 'achiri', 'waitlist.jsonl');
  const whitelistPath = join(process.cwd(), 'workspace', 'achiri', 'alpha-whitelist.jsonl');
  let waitlistCount = 0, whitelistCount = 0;
  if (existsSync(wlPath)) {
    try { waitlistCount = readFileSync(wlPath, 'utf-8').split('\n').filter(l => l.trim()).length; } catch {}
  }
  if (existsSync(whitelistPath)) {
    try { whitelistCount = readFileSync(whitelistPath, 'utf-8').split('\n').filter(l => l.trim()).length; } catch {}
  }

  lines.push('');
  lines.push('*Alpha Status*');
  lines.push(`🙋 Waitlist: *${waitlistCount}*`);
  lines.push(`✅ Invited: *${whitelistCount}*`);

  const achiriGate = new Date('2026-04-25T00:00:00Z');
  const daysToAlpha = Math.max(0, Math.ceil((achiriGate.getTime() - Date.now()) / 86400000));
  lines.push(`📅 Alpha launch: *Apr 25* (${daysToAlpha} days)`);

  await sendMessage(chatId, lines.join('\n'));
}

// ── /lastrun — Latest pipeline run summary — Sprint 267 ──────────────────────

export async function handleLastRun(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const latestPath = join(process.cwd(), 'reports', 'pipeline-runs', 'latest.json');
  if (!existsSync(latestPath)) {
    await sendMessage(chatId, '⚠️ No pipeline run data found at reports/pipeline-runs/latest.json');
    return;
  }

  let run: any;
  try {
    run = JSON.parse(readFileSync(latestPath, 'utf-8'));
  } catch {
    await sendMessage(chatId, '⚠️ Could not parse latest.json');
    return;
  }

  const lines: string[] = [];

  // Header
  const startedAt = run.started_at ? new Date(run.started_at).toLocaleString('en-GB', { timeZone: 'UTC' }) : 'unknown';
  const totalMs = run.total_elapsed_ms ?? 0;
  const totalMin = (totalMs / 60000).toFixed(1);
  const mode = run.mode ?? 'unknown';

  lines.push(`🔄 *Latest Pipeline Run*`);
  lines.push(`ID: \`${run.run_id ?? 'unknown'}\``);
  lines.push(`Mode: ${mode} | Started: ${startedAt} UTC`);
  lines.push(`Total time: ${totalMin} min`);
  lines.push('');

  // Stage-by-stage
  const stages: any[] = run.stages ?? [];
  if (stages.length > 0) {
    lines.push('*Stages:*');
    for (const s of stages) {
      const icon = s.status === 'ok' ? '✅' : s.status === 'skipped' ? '⏭️' : '❌';
      const elapsed = s.elapsed_ms ? `${(s.elapsed_ms / 1000).toFixed(1)}s` : '';
      const count = s.count != null ? ` (${s.count})` : '';
      lines.push(`${icon} ${s.stage}${count} ${elapsed}`);
    }
  } else {
    lines.push('No stage data available.');
  }

  // Summary stats if available
  if (run.summary) {
    const sm = run.summary;
    lines.push('');
    lines.push('*Summary:*');
    if (sm.topics_found != null) lines.push(`📊 Topics: ${sm.topics_found}`);
    if (sm.clips_discovered != null) lines.push(`🎬 Clips: ${sm.clips_discovered} discovered`);
    if (sm.videos_edited != null) lines.push(`✂️ Videos edited: ${sm.videos_edited}`);
    if (sm.videos_captioned != null) lines.push(`📝 Captioned: ${sm.videos_captioned}`);
    if (sm.qc_passed != null) lines.push(`✅ QC passed: ${sm.qc_passed}`);
    if (sm.published != null) lines.push(`📤 Published: ${sm.published}`);
  }

  // Errors
  if (run.error_count && run.error_count > 0) {
    lines.push('');
    lines.push(`⚠️ *${run.error_count} errors detected*`);
  }
  if (run.viral_warning) {
    lines.push('⚠️ No viral scores computed this run');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── /metrics — Pipeline performance metrics — Sprint 268 ─────────────────────

export async function handleMetrics(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const metricsPath = join(process.cwd(), 'reports', 'pipeline-metrics.json');

  // Auto-regenerate if missing
  if (!existsSync(metricsPath)) {
    try {
      const { execSync } = require('child_process');
      execSync('npx ts-node scripts/scs001/aggregate-pipeline-metrics.ts', {
        cwd: process.cwd(), timeout: 30000, stdio: 'pipe'
      });
    } catch { /* will still try to read whatever exists */ }
  }

  if (!existsSync(metricsPath)) {
    await sendMessage(chatId, '⚠️ No pipeline metrics available. Run: `npx ts-node scripts/scs001/aggregate-pipeline-metrics.ts`');
    return;
  }

  let m: any;
  try {
    m = JSON.parse(readFileSync(metricsPath, 'utf-8'));
  } catch {
    await sendMessage(chatId, '⚠️ Could not parse pipeline-metrics.json');
    return;
  }

  const lines: string[] = [];
  lines.push('📊 *Pipeline Performance Metrics*');
  lines.push(`Period: ${m.period?.first ?? '?'} → ${m.period?.last ?? '?'}`);
  lines.push('');

  // Overview
  const avgMin = m.avg_duration_ms ? (m.avg_duration_ms / 60000).toFixed(1) : '?';
  lines.push('*Overview:*');
  lines.push(`• Runs: ${m.total_runs ?? 0} (${m.runs_per_day ?? 0}/day)`);
  lines.push(`• Avg duration: ${avgMin} min`);
  lines.push(`• Error rate: ${m.error_runs ?? 0}/${m.total_runs ?? 0}`);
  lines.push('');

  // Cumulative
  const c = m.cumulative ?? {};
  lines.push('*Cumulative Output:*');
  lines.push(`• Topics: ${c.topics_found ?? 0}`);
  lines.push(`• Clips: ${c.clips_discovered ?? 0}`);
  lines.push(`• Edited: ${c.videos_edited ?? 0}`);
  lines.push(`• Captioned: ${c.videos_captioned ?? 0}`);
  lines.push(`• QC passed: ${c.qc_passed ?? 0} (${c.qc_pass_rate_pct ?? 0}%)`);
  lines.push(`• Published: ${c.published ?? 0}`);
  lines.push('');

  // Top 3 slowest stages
  const stageAvgs = m.stage_averages ?? {};
  const sorted = Object.entries(stageAvgs)
    .map(([stage, data]: [string, any]) => ({ stage, avgMs: data.avg_ms }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 3);

  if (sorted.length > 0) {
    lines.push('*Slowest Stages:*');
    for (const s of sorted) {
      const sec = (s.avgMs / 1000).toFixed(1);
      lines.push(`• ${s.stage}: ${sec}s avg`);
    }
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── /revenue — Revenue dashboard — Sprint 269 ───────────────────────────────

export async function handleRevenue(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  // Read TelegramDB for subscriber counts
  const dbPath = join(process.cwd(), 'data', 'telegram-db.json');
  let totalUsers = 0;
  let paidUsers = 0;
  let mrr = 0;
  const planCounts: Record<string, number> = { growth: 0, premium: 0, free: 0 };
  const PRICES: Record<string, number> = { growth: 19, premium: 49 };

  if (existsSync(dbPath)) {
    try {
      const db = JSON.parse(readFileSync(dbPath, 'utf-8'));
      for (const [_, entry] of Object.entries(db) as [string, any][]) {
        totalUsers++;
        const tier = entry.tier ?? 'free';
        planCounts[tier] = (planCounts[tier] ?? 0) + 1;
        if (tier !== 'free' && entry.active !== false) {
          paidUsers++;
          mrr += PRICES[tier] ?? 0;
        }
      }
    } catch { /* skip */ }
  }

  // Also check revenue-summary.json if it exists
  const summaryPath = join(process.cwd(), 'reports', 'revenue-summary.json');
  let summaryData: any = null;
  if (existsSync(summaryPath)) {
    try { summaryData = JSON.parse(readFileSync(summaryPath, 'utf-8')); } catch {}
  }

  const arr = mrr * 12;
  const freeUsers = totalUsers - paidUsers;

  const lines: string[] = [];
  lines.push('💰 *Revenue Dashboard*');
  lines.push('');
  lines.push('*Subscribers:*');
  lines.push(`• Total users: ${totalUsers}`);
  lines.push(`• Free: ${freeUsers} | Growth: ${planCounts.growth} | Premium: ${planCounts.premium}`);
  lines.push(`• Active paid: ${paidUsers}`);
  lines.push('');
  lines.push('*Revenue:*');
  lines.push(`• MRR: *$${mrr}*`);
  lines.push(`• ARR: $${arr}`);
  lines.push('');

  // Financial gates
  const gates = [
    { name: 'Phase 1.5 — TikTok live', target: 0, label: 'posts+views' },
    { name: 'Phase 2A — Achiri alpha', target: 0, label: 'waitlist' },
    { name: 'Phase 2B — 10 subs', target: 190, label: '$190 MRR' },
    { name: 'Phase 3 — Autonomy', target: 500, label: '$500 MRR' },
    { name: 'Phase 4 — x402', target: 1000, label: '$1000 MRR' },
  ];

  lines.push('*Financial Gates:*');
  for (const g of gates) {
    const met = mrr >= g.target;
    const icon = met ? '✅' : '⏳';
    const pct = g.target > 0 ? Math.round((mrr / g.target) * 100) : 100;
    lines.push(`${icon} ${g.name} — ${g.label} (${Math.min(pct, 100)}%)`);
  }

  // Stripe status
  lines.push('');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  lines.push(stripeKey ? '💳 Stripe: 🟢 CONFIGURED' : '💳 Stripe: 🔴 NOT CONFIGURED');

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 271: /dedup — Deduplicate publish-ledger.jsonl ─────────────────────

export async function handleDedup(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const arg = text.split(/\s+/)[1]?.toLowerCase();
  const cwd = process.cwd();
  const ledgerPath = join(cwd, 'workspace', 'scs001', 'publish-ledger.jsonl');

  if (!existsSync(ledgerPath)) {
    await sendMessage(chatId, '❌ No publish-ledger.jsonl found.');
    return;
  }

  // Read and count
  const rawLines = readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
  const entries: Array<{ video_id?: string; published_at?: string; [k: string]: unknown }> = [];
  for (const line of rawLines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }

  const uniqueMap = new Map<string, typeof entries[0]>();
  for (const entry of entries) {
    const id = entry.video_id || '';
    if (!id) continue;
    const existing = uniqueMap.get(id);
    if (!existing || (entry.published_at || '') >= (existing.published_at || '')) {
      uniqueMap.set(id, entry);
    }
  }

  const uniqueCount = uniqueMap.size;
  const dupeCount = entries.length - uniqueCount;

  if (dupeCount === 0) {
    await sendMessage(chatId, `✅ Ledger clean — ${entries.length} entries, 0 duplicates.`);
    return;
  }

  if (arg !== 'confirm') {
    await sendMessage(chatId, [
      '🔍 *Ledger Dedup*',
      '',
      `📊 Total entries: ${entries.length}`,
      `✅ Unique: ${uniqueCount}`,
      `🗑️ Duplicates: ${dupeCount}`,
      '',
      'To clean: `/dedup confirm`',
    ].join('\n'));
    return;
  }

  // Perform dedup
  const backupPath = ledgerPath + '.bak';
  try {
    const { copyFileSync, writeFileSync } = require('fs');
    copyFileSync(ledgerPath, backupPath);
    const deduped = Array.from(uniqueMap.values());
    writeFileSync(ledgerPath, deduped.map(e => JSON.stringify(e)).join('\n') + '\n');

    await sendMessage(chatId, [
      '✅ *Dedup Complete*',
      '',
      `Before: ${entries.length} entries`,
      `After: ${deduped.length} entries`,
      `Removed: ${dupeCount} duplicates`,
      `Backup: publish-ledger.jsonl.bak`,
    ].join('\n'));
  } catch (err) {
    await sendMessage(chatId, `❌ Dedup failed: ${(err as Error).message?.slice(0, 100)}`);
  }
}

// ── /runpipeline — Trigger pipeline run on demand — Sprint 290 ───────────────

let pipelineRunning = false;

export async function handleRunPipeline(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  if (pipelineRunning) {
    await sendMessage(chatId, '⏳ Pipeline already running. Wait for it to finish or check `/lastrun`.');
    return;
  }

  const mode = text.includes('mock') ? 'mock' : 'live';
  await sendMessage(chatId, `🚀 *Starting pipeline run (${mode} mode)...*\n\nThis may take 5-30 minutes. I'll notify you when done.`);

  pipelineRunning = true;
  const { spawn } = require('child_process');
  const startTime = Date.now();

  const child = spawn('node', [
    '-r', 'ts-node/register',
    'agents/scs001-orchestrator/run-pipeline.ts',
    mode,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TS_NODE_TRANSPILE_ONLY: 'true',
      TS_NODE_PROJECT: join(process.cwd(), 'tsconfig.scripts.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

  child.on('close', async (code: number | null) => {
    pipelineRunning = false;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    if (code === 0) {
      // Read latest.json for summary
      const latestPath = join(process.cwd(), 'reports', 'pipeline-runs', 'latest.json');
      let summary = '';
      try {
        const run = JSON.parse(readFileSync(latestPath, 'utf-8'));
        const s = run.summary ?? {};
        summary = [
          `Topics: ${s.topics_found ?? 0}`,
          `Clips: ${s.clips_discovered ?? 0}`,
          `Scripts: ${s.scripts_produced ?? 0}`,
          `Videos: ${s.videos_edited ?? 0}`,
          `Captioned: ${s.videos_captioned ?? 0}`,
          `Published: ${s.published ?? 0}`,
        ].join(' · ');
      } catch {}

      await sendMessage(chatId,
        `✅ *Pipeline complete!* (${elapsed}s, ${mode})\n\n${summary}\n\nUse \`/lastrun\` for details or \`/pipeline\` for inventory.`
      );
    } else {
      const errSnippet = stderr.slice(-300) || stdout.slice(-300) || 'No output captured';
      await sendMessage(chatId,
        `❌ *Pipeline failed* (exit ${code}, ${elapsed}s)\n\n\`\`\`\n${errSnippet.slice(0, 200)}\n\`\`\``
      );
    }
  });

  // Safety timeout: 40 minutes
  setTimeout(() => {
    if (pipelineRunning) {
      try { child.kill('SIGTERM'); } catch {}
      pipelineRunning = false;
      sendMessage(chatId, '⚠️ Pipeline timed out after 40 minutes. Killed.').catch(() => {});
    }
  }, 40 * 60 * 1000);
}

// ── /pipeline — Content pipeline inventory & health — Sprint 289 ─────────────

export async function handlePipeline(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const lines: string[] = ['📊 *Content Pipeline Status*', ''];

  // 1. Last pipeline run
  const latestRunPath = join(process.cwd(), 'reports', 'pipeline-runs', 'latest.json');
  let lastRun: any = null;
  if (existsSync(latestRunPath)) {
    try { lastRun = JSON.parse(readFileSync(latestRunPath, 'utf-8')); } catch {}
  }

  if (lastRun) {
    const completedAt = lastRun.completed_at ? new Date(lastRun.completed_at) : null;
    const ageMs = completedAt ? Date.now() - completedAt.getTime() : Infinity;
    const ageHrs = Math.round(ageMs / 3_600_000);
    const health = ageHrs < 6 ? '🟢 FRESH' : ageHrs < 24 ? '🟡 STALE' : '🔴 OLD';
    const elapsed = lastRun.total_elapsed_ms ? `${Math.round(lastRun.total_elapsed_ms / 1000)}s` : '?';
    lines.push(`*Last Run:* \`${lastRun.run_id ?? 'unknown'}\``);
    lines.push(`⏱ ${elapsed} · ${health} (${ageHrs}h ago)`);
    lines.push('');

    // Stage summary from latest run
    const s = lastRun.summary ?? {};
    lines.push('*Latest Run Output:*');
    lines.push(`  🔍 Topics: ${s.topics_found ?? 0}`);
    lines.push(`  📹 Clips discovered: ${s.clips_discovered ?? 0}`);
    lines.push(`  ✂️ Clips qualified: ${s.clips_qualified ?? 0}`);
    lines.push(`  📝 Scripts: ${s.scripts_produced ?? 0}`);
    lines.push(`  🎬 Videos edited: ${s.videos_edited ?? 0}`);
    lines.push(`  💬 Videos captioned: ${s.videos_captioned ?? 0}`);
    lines.push(`  ✅ QC passed: ${s.qc_passed ?? 0}`);
    lines.push(`  📦 Published: ${s.published ?? 0}`);
    lines.push('');
  } else {
    lines.push('⚠️ No pipeline run report found.', '');
  }

  // 2. Total inventory
  const ledgerPath = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');
  const postsPath = join(process.cwd(), 'workspace', 'scs001', 'manual-posts.jsonl');
  const expPath = join(process.cwd(), 'workspace', 'scs001', 'experiments.jsonl');
  const scsDir = join(process.cwd(), 'workspace', 'scs001');

  let ledgerCount = 0;
  let postedCount = 0;
  let scoredCount = 0;
  let runCount = 0;

  if (existsSync(ledgerPath)) {
    try { ledgerCount = readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim()).length; } catch {}
  }
  if (existsSync(postsPath)) {
    try { postedCount = readFileSync(postsPath, 'utf-8').split('\n').filter(l => l.trim()).length; } catch {}
  }
  if (existsSync(expPath)) {
    try { scoredCount = readFileSync(expPath, 'utf-8').split('\n').filter(l => l.trim()).length; } catch {}
  }
  try { runCount = readdirSync(scsDir).filter(d => d.startsWith('run-')).length; } catch {}

  // Count captioned mp4s
  let captionedCount = 0;
  try {
    const runDirs = readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const capDir = join(scsDir, dir, 'caption');
      if (existsSync(capDir)) {
        captionedCount += readdirSync(capDir).filter(f => f.endsWith('-captioned.mp4')).length;
      }
    }
  } catch {}

  const unpostedCount = Math.max(0, ledgerCount - postedCount);

  lines.push('*Total Inventory:*');
  lines.push(`  📂 Pipeline runs: ${runCount}`);
  lines.push(`  📋 Ledger entries: ${ledgerCount}`);
  lines.push(`  🧬 Scored experiments: ${scoredCount}`);
  lines.push(`  🎬 Captioned MP4s: ${captionedCount}`);
  lines.push(`  ✅ Posted: ${postedCount}`);
  lines.push(`  📦 Unposted: ${unpostedCount}`);
  lines.push('');

  // 3. Action line
  if (captionedCount > 0 && postedCount < 30) {
    const needed = 30 - postedCount;
    lines.push(`💡 *${captionedCount} videos ready!* Send \`/sendvideo\` to get your next batch.`);
    lines.push(`📊 ${needed} more posts needed for Phase 1.5 gate.`);
  } else if (captionedCount === 0) {
    lines.push('⚠️ No captioned videos ready. Pipeline needs to run.');
  } else {
    lines.push('🎉 Phase 1.5 post target reached!');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── /achiriprofile — Sprint 304: User-facing profile + summary ──────────────

export async function handleAchiriProfile(chatId: number): Promise<void> {
  const userId = String(chatId);
  const lines: string[] = ['🪪 *Your Achiri Profile*', ''];

  try {
    // Fetch profile from Achiri server
    const profileRes = await fetch(ACHIRI_BASE_URL + '/profile/' + encodeURIComponent(userId));
    const profile = await profileRes.json() as {
      preferred_language?: string;
      dialect?: string;
      formality?: string;
      dialect_confidence?: number;
      top_interests?: string[];
      message_count?: number;
    };

    if (!profile.message_count || profile.message_count === 0) {
      await sendMessage(chatId, '🪪 *Your Achiri Profile*\n\nNo conversation history yet! Start chatting with /achiri <msg> to build your profile.');
      return;
    }

    // Language
    const langEmoji: Record<string, string> = { darija: '🇹🇳', french: '🇫🇷', english: '🇬🇧', mixed: '🌍' };
    const langLabel: Record<string, string> = { darija: 'Darija (Tunisian Arabic)', french: 'French', english: 'English', mixed: 'Mixed (code-switching)' };
    lines.push(`🗣 *Language:* ${langEmoji[profile.preferred_language ?? 'mixed'] ?? '🌍'} ${langLabel[profile.preferred_language ?? 'mixed'] ?? 'Mixed'}`);

    // Dialect
    if (profile.dialect && profile.dialect !== 'unknown' && (profile.dialect_confidence ?? 0) >= 0.5) {
      const dialectLabel: Record<string, string> = {
        tunisian: '🇹🇳 Tunisian', moroccan: '🇲🇦 Moroccan', algerian: '🇩🇿 Algerian',
        libyan: '🇱🇾 Libyan', egyptian: '🇪🇬 Egyptian',
      };
      lines.push(`🎯 *Dialect:* ${dialectLabel[profile.dialect] ?? profile.dialect} (${Math.round((profile.dialect_confidence ?? 0) * 100)}% confidence)`);
    }

    // Formality
    if (profile.formality && profile.formality !== 'neutral') {
      lines.push(`📝 *Style:* ${profile.formality === 'formal' ? '👔 Formal' : '😎 Casual'}`);
    }

    // Interests
    if (profile.top_interests && profile.top_interests.length > 0) {
      lines.push(`💡 *Interests:* ${profile.top_interests.join(', ')}`);
    }

    // Message count
    lines.push(`💬 *Messages:* ${profile.message_count}`);

    // Fetch summary
    try {
      const summaryRes = await fetch(ACHIRI_BASE_URL + '/summary/' + encodeURIComponent(userId));
      const summary = await summaryRes.json() as { facts?: string[]; total_turns_summarized?: number };
      if (summary.facts && summary.facts.length > 0) {
        lines.push('');
        lines.push('🧠 *What Achiri remembers:*');
        for (const fact of summary.facts.slice(0, 5)) {
          lines.push(`  • ${fact}`);
        }
      }
    } catch { /* non-fatal */ }

    lines.push('');
    lines.push('_Profile auto-detected from your conversations. Chat more to refine it!_');
  } catch (err) {
    lines.push('⚠️ Could not reach Achiri server. Is it running?');
    console.error('[telegram-bot] /achiriprofile error:', err);
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 312: /achirifeedback — Aggregate user feedback ratings ─────────────

export async function handleAchiriFeedback(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const feedbackPath = join(process.cwd(), 'workspace', 'achiri', 'feedback.jsonl');
  if (!existsSync(feedbackPath)) {
    await sendMessage(chatId, '📊 *Achiri Feedback*\n\nNo feedback collected yet. Ratings are requested every 10 messages.');
    return;
  }

  interface FEntry { userId: string; rating: number; timestamp: string; messageCount: number }
  const entries: FEntry[] = readFileSync(feedbackPath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as FEntry[];

  if (entries.length === 0) {
    await sendMessage(chatId, '📊 *Achiri Feedback*\n\nNo feedback collected yet.');
    return;
  }

  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const users = new Set<string>();
  let sum = 0;
  for (const e of entries) {
    dist[e.rating] = (dist[e.rating] ?? 0) + 1;
    users.add(e.userId);
    sum += e.rating;
  }

  const avg = Math.round((sum / entries.length) * 10) / 10;
  const recent = entries.slice(-20);
  const recentAvg = Math.round((recent.reduce((s, e) => s + e.rating, 0) / recent.length) * 10) / 10;
  const promoters = (dist[4] ?? 0) + (dist[5] ?? 0);
  const detractors = (dist[1] ?? 0) + (dist[2] ?? 0);
  const nps = Math.round(((promoters - detractors) / entries.length) * 100);

  const bars = [5, 4, 3, 2, 1].map(n => {
    const count = dist[n] ?? 0;
    const bar = '█'.repeat(Math.min(count, 20));
    return `${n}⭐ ${bar} ${count}`;
  });

  const npsEmoji = nps >= 50 ? '🟢' : nps >= 0 ? '🟡' : '🔴';
  const avgEmoji = avg >= 4 ? '🟢' : avg >= 3 ? '🟡' : '🔴';

  const lines = [
    '📊 *Achiri User Feedback*',
    '',
    `${avgEmoji} *Average:* ${avg}/5 (${entries.length} ratings from ${users.size} users)`,
    `${npsEmoji} *NPS:* ${nps}% (promoters: ${promoters}, detractors: ${detractors})`,
    `📈 *Recent avg:* ${recentAvg}/5 (last ${recent.length})`,
    '',
    '*Distribution:*',
    '```',
    ...bars,
    '```',
  ];

  if (nps < -60) {
    lines.push('', '🔴 *KILL SWITCH WARNING* — NPS below -60%. Review conversation quality immediately.');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 313: /achiriexport [userId] — Export conversation for quality review ──

export async function handleAchiriExport(chatId: number, ownerChatId: string, text: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const parts = text.trim().split(/\s+/);
  const userId = parts[1];
  if (!userId) {
    // List all users with conversations
    const achiriDir = join(process.cwd(), 'workspace', 'achiri', 'memory');
    if (!existsSync(achiriDir)) {
      await sendMessage(chatId, '📤 *Achiri Export*\n\nNo conversation data found.');
      return;
    }
    const { readdirSync } = await import('fs');
    const files = readdirSync(achiriDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('e2e-') && !f.startsWith('smoke-'));
    const userIds = files.map(f => f.replace('.jsonl', ''));
    if (userIds.length === 0) {
      await sendMessage(chatId, '📤 *Achiri Export*\n\nNo user conversations found.');
      return;
    }
    const lines = [
      '📤 *Achiri Export*',
      '',
      `*${userIds.length} users with conversations:*`,
      ...userIds.slice(0, 20).map(id => `• \`/achiriexport ${id}\``),
    ];
    if (userIds.length > 20) lines.push(`... +${userIds.length - 20} more`);
    await sendMessage(chatId, lines.join('\n'));
    return;
  }

  // Fetch from Achiri API
  const achiriUrl = (process.env.ACHIRI_BASE_URL ?? 'http://localhost:3420').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(achiriUrl + '/export/' + encodeURIComponent(userId), { signal: controller.signal });
    clearTimeout(t);

    if (!res.ok) {
      await sendMessage(chatId, `❌ Export failed: ${res.status}`);
      return;
    }

    const data = await res.json() as {
      userId: string;
      turns: number;
      profile: { preferred_language: string; top_interests: string[]; message_count: number };
      summary_facts: string[];
      conversation: Array<{ index: number; role: string; content: string }>;
    };

    if (data.turns === 0) {
      await sendMessage(chatId, `📤 *Export: ${userId}*\n\nNo conversation history.`);
      return;
    }

    const header = [
      `📤 *Achiri Export: ${userId}*`,
      '',
      `💬 *Turns:* ${data.turns}`,
      `🌐 *Language:* ${data.profile.preferred_language || 'unknown'}`,
      `🎯 *Interests:* ${data.profile.top_interests.slice(0, 5).join(', ') || 'none'}`,
      `📝 *Messages:* ${data.profile.message_count}`,
    ];

    if (data.summary_facts.length > 0) {
      header.push('', '*Known facts:*');
      for (const f of data.summary_facts.slice(0, 5)) {
        header.push(`  • ${f}`);
      }
    }

    await sendMessage(chatId, header.join('\n'));

    // Send conversation in chunks (Telegram has 4096 char limit)
    const convo = data.conversation;
    let chunk = '';
    for (const turn of convo) {
      const icon = turn.role === 'user' ? '👤' : turn.role === 'assistant' ? '🤖' : '⚙️';
      const line = `${icon} ${turn.content.slice(0, 500)}${turn.content.length > 500 ? '...' : ''}\n\n`;
      if (chunk.length + line.length > 3800) {
        await sendMessage(chatId, chunk);
        chunk = '';
      }
      chunk += line;
    }
    if (chunk.trim()) {
      await sendMessage(chatId, chunk);
    }
  } catch (err) {
    await sendMessage(chatId, `❌ Could not reach Achiri server: ${(err as Error).message?.slice(0, 100)}`);
  }
}

// ── Sprint 314: /achirierrors — Error dashboard for alpha monitoring ───────────

export async function handleAchiriErrors(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const errorLogPath = join(process.cwd(), 'workspace', 'achiri', 'error-log.jsonl');
  if (!existsSync(errorLogPath)) {
    await sendMessage(chatId, '🔴 *Achiri Errors*\n\n✅ No errors logged. Clean slate!');
    return;
  }

  interface EEntry { timestamp: string; type: string; userId: string; message: string }
  const entries: EEntry[] = readFileSync(errorLogPath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as EEntry[];

  if (entries.length === 0) {
    await sendMessage(chatId, '🔴 *Achiri Errors*\n\n✅ No errors logged.');
    return;
  }

  const now = Date.now();
  const h24 = now - 24 * 60 * 60 * 1000;
  const h1 = now - 60 * 60 * 1000;

  const byType: Record<string, number> = {};
  let last24h = 0;
  let lastHour = 0;
  for (const e of entries) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    const ts = new Date(e.timestamp).getTime();
    if (ts >= h24) last24h++;
    if (ts >= h1) lastHour++;
  }

  const statusEmoji = lastHour >= 3 ? '🔴' : last24h >= 5 ? '🟡' : '🟢';

  const lines = [
    `${statusEmoji} *Achiri Error Dashboard*`,
    '',
    `⏱ *Last hour:* ${lastHour} errors`,
    `📅 *Last 24h:* ${last24h} errors`,
    `📊 *All time:* ${entries.length} errors`,
    '',
    '*By type:*',
    ...Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `  • ${type}: ${count}`),
    '',
    '*Recent errors:*',
  ];

  const recent = entries.slice(-5).reverse();
  for (const e of recent) {
    const time = e.timestamp.slice(11, 19);
    lines.push(`  ${time} — \`${e.type}\` ${e.message.slice(0, 60)}`);
  }

  if (lastHour >= 3) {
    lines.push('', '🔴 *HIGH ERROR RATE* — check Achiri server logs immediately');
  }

  await sendMessage(chatId, lines.join('\n'));
}

// ── Sprint 315: /achiriready — Alpha readiness dashboard ──────────────────────

export async function handleAchiriReady(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  await sendMessage(chatId, '🔄 Running Achiri readiness check...');

  try {
    const { execSync } = await import('child_process');
    const output = execSync('npx ts-node scripts/achiri/achiri-readiness.ts --json 2>/dev/null || npx ts-node scripts/achiri/achiri-readiness.ts --json 2>&1', {
      timeout: 30000,
      cwd: process.cwd(),
    }).toString();

    let report: {
      alpha_date: string;
      days_to_alpha: number;
      overall_ready: boolean;
      score: number;
      checks: Array<{ name: string; category: string; pass: boolean; detail: string; critical: boolean }>;
      summary: { passed: number; failed: number; critical_failures: number };
    };

    try {
      report = JSON.parse(output);
    } catch {
      // Try extracting JSON from mixed output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in output');
      report = JSON.parse(jsonMatch[0]);
    }

    const icon = report.overall_ready ? '✅' : '❌';
    const lines = [
      `${icon} *Achiri Alpha Readiness*`,
      '',
      `📅 Alpha: ${report.alpha_date} (${report.days_to_alpha} days)`,
      `📊 Score: *${report.score}%* | ${report.summary.passed}/${report.checks.length} checks`,
      '',
    ];

    // Group by category
    const cats = new Map<string, typeof report.checks>();
    for (const c of report.checks) {
      if (!cats.has(c.category)) cats.set(c.category, []);
      cats.get(c.category)!.push(c);
    }

    cats.forEach((items, cat) => {
      lines.push(`*${cat}*`);
      for (const item of items) {
        const ci = item.pass ? '✅' : item.critical ? '🚫' : '⚠️';
        lines.push(`${ci} ${item.name}: ${item.detail.slice(0, 80)}`);
      }
      lines.push('');
    });

    if (report.summary.critical_failures > 0) {
      lines.push(`🚫 *${report.summary.critical_failures} critical failure(s)* — must fix before alpha`);
    } else {
      lines.push('✅ *No critical failures* — ready for alpha launch');
    }

    await sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    await sendMessage(chatId, `❌ Readiness check failed: ${(err as Error).message?.slice(0, 100)}`);
  }
}

// ── Sprint 316: /achiriretention — User retention analytics ────────────────────

export async function handleAchiriRetention(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  await sendMessage(chatId, '🔄 Analyzing retention...');

  try {
    const output = execSync('npx ts-node scripts/achiri/achiri-retention.ts --json 2>/dev/null', {
      timeout: 15000,
      cwd: process.cwd(),
    }).toString();

    let report: {
      total_days: number;
      total_real_users: number;
      total_real_messages: number;
      returning_users: number;
      new_only_users: number;
      retention_rate_pct: number;
      avg_messages_per_user: number;
      avg_messages_per_day: number;
      dau_trend: Array<{ date: string; users: number; messages: number }>;
      top_users: Array<{ userId: string; total_messages: number; active_days: number; first_seen: string; last_seen: string }>;
      churned_users: Array<{ userId: string; last_seen: string; days_inactive: number }>;
    };

    try {
      report = JSON.parse(output);
    } catch {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in output');
      report = JSON.parse(jsonMatch[0]);
    }

    const lines = [
      '📊 *Achiri Retention Report*',
      '',
      `📅 Period: *${report.total_days}* day(s)`,
      `👥 Users: *${report.total_real_users}* total (*${report.returning_users}* returning, *${report.new_only_users}* new-only)`,
      `💬 Messages: *${report.total_real_messages}* total`,
      `📈 Retention: *${report.retention_rate_pct}%*`,
      `📊 Avg: *${report.avg_messages_per_user}* msgs/user, *${report.avg_messages_per_day}* msgs/day`,
    ];

    // DAU trend (last 7 days)
    if (report.dau_trend.length > 0) {
      lines.push('', '*DAU Trend (last 7 days)*');
      const recent = report.dau_trend.slice(-7);
      for (const d of recent) {
        const bar = '▓'.repeat(Math.min(d.users, 20));
        lines.push(`  ${d.date}: *${d.users}* users, *${d.messages}* msgs ${bar}`);
      }
    }

    // Top users
    if (report.top_users.length > 0) {
      lines.push('', '*Top Users*');
      for (const u of report.top_users.slice(0, 5)) {
        lines.push(`  \`${u.userId.slice(0, 15)}\`: *${u.total_messages}* msgs / *${u.active_days}* day(s)`);
      }
    }

    // Churn alerts
    if (report.churned_users.length > 0) {
      lines.push('', `⚠️ *${report.churned_users.length} churned user(s)* (3+ days inactive)`);
      for (const u of report.churned_users.slice(0, 3)) {
        lines.push(`  \`${u.userId.slice(0, 15)}\`: last seen ${u.last_seen} (${u.days_inactive}d ago)`);
      }
    } else {
      lines.push('', '✅ No churned users');
    }

    await sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    await sendMessage(chatId, `❌ Retention analysis failed: ${(err as Error).message?.slice(0, 100)}`);
  }
}

// ── Sprint 317: /achiriquality — Conversation quality from eval-harness ────────

export async function handleAchiriQuality(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  await sendMessage(chatId, '🔄 Running quality analysis...');

  try {
    const output = execSync('npx ts-node scripts/achiri/achiri-quality-monitor.ts --json 2>/dev/null', {
      timeout: 20000,
      cwd: process.cwd(),
    }).toString();

    let report: {
      total_users: number;
      total_pairs: number;
      aggregate: { avg_score: number; pass_rate_pct: number; min_score: number; max_score: number; flag_frequency: Record<string, number> };
      per_user: Array<{ userId: string; pairs: number; avg_score: number; pass_rate_pct: number; top_flags: string[] }>;
    };

    try {
      report = JSON.parse(output);
    } catch {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in output');
      report = JSON.parse(jsonMatch[0]);
    }

    const icon = report.aggregate.pass_rate_pct >= 70 ? '✅' : '⚠️';
    const lines = [
      `${icon} *Achiri Quality Monitor*`,
      '',
      `👥 Users: *${report.total_users}* | Pairs: *${report.total_pairs}*`,
      `📊 Avg score: *${report.aggregate.avg_score}/100*`,
      `✅ Pass rate: *${report.aggregate.pass_rate_pct}%* (target: ≥70%)`,
      `📈 Range: ${report.aggregate.min_score}–${report.aggregate.max_score}`,
    ];

    if (report.per_user.length > 0) {
      lines.push('', '*Per-User Quality*');
      for (const u of report.per_user.slice(0, 8)) {
        const ui = u.pass_rate_pct >= 70 ? '✅' : u.pass_rate_pct >= 50 ? '⚠️' : '❌';
        lines.push(`${ui} \`${u.userId.slice(0, 15)}\`: avg *${u.avg_score}*, *${u.pass_rate_pct}%* pass (${u.pairs}p)`);
      }
    }

    const flags = Object.entries(report.aggregate.flag_frequency).sort((a, b) => b[1] - a[1]);
    if (flags.length > 0) {
      lines.push('', '*Top Flags*');
      for (const [flag, count] of flags.slice(0, 5)) {
        lines.push(`  🚩 ${flag}: ${count}×`);
      }
    }

    await sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    await sendMessage(chatId, `❌ Quality analysis failed: ${(err as Error).message?.slice(0, 100)}`);
  }
}

// ── Sprint 325: /achirianalytics — Unified Achiri metrics dashboard ──────────

export async function handleAchiriAnalytics(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  const baseUrl = (process.env.ACHIRI_BASE_URL ?? 'http://localhost:3420').replace(/\/$/, '');

  try {
    const res = await fetch(`${baseUrl}/analytics`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      users: { total: number; dau: number; returning: number; retention_7d_pct: number };
      messages: { today: number; total_turns: number; active_days: number };
      feedback: { total: number; average: number; nps: number; recent_avg: number };
      errors: { total: number; last_24h: number; by_type: Record<string, number> };
      uptime_s: number;
      cached_handlers: number;
    };

    const u = data.users;
    const m = data.messages;
    const f = data.feedback;
    const e = data.errors;

    const retIcon = u.retention_7d_pct >= 20 ? '✅' : '⚠️';
    const npsIcon = f.nps >= 0 ? '✅' : '⚠️';
    const errIcon = e.last_24h === 0 ? '✅' : '⚠️';

    const lines = [
      '📊 *Achiri Analytics Dashboard*',
      '',
      '*Users*',
      `  👥 Total: ${u.total} | DAU: ${u.dau}`,
      `  🔄 Returning: ${u.returning} | ${retIcon} 7d retention: ${u.retention_7d_pct}%`,
      '',
      '*Messages*',
      `  💬 Today: ${m.today} | Total: ${m.total_turns}`,
      `  📅 Active days: ${m.active_days}`,
      '',
      '*Feedback*',
      `  ⭐ Avg: ${f.average}/5 | Recent: ${f.recent_avg}/5`,
      `  ${npsIcon} NPS: ${f.nps}% (${f.total} ratings)`,
      '',
      '*Errors*',
      `  ${errIcon} Last 24h: ${e.last_24h} | Total: ${e.total}`,
    ];

    const types = Object.entries(e.by_type);
    if (types.length > 0) {
      lines.push(`  Types: ${types.map(([t, n]) => `${t}(${n})`).join(', ')}`);
    }

    const uptimeH = Math.floor(data.uptime_s / 3600);
    lines.push('', `_Uptime: ${uptimeH}h | Handlers cached: ${data.cached_handlers}_`);

    await sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    await sendMessage(chatId, `❌ Analytics fetch failed: ${(err as Error).message?.slice(0, 100)}\n\n_Is Achiri API running? Check: pm2 status achiri-api_`);
  }
}

// ── Sprint 327: /achiritopics — Conversation topic distribution ──────────────

export async function handleAchiriTopics(chatId: number, ownerChatId: string): Promise<void> {
  if (String(chatId) !== ownerChatId) {
    await sendMessage(chatId, '🔒 Owner only.');
    return;
  }

  await sendMessage(chatId, '🔄 Analyzing conversation topics...');

  try {
    const output = execSync('npx ts-node scripts/achiri/achiri-topic-analytics.ts --json 2>/dev/null', {
      timeout: 15000,
      cwd: process.cwd(),
    }).toString();

    let report: {
      total_messages_analyzed: number;
      total_users: number;
      topics: Array<{ topic: string; count: number; percentage: number }>;
      uncategorized_count: number;
      uncategorized_pct: number;
    };

    try {
      report = JSON.parse(output);
    } catch {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in output');
      report = JSON.parse(jsonMatch[0]);
    }

    const lines = [
      '📊 *Achiri Topic Analytics*',
      `Messages: ${report.total_messages_analyzed} | Users: ${report.total_users}`,
      '',
    ];

    const topTopics = report.topics.filter(t => t.count > 0).slice(0, 8);
    for (const t of topTopics) {
      const bar = '▓'.repeat(Math.max(1, Math.round(t.percentage / 10)));
      lines.push(`  ${t.topic}: ${bar} ${t.count} (${t.percentage}%)`);
    }

    if (report.uncategorized_count > 0) {
      lines.push(`  other: ${report.uncategorized_count} (${report.uncategorized_pct}%)`);
    }

    await sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    await sendMessage(chatId, `❌ Topic analysis failed: ${(err as Error).message?.slice(0, 100)}`);
  }
}
