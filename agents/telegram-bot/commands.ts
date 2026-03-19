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

export async function handleHelp(chatId: number): Promise<void> {
  await sendMessage(chatId, [
    '📖 *Available Commands*',
    '',
    '🎬 *TikTok Pipeline*',
    '/start — Register & see your account',
    '/preview — Show the next post candidate',
    '/schedule — Configure daily posting frequency',
    '/status — Latest SCS-001 pipeline run',
    '/stats — Pipeline statistics',
    '/subscribe — Subscribe to TikTok Agent ($19/$49/mo)',
    '/stripestatus — Stripe go-live checklist (owner)',
    '/tiktokstatus — TikTok live mode readiness (owner)',
    '/gate — Phase 1.5 gate review (Apr 7 kill switch)',
    '/postreminder — Apr 7 gate progress + posting workflow (owner)',
    '/review — Top-3 QC-passed videos for manual posting (owner)',
    '/record <id> <views> [title] — Record posted video to gate tracker (owner)',
    '/updateviews <id> <views> — Update view count on recorded post (owner)',
    '/queue — Posting queue: unposted videos + daily pace (owner)',
    '/postnow — Find videos ready to post with file path + metadata (owner)',
    '/postbatch [N] — Batch post N videos with file paths + captions (default 5, owner)',
    '/caption [video_id] — Ready-to-paste TikTok caption for a video (owner)',
    '/pace — Posting pace vs Apr 7 gate target (owner)',
    '/today — Morning cockpit: target + next video + trending topics (owner)',
    '/viral — Top 10 trending topics from pipeline (owner)',
    '/viralstats — Viral score summary: avg/max/top-3 (owner)',
    '/sendvideo <id> — Send captioned video file to Telegram for manual posting (owner)',
    '/calendar — Today\'s posting schedule from content calendar (owner)',
    '',
    '🤖 *Achiri AI Companion*',
    '/achiri <msg> — Chat with Achiri (free tier, Darija/Arabic/French)',
    '/waitlist — Join Achiri alpha waitlist (launches Apr 25)',
    '/inviteachiri <id> — Invite user to Achiri alpha whitelist (owner)',
    '/deploystatus — Achiri alpha deploy checklist (owner)',
    '/achirihealth — Achiri server status (owner)',
    '/pm2status — All PM2 processes: status, uptime, restarts (owner)',
    '/health — Full system health check: env, gate, PM2, Achiri, pipeline (owner)',
    '/preflight — Production go-live checklist with operator action items (owner)',
    '',
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

export async function handleAchiri(chatId: number, message: string): Promise<void> {
  // Alpha gate — owner always allowed; whitelist gates non-owners when ACHIRI_ALPHA_ONLY=true
  if (ACHIRI_ALPHA_ONLY && String(chatId) !== ACHIRI_OWNER_ID && !checkAlphaAccess(chatId)) {
    await sendMessage(chatId, 'Achiri Lite Alpha — invitation only. DM @kognai_bot to join the waitlist! 🙏');
    return;
  }

  if (!message || !message.trim()) {
    await sendMessage(chatId, 'Qouli chay 😊  /achiri <your message>');
    return;
  }

  // Resolve Achiri tier from TelegramDB subscription tier
  const record = TelegramDB.get(chatId);
  const achiriTier = ACHIRI_TIER_MAP[record?.tier ?? 'free'] ?? 'free';

  try {
    const res = await fetch(ACHIRI_BASE_URL + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: String(chatId), tier: achiriTier, message: message.trim() }),
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

  // Sprint 226: Send actual video files via Telegram for easy save-to-phone posting
  for (const v of ready) {
    const viralScore = experiments.get(v.video_id)?.partial_viral_score;
    const captionParts: string[] = [];
    if (v.topic) captionParts.push(v.topic.slice(0, 80));
    captionParts.push(hashtags);
    captionParts.push(`\n/record ${v.video_id} 0`);
    if (viralScore != null) captionParts.unshift(`Viral: ${viralScore}`);
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

  // 3. Next unposted video from ledger
  let nextVideoId: string | null = null;
  if (existsSync(ledgerPath)) {
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

  if (nextVideoId) {
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
    const speakerLine = entry.speaker ? `🎙️ ${entry.speaker}` : '';

    const viralScore = batchExperiments.get(entry.video_id)?.partial_viral_score;
    const viralLine = viralScore != null ? `🧬 Viral: ${viralScore}` : '';

    const header = [
      `🎬 *Video ${i + 1}/${batch.length}:* \`${entry.video_id}\``,
      viralLine,
      speakerLine,
      `📁 \`${mp4}\``,
    ].filter(Boolean).join('\n');

    await sendMessage(chatId, header);
    await sendMessage(chatId, '```\n' + caption + '\n```');

    // Sprint 226: Send actual video file via Telegram for easy save-to-phone
    try {
      await sendVideo(chatId, mp4, `${hookText}\n${hashtags}\n\n/record ${entry.video_id} 0`);
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
    const postsPath = join(ROOT, 'data', 'manual-posts.jsonl');
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
    const ledgerPath = join(ROOT, 'data', 'publish-ledger.jsonl');
    const postsPath = join(ROOT, 'data', 'manual-posts.jsonl');
    let ledgerCount = 0;
    let postedIds = new Set<string>();
    if (existsSync(ledgerPath)) {
      ledgerCount = readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean).length;
    }
    if (existsSync(postsPath)) {
      const pLines = readFileSync(postsPath, 'utf-8').trim().split('\n').filter(Boolean);
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
