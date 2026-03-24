/**
 * Sprint 1061: Morning Brief — auto-send /today summary to Telegram at 07:05
 * Run via PM2 cron scs001-morning-brief.
 * Silently exits if gate already met.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const ROOT = path.resolve(__dirname, '..');

function readJsonLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function sendTelegram(text: string): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[morning-brief] No Telegram credentials — message:', text.slice(0, 80));
    return;
  }
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  const req = https.request(
    {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    },
    (res) => { res.resume(); }
  );
  req.on('error', (e) => console.error('[morning-brief] Telegram error:', e.message));
  req.write(body);
  req.end();
}

function main(): void {
  try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch {}

  const today = new Date().toISOString().slice(0, 10);

  // Gate data
  let postsNeeded = 28, daysLeft = 14, postsDone = 0, deadline = 'Apr 7';
  try {
    const gate = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace/gates/phase1-5-gate.json'), 'utf8'));
    postsDone = gate.raw?.posts_count ?? 0;
    postsNeeded = gate.raw?.posts_remaining ?? 28;
    daysLeft = gate.days_remaining ?? 14;
    deadline = gate.deadline ?? 'Apr 7';
  } catch {}

  const DRY_METHODS = ['browser-post-dry', 'batch-browser-dry', 'dry'];
  const manualPosts = readJsonLines(path.join(ROOT, 'workspace/scs001/manual-posts.jsonl'));
  const postedIds = new Set<string>();
  manualPosts.forEach((e: any) => {
    if (!e.video_id) return;
    if (e.method && DRY_METHODS.some(d => String(e.method).includes(d))) return;
    postedIds.add(e.video_id);
  });

  // Today's posts
  const todayPosts = manualPosts.filter((p: any) =>
    !DRY_METHODS.some(d => String(p.method || '').includes(d)) &&
    (p.posted_at ?? p.recorded_at ?? '').startsWith(today)
  ).length;

  // Daily obligation
  const dailyObligation = daysLeft > 0 ? Math.ceil(postsNeeded / daysLeft) : postsNeeded;

  if (postsNeeded <= 0) {
    console.log('[morning-brief] Gate met — no brief needed');
    return;
  }

  // Top unposted video
  const deliveries = readJsonLines(path.join(ROOT, 'workspace/scs001/auto-delivered.jsonl'));
  const top = deliveries
    .filter((e: any) => e.video_id && !postedIds.has(e.video_id))
    .sort((a: any, b: any) => (b.viral_score ?? 0) - (a.viral_score ?? 0))[0];

  const paceIcon = todayPosts >= dailyObligation ? '✅' : '🎯';
  const urgencyIcon = daysLeft <= 3 ? '🚨' : daysLeft <= 7 ? '⚠️' : '☀️';

  // Sprint 1104: views progress when views < 100
  const totalViews = manualPosts
    .filter((p: any) => !DRY_METHODS.some(d => String(p.method || '').includes(d)))
    .reduce((s: number, p: any) => s + (p.views ?? 0), 0);

  const lines = [
    `${urgencyIcon} *Good morning — ${today}*`,
    '',
    `📊 Gate: *${postsDone}/30* · ${daysLeft}d to ${deadline}`,
    `${paceIcon} Today: *${todayPosts}/${dailyObligation}* posted`,
    ...(totalViews < 100 ? [`👁️ Views: ${totalViews}/500 — engagement lag, boost with CTAs`] : []),
    '',
  ];

  if (top) {
    lines.push(`🎬 *Top pick:* \`${top.video_id}\``);
    if (top.topic) lines.push(`📝 ${String(top.topic).slice(0, 60)}`);
    lines.push(`_/pickup or /caption-next to post · /record ${top.video_id} 0 after posting_`);
  } else {
    lines.push('_No unposted videos — run /refresh to check pipeline_');
  }

  // Sprint 1073: warn if smoke test is stale (>24h)
  try {
    const smokePath = path.join(ROOT, 'reports/smoke-test-latest.json');
    if (fs.existsSync(smokePath)) {
      const smoke = JSON.parse(fs.readFileSync(smokePath, 'utf-8'));
      const smokeTs = smoke.timestamp ? new Date(smoke.timestamp).getTime() : 0;
      const smokeAgeH = smokeTs > 0 ? (Date.now() - smokeTs) / 3600000 : 999;
      if (smokeAgeH > 24) {
        lines.push('');
        lines.push(`⚠️ *Smoke test stale* — last run ${Math.round(smokeAgeH)}h ago · run /smoke`);
      }
    }
  } catch {}

  // Sprint 1094: Godman countdown when ≤14d to launch
  const godmanMs = new Date('2026-04-14T00:00:00Z').getTime() - Date.now();
  const godmanDays = Math.max(0, Math.ceil(godmanMs / 86_400_000));
  if (godmanDays <= 14) {
    lines.push('');
    lines.push(`🚀 *Godman launch in ${godmanDays}d* — /godman · npm login before Apr 14`);
  }

  lines.push('');
  lines.push('_/status · /errors · /blockers · /today_');

  sendTelegram(lines.join('\n'));
  console.log(`[morning-brief] sent — ${postsDone}/30 posts, ${todayPosts}/${dailyObligation} today`);
}

main();
