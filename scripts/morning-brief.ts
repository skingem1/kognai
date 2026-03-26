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

// Sprint 1230: helper that excludes dry-run entries from manual-posts.jsonl
function readRealPostsMB(): any[] {
  const dryMethods = ['browser-post-dry', 'batch-browser-dry', 'dry'];
  return readJsonLines(path.join(ROOT, 'workspace/scs001/manual-posts.jsonl')).filter(
    (e: any) => e.video_id && !(e.method && dryMethods.some((d: string) => String(e.method).includes(d)))
  );
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

  // Sprint 1139 (wave 14): suppress brief when gate is fully met (posts + views)
  const totalViewsCurrent = manualPosts
    .filter((p: any) => !DRY_METHODS.some(d => String(p.method || '').includes(d)))
    .reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  if (postsNeeded <= 0 && totalViewsCurrent >= 500) {
    const flagPath = path.join(ROOT, 'workspace/scs001/gate-celebration-sent.txt');
    if (!fs.existsSync(flagPath)) {
      sendTelegram(`🎉 *Phase 1.5 gate met!* 30 posts · 500+ views — great work! Morning briefs paused until Phase 2 begins.`);
      fs.writeFileSync(flagPath, new Date().toISOString(), 'utf-8');
    }
    console.log('[morning-brief] Gate fully met — no brief needed');
    return;
  }

  if (postsNeeded <= 0) {
    console.log('[morning-brief] Posts done but views pending — sending brief');
  }

  // Top unposted video + queue depth
  const deliveries = readJsonLines(path.join(ROOT, 'workspace/scs001/auto-delivered.jsonl'));
  const unpostedDeliveries = deliveries.filter((e: any) => e.video_id && !postedIds.has(e.video_id));
  const queueDepth = unpostedDeliveries.length;
  const top = unpostedDeliveries
    .sort((a: any, b: any) => (b.viral_score ?? 0) - (a.viral_score ?? 0))[0];

  const paceIcon = todayPosts >= dailyObligation ? '✅' : '🎯';
  const urgencyIcon = daysLeft <= 3 ? '🚨' : daysLeft <= 7 ? '⚠️' : '☀️';

  // Sprint 1104: views progress when views < 100
  const totalViews = manualPosts
    .filter((p: any) => !DRY_METHODS.some(d => String(p.method || '').includes(d)))
    .reduce((s: number, p: any) => s + (p.views ?? 0), 0);

  // Sprint 1127: gate ETA from manual-posts history — Sprint 1230: use readRealPostsMB
  let gateEtaLine = '';
  if (postsNeeded > 0) {
    try {
      const allPosts = readRealPostsMB();
      if (allPosts.length > 1) {
        const dates = allPosts
          .map((p: any) => new Date(p.posted_at ?? p.recorded_at))
          .filter((d: Date) => !isNaN(d.getTime()))
          .sort((a: Date, b: Date) => a.getTime() - b.getTime());
        const daysSinceFirst = Math.max(1, (Date.now() - dates[0].getTime()) / 86_400_000);
        const pacePerDay = allPosts.length / daysSinceFirst;
        if (pacePerDay > 0) {
          const daysToGate = Math.ceil(postsNeeded / pacePerDay);
          const etaDate = new Date(Date.now() + daysToGate * 86_400_000).toISOString().slice(0, 10);
          const missedGate = new Date(etaDate) > new Date('2026-04-07T00:00:00Z');
          gateEtaLine = missedGate ? `⚠️ ETA: ${etaDate} — behind gate!` : `📈 ETA: ${etaDate} — on track`;
        }
      }
    } catch {}
  }

  const lines = [
    `${urgencyIcon} *Good morning — ${today}*`,
    '',
    `📊 Gate: *${postsDone}/30* · ${daysLeft}d to ${deadline}`,
    `${paceIcon} Today: *${todayPosts}/${dailyObligation}* posted`,
    ...(gateEtaLine ? [gateEtaLine] : []),
    ...(totalViews < 100 ? [`👁️ Views: ${totalViews}/500 — engagement lag, boost with CTAs`] : []),
    `📦 Queue: *${queueDepth}* unposted video${queueDepth !== 1 ? 's' : ''} ready`,
    '',
  ];

  if (top) {
    lines.push(`🎬 *Top pick:* \`${top.video_id}\``);
    if (top.topic) lines.push(`📝 ${String(top.topic).slice(0, 60)}`);
    lines.push(`_/pickup or /caption-next to post · /record ${top.video_id} 0 <tiktok_url> after posting_`);  // Sprint 1381
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

  // Sprint 1120: warn if any PM2 cron is stuck (>48h uptime without restart)
  try {
    const { execSync } = require('child_process');
    const pm2Out = execSync('pm2 jlist', { timeout: 5000, stdio: 'pipe' }).toString();
    const pm2List: any[] = JSON.parse(pm2Out);
    const stuckCrons = pm2List.filter((p: any) => {
      if (!p.pm2_env?.cron_restart) return false;
      const uptime = p.pm2_env?.pm_uptime ?? 0;
      return uptime > 0 && (Date.now() - uptime) / 3600000 > 48 && p.pm2_env?.status === 'online';
    });
    if (stuckCrons.length > 0) {
      lines.push('');
      lines.push(`🔴 *Stuck crons (>48h):* ${stuckCrons.map((p: any) => p.name).join(', ')} — run /crons`);
    }
  } catch {}

  // Sprint 1094+1124: Godman countdown when ≤14d to launch; skip if already launched
  const godmanMs = new Date('2026-04-14T00:00:00Z').getTime() - Date.now();
  const godmanDays = Math.max(0, Math.ceil(godmanMs / 86_400_000));
  if (godmanMs < 0) {
    // Already launched — show brief "launched" note instead of countdown
    const daysSinceLaunch = Math.floor(Math.abs(godmanMs) / 86_400_000);
    lines.push('');
    lines.push(`🚀 *Godman launched* ${daysSinceLaunch}d ago — /godman to check status`);
  } else if (godmanDays <= 3) {
    // Sprint 1142 (wave 15): detailed checklist when <3d to launch
    lines.push('');
    lines.push(`🚀 *Godman T-${godmanDays}d checklist:*`);
    lines.push(`  1. npm login (verify with \`npm whoami\`)`);
    lines.push(`  2. git tag v1.0.0 for each protocol`);
    lines.push(`  3. npm publish --dry-run per protocol`);
    lines.push(`  _Run /godman for status_`);
  } else if (godmanDays <= 14) {
    lines.push('');
    lines.push(`🚀 *Godman launch in ${godmanDays}d* — /godman · npm login before Apr 14`);
  }

  // Sprint 1139 (wave 13): Achiri alpha reminder when <7d away
  const achiriMs = new Date('2026-04-25T00:00:00Z').getTime() - Date.now();
  const achiriDays = Math.max(0, Math.ceil(achiriMs / 86_400_000));
  if (achiriMs > 0 && achiriDays <= 7) {
    lines.push('');
    const aIcon = achiriDays <= 3 ? '🔴' : '🟠';
    lines.push(`${aIcon} *Achiri alpha in ${achiriDays}d* — run /achiri to check readiness`);
  }

  lines.push('');
  lines.push('_/status · /errors · /blockers · /today_');

  sendTelegram(lines.join('\n'));
  console.log(`[morning-brief] sent — ${postsDone}/30 posts, ${todayPosts}/${dailyObligation} today`);
}

main();
