/**
 * Telegram bot commands — extracted from telegram-bot.ts (Sprint 455)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ROOT, readJSON, readLines, readRealPosts, getPm2List, fmtUptime, fmtMem, latestSprintFile,
  findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived, saveArchived, ARCHIVE_PATH,
} from './shared'; // Sprint 1219: added readRealPosts

export function cmdGate(): string {
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const warmupPath = path.join(ROOT, 'workspace', 'scs001', 'warmup-status.json');
  const postTiktokPath = path.join(ROOT, 'scripts', 'scs001', 'post-tiktok.sh');
  const autoDeliveredPath = path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');

  const gateDate = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / 86_400_000));

  // --- Posts & Views (Sprint 1220: exclude dry-runs) ---
  const realPosts = readRealPosts();
  const postCount = realPosts.length;
  const totalViews = realPosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const postsNeeded = Math.max(0, 30 - postCount);
  const postsPerDay = daysLeft > 0 ? (postsNeeded / daysLeft).toFixed(1) : '∞';
  const viewsNeeded = Math.max(0, 500 - totalViews);

  // --- Publishable Videos ---
  let ledgerCount = 0;
  const postedIds = new Set<string>();
  // Sprint 1220: use realPosts so dry-run posts don't mark videos as already posted
  for (const p of realPosts) { if (p.video_id) postedIds.add(p.video_id as string); }
  if (fs.existsSync(autoDeliveredPath)) {
    for (const l of fs.readFileSync(autoDeliveredPath, 'utf-8').split('\n').filter(l => l.trim())) {
      try { const p = JSON.parse(l); if (p.video_id) postedIds.add(p.video_id); } catch {}
    }
  }
  let readyToPost = 0;
  if (fs.existsSync(ledgerPath)) {
    const lines = fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
    ledgerCount = lines.length;
    for (const l of lines) {
      try { const e = JSON.parse(l); if (e.video_id && !postedIds.has(e.video_id)) readyToPost++; } catch {}
    }
  }

  // --- Warmup Status ---
  let warmupStatus = '❌ Not started';
  if (fs.existsSync(warmupPath)) {
    try {
      const ws = JSON.parse(fs.readFileSync(warmupPath, 'utf-8'));
      if (ws.verified) warmupStatus = `✅ Verified (${ws.days_active}d, alignment ${ws.niche_alignment}/10)`;
      else if (ws.warmup_complete) warmupStatus = `⚠️ Complete but unverified`;
      else warmupStatus = `⏳ In progress (${ws.days_active ?? 0}d)`;
    } catch {}
  }

  // --- Browser Use CLI ---
  let browserUseStatus = '❌ Not installed';
  try {
    execSync('which browser-use 2>/dev/null || pip3 show browser-use 2>/dev/null', { timeout: 5000 });
    browserUseStatus = '✅ Installed';
  } catch {}
  const postScriptExists = fs.existsSync(postTiktokPath);
  const browserPosting = postScriptExists ? (browserUseStatus.startsWith('✅') ? '✅ Ready' : '⚠️ Script exists, CLI missing') : '❌ Not wired';

  // --- Pipeline Health ---
  let pipelineStatus = '❌ No videos';
  if (ledgerCount > 0) {
    pipelineStatus = `✅ ${ledgerCount} total, ${readyToPost} ready to post`;
  }

  // --- Stripe ---
  const stripeReady = !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;

  // Sprint 1108: urgency emoji escalation based on days remaining
  const urgency = daysLeft < 3 ? '🔴 CRITICAL — post NOW'
    : daysLeft <= 6 ? '🟠 URGENT'
    : daysLeft <= 13 ? '🟡 WARNING'
    : '🟢 ON TRACK';

  const postIcon = postCount >= 30 ? '✅' : '⏳';
  const viewIcon = totalViews >= 500 ? '✅' : '⏳';

  // --- Criteria Summary ---
  const criteria = [
    { pass: postCount >= 30, label: 'Posts 30+' },
    { pass: totalViews >= 500, label: 'Views 500+' },
    { pass: ledgerCount >= 10, label: 'Pipeline operational' },
    { pass: stripeReady, label: 'Stripe configured' },
  ];
  const passed = criteria.filter(c => c.pass).length;

  // Sprint 1121: PASS/FAIL/AT RISK verdict
  const gateVerdict = postCount >= 30 && totalViews >= 500
    ? '✅ *GATE: PASS*'
    : daysLeft <= 3 && (postsNeeded > 0 || viewsNeeded > 0)
      ? '🔴 *GATE: FAIL RISK — act now*'
      : daysLeft <= 7 && postsNeeded > daysLeft * 2
        ? '🟠 *GATE: AT RISK*'
        : '🟡 *GATE: IN PROGRESS*';

  // Sprint 1137 (wave 19): time-to-deadline progress ring
  const GATE_TOTAL_DAYS = 14;
  const daysUsed = GATE_TOTAL_DAYS - daysLeft;
  const ringFilled = Math.min(GATE_TOTAL_DAYS, Math.round(daysUsed));
  const ringBar = '█'.repeat(ringFilled) + '░'.repeat(GATE_TOTAL_DAYS - ringFilled);

  return [
    `*📊 Phase 1.5 Gate — April 7 Readiness*`,
    gateVerdict,
    `📅 \`[${ringBar}]\` ${daysLeft}/${GATE_TOTAL_DAYS}d left · ${urgency}`,
    `✅ *${passed}/4 criteria met*`,
    ``,
    `*── Posting ──*`,
    // Sprint 1135 (wave 15): hours since last post (Sprint 1220: uses realPosts)
    (() => {
      if (realPosts.length === 0) return '';
      try {
        const lastTs = realPosts
          .map((p: any) => { try { return new Date(p.posted_at ?? p.recorded_at).getTime(); } catch { return 0; } })
          .filter((t: number) => t > 0)
          .sort((a: number, b: number) => b - a)[0];
        if (!lastTs) return '';
        const ageH = (Date.now() - lastTs) / 3600000;
        const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : `${Math.round(ageH)}h ago`;
        const icon = ageH > 24 ? '⚠️' : '⏱';
        return `${icon} Last post: *${ageStr}*`;
      } catch { return ''; }
    })(),
    `${postIcon} Posts: ${postCount}/30 (need ${postsNeeded} more)`,
    `${viewIcon} Views: ${totalViews}/500 (need ${viewsNeeded} more)`,
    // Sprint 1145 (wave 21): stale views warning (Sprint 1220: uses realPosts)
    ...(() => {
      if (realPosts.length === 0) return [];
      try {
        const lastTs = realPosts
          .map((p: any) => { try { return new Date(p.updated_at ?? p.posted_at ?? p.recorded_at).getTime(); } catch { return 0; } })
          .filter((t: number) => t > 0 && !isNaN(t))
          .sort((a: number, b: number) => b - a)[0];
        if (lastTs) {
          const ageH = (Date.now() - lastTs) / 3600000;
          if (ageH > 12) {
            const ageStr = ageH < 24 ? `${Math.round(ageH)}h` : `${Math.round(ageH / 24)}d`;
            return [`⏳ *Views last updated: ${ageStr} ago* — run /record to refresh stats`];
          }
        }
      } catch {}
      return [];
    })(),
    // Sprint 1138 (wave 13): views needed per remaining day
    ...(viewsNeeded > 0 && daysLeft > 0 ? [`👁️ Views/day needed: *${(viewsNeeded / daysLeft).toFixed(1)}/day* to hit 500`] : []),
    // Sprint 1139 (wave 18): average views per post
    ...(postCount > 0 ? [`📈 Avg views/post: *${(totalViews / postCount).toFixed(1)}*${totalViews / postCount < 10 ? ' — boost quality' : ''}`] : []),
    `📊 Pace needed: ${postsPerDay} posts/day`,
    // Sprint 1132 (wave 14): posts/day over last 7 days (Sprint 1220: uses realPosts)
    (() => {
      if (realPosts.length === 0) return '';
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
        const last7 = realPosts.filter((p: any) => {
          try { return (p.posted_at ?? p.recorded_at ?? '').slice(0, 10) >= sevenDaysAgo; } catch { return false; }
        });
        const rate7d = (last7.length / 7).toFixed(1);
        return `📅 Last 7d: *${last7.length} posts* (${rate7d}/day)`;
      } catch { return ''; }
    })(),
    // Sprint 1137 (wave 17): posts-per-weekday bar (Mon-Sun) (Sprint 1220: uses realPosts)
    (() => {
      if (realPosts.length === 0) return '';
      try {
        const dayLabels = ['Mo','Tu','We','Th','Fr','Sa','Su'];
        const counts = [0,0,0,0,0,0,0];
        for (const p of realPosts) {
          try {
            const ts = (p as any).posted_at ?? (p as any).recorded_at;
            if (!ts) continue;
            const dow = (new Date(ts).getDay() + 6) % 7; // 0=Mon
            counts[dow]++;
          } catch { /* skip */ }
        }
        const maxC = Math.max(...counts, 1);
        const sparkChars = ['▁','▂','▃','▄','▅','▆','▇','█'];
        const bars = counts.map((n,i) => `${dayLabels[i]}${sparkChars[Math.min(7,Math.floor(n/maxC*7))]}`).join(' ');
        return `📊 Weekday: \`${bars}\``;
      } catch { return ''; }
    })(),
      // Sprint 1136 (wave 21): weekend day nudge
    ...(() => {
      const dow = now.getDay(); // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) {
        return [`⚠️ *Today is ${dow === 6 ? 'Saturday' : 'Sunday'}* — lower engagement expected. Consider scheduling for a weekday.`];
      }
      return [];
    })(),
    // Sprint 1137 (wave 20): posts-per-week target to stay on track
    ...(() => {
      if (postsNeeded <= 0 || daysLeft <= 0) return [];
      const weeksLeft = Math.ceil(daysLeft / 7);
      const perWeek = Math.ceil(postsNeeded / weeksLeft);
      return [`📋 *Weekly target:* ${perWeek} posts/week (${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} left)`];
    })(),
    // Sprint 1140 (wave 24): days since last post was recorded (cadence gap) (Sprint 1220: realPosts)
    ...(() => {
      if (realPosts.length === 0) return [];
      try {
        const lastTs2 = realPosts
          .map((p: any) => { try { return new Date(p.posted_at ?? p.recorded_at).getTime(); } catch { return 0; } })
          .filter((t: number) => t > 0)
          .sort((a: number, b: number) => b - a)[0];
        if (!lastTs2) return [];
        const ageH2 = (Date.now() - lastTs2) / 3600000;
        const ageStr2 = ageH2 < 1 ? `${Math.round(ageH2 * 60)}m ago` : ageH2 < 24 ? `${Math.round(ageH2)}h ago` : `${Math.round(ageH2 / 24)}d ago`;
        const icon2 = ageH2 > 48 ? '🔴' : ageH2 > 24 ? '⚠️' : '✅';
        return [`${icon2} *Last post:* ${ageStr2}${ageH2 > 48 ? ' — cadence gap!' : ''}`];
      } catch { return []; }
    })(),
    // Sprint 1141 (wave 25): show latest E2E test result from achiri-e2e-latest.json
    ...(() => {
      try {
        const e2ePath = path.join(ROOT, 'reports', 'achiri-e2e-latest.json');
        if (!fs.existsSync(e2ePath)) return [];
        const e2e = JSON.parse(fs.readFileSync(e2ePath, 'utf-8'));
        const e2ePass = e2e.passed ?? e2e.pass ?? e2e.status === 'pass';
        const e2eFail = e2e.failed ?? e2e.failures?.length ?? 0;
        const e2eTs = e2e.timestamp ?? e2e.generated_at;
        const e2eAge = e2eTs ? ` (${Math.round((Date.now() - new Date(e2eTs).getTime()) / 3600000)}h ago)` : '';
        const e2eIcon = e2ePass && e2eFail === 0 ? '✅' : '❌';
        return [`${e2eIcon} *Achiri E2E:* ${e2ePass && e2eFail === 0 ? 'all pass' : `${e2eFail} failing`}${e2eAge}`];
      } catch { return []; }
    })(),
    // Sprint 1141 (wave 22): is current week on track vs weekly target (Sprint 1220: realPosts)
    ...(() => {
      if (postsNeeded <= 0 || daysLeft <= 0) return [];
      try {
        const todayDow = now.getDay(); // 0=Sun
        const weekStartOffset = (todayDow === 0 ? 6 : todayDow - 1) * 86_400_000; // Mon=0
        const weekStartDate = new Date(now.getTime() - weekStartOffset).toISOString().slice(0, 10);
        const thisWeekPosts = realPosts.filter((p: any) => {
          try { return (p.posted_at ?? p.recorded_at ?? '').slice(0, 10) >= weekStartDate; } catch { return false; }
        }).length;
        const weeksLeft2 = Math.max(1, Math.ceil(daysLeft / 7));
        const weekTarget = Math.ceil(postsNeeded / weeksLeft2);
        const weekIcon = thisWeekPosts >= weekTarget ? '✅' : thisWeekPosts >= Math.ceil(weekTarget / 2) ? '⚠️' : '❌';
        return [`${weekIcon} *This week:* ${thisWeekPosts}/${weekTarget} posts (${weekTarget - thisWeekPosts > 0 ? `${weekTarget - thisWeekPosts} more needed` : 'on track'})`];
      } catch { return []; }
    })(),
    // Sprint 1141 (wave 23): top performing post (highest views) as proof of quality (Sprint 1220: realPosts)
    ...(() => {
      if (realPosts.length === 0) return [];
      try {
        const parsed = realPosts;
        if (parsed.length === 0) return [];
        const best = parsed.reduce((best: any, p: any) => (p.views ?? 0) > (best.views ?? 0) ? p : best, parsed[0]);
        const bestViews = best.views ?? 0;
        if (bestViews === 0) return [];
        const bestId = best.video_id ?? best.id ?? 'unknown';
        const bestDate = (best.posted_at ?? best.recorded_at ?? '').slice(0, 10);
        return [`🏆 *Best post:* \`${bestId}\` — *${bestViews} views*${bestDate ? ` (${bestDate})` : ''}`];
      } catch { return []; }
    })(),
    ``,
    `*── Infrastructure ──*`,
    // Sprint 1145 (wave 20): TikTok account age in days from warmup-status.json
    ...(() => {
      if (!fs.existsSync(warmupPath)) return [];
      try {
        const ws = JSON.parse(fs.readFileSync(warmupPath, 'utf-8'));
        const createdAt = ws.created_at ?? ws.account_created ?? ws.start_date;
        if (createdAt) {
          const ageDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
          const ageIcon = ageDays >= 30 ? '✅' : ageDays >= 14 ? '⚠️' : '🔴';
          return [`${ageIcon} Account age: *${ageDays}d* (${ageDays >= 30 ? 'mature' : ageDays >= 14 ? 'warming' : 'new — low trust'})`];
        }
      } catch {}
      return [];
    })(),
    `🔥 Warmup: ${warmupStatus}`,
    `🌐 Browser Use: ${browserPosting}`,
    `🎬 Pipeline: ${pipelineStatus}`,
    `💳 Stripe: ${stripeReady ? '✅ Ready' : '⚠️ Incomplete'}`,
    ``,
    `*── Action Items ──*`,
    ...(postCount === 0 ? ['⚠️ START POSTING NOW — 0 posts recorded'] : []),
    ...(warmupStatus.startsWith('❌') ? ['⚠️ Complete TikTok warmup (3 days scrolling)'] : []),
    ...(browserPosting.includes('missing') ? ['⚠️ Install browser-use: pip3 install browser-use'] : []),
    ...(readyToPost > 0 ? [`📦 ${readyToPost} videos queued — use /deliver to post`] : []),
    ``,
    `_Full report: npx ts-node scripts/scs001/generate-april7-gate.ts_`,
  ].join('\n');
}

export function cmdGoLive(): string {
  const lines: string[] = ['🚀 *Phase 1 Go-Live Readiness*', ''];

  // 1. TikTok OAuth
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;
  const hasClientKey = !!process.env.TIKTOK_CLIENT_KEY;
  const hasClientSecret = !!process.env.TIKTOK_CLIENT_SECRET;
  lines.push(hasToken ? '✅ TikTok Access Token: SET' : '❌ TikTok Access Token: MISSING');
  lines.push(hasClientKey ? '✅ TikTok Client Key: SET' : '❌ TikTok Client Key: MISSING');
  lines.push(hasClientSecret ? '✅ TikTok Client Secret: SET' : '❌ TikTok Client Secret: MISSING');

  // 2. Stripe
  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_GROWTH', 'STRIPE_PRICE_PREMIUM'];
  const stripeSet = stripeKeys.filter(k => !!process.env[k]).length;
  lines.push(stripeSet === stripeKeys.length ? '✅ Stripe: READY' : `⚠️ Stripe: ${stripeSet}/${stripeKeys.length} keys set`);

  // 3. Gate progress (Sprint 1221: use readRealPosts — excludes dry-runs)
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const goLivePosts = readRealPosts();
  const postsCount = goLivePosts.length;
  const totalViews = goLivePosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const postsLeft = Math.max(0, 30 - postsCount);
  const viewsLeft = Math.max(0, 500 - totalViews);
  const paceNeeded = daysLeft > 0 && postsLeft > 0 ? Math.round(postsLeft / daysLeft * 10) / 10 : 0;

  lines.push('');
  lines.push(`📅 Gate Deadline: Apr 7 (${daysLeft} days left)`);
  lines.push(`📊 Posts: ${postsCount}/30 ${postsLeft > 0 ? `(${postsLeft} more needed)` : '✅'}`);
  lines.push(`👁 Views: ${totalViews}/500 ${viewsLeft > 0 ? `(${viewsLeft} more needed)` : '✅'}`);
  if (paceNeeded > 0) lines.push(`⏱ Pace: ${paceNeeded} posts/day`);

  // 4. Queue (Sprint 1221: postedIds from goLivePosts — excludes dry-runs)
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  let queueCount = 0;
  if (fs.existsSync(ledgerPath)) {
    const postedIds = new Set<string>(goLivePosts.map((p: any) => p.video_id).filter(Boolean));
    for (const l of fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try { const e = JSON.parse(l); if (e.video_id && !postedIds.has(e.video_id)) queueCount++; } catch {}
    }
  }
  lines.push(`📦 Queue: ${queueCount} videos ready to post`);

  // 5. Urgency signal
  lines.push('');
  if (postsLeft <= 0 && viewsLeft <= 0) {
    lines.push('✅ GATE CRITERIA MET — ready for Phase 2A!');
  } else if (daysLeft <= 3 && postsLeft > 0) {
    lines.push('💀 KILL SWITCH IMMINENT — post NOW or TikTok agent shuts down');
  } else if (daysLeft <= 7 && postsLeft > 0) {
    lines.push('🚨 CRITICAL — behind pace, increase posting frequency');
  } else if (postsCount === 0) {
    lines.push('⚠️ WARNING — 0 posts recorded. Start posting now!');
  } else if (paceNeeded > 3) {
    lines.push('🟠 Behind pace — need to accelerate posting');
  } else {
    lines.push('🟢 On track — maintain current pace');
  }

  // 6. Next steps
  lines.push('');
  lines.push('*Next Steps:*');
  const steps: string[] = [];
  if (!hasToken) steps.push('1. Run /tiktokauth to get TikTok access token');
  if (queueCount > 0) steps.push(`${steps.length + 1}. Use /postbatch to get videos to post`);
  if (postsCount === 0) steps.push(`${steps.length + 1}. Post first video + /record <id> <views>`);
  if (hasToken && queueCount > 0) steps.push(`${steps.length + 1}. Enable auto-posting: AUTO\\_POST\\_DRY\\_RUN=0`);
  if (steps.length === 0) steps.push('All systems go! Keep posting to hit the gate.');
  lines.push(...steps);

  return lines.join('\n');
}

export function cmdAudit(): string {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');

  // Load experiments for scores
  const scores = new Map<string, number>();
  const speakers = new Map<string, { count: number; totalScore: number }>();
  const hooks = new Map<string, number>();
  if (fs.existsSync(expPath)) {
    for (const l of fs.readFileSync(expPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try {
        const e = JSON.parse(l);
        const id = e.clip_id ?? e.video_id;
        const score = e.partial_viral_score ?? 0;
        if (id) scores.set(id, score);
        if (e.speaker) {
          const s = speakers.get(e.speaker) ?? { count: 0, totalScore: 0 };
          s.count++; s.totalScore += score;
          speakers.set(e.speaker, s);
        }
        if (e.hook_formula) hooks.set(e.hook_formula, (hooks.get(e.hook_formula) ?? 0) + 1);
      } catch {}
    }
  }

  // Load posted IDs (Sprint 1221: use readRealPosts — excludes dry-runs)
  const postedIds = new Set<string>(readRealPosts().map((p: any) => p.video_id).filter(Boolean));

  // Load unposted videos from ledger
  const unposted: Array<{ id: string; score: number }> = [];
  if (fs.existsSync(ledgerPath)) {
    for (const l of fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try {
        const e = JSON.parse(l);
        if (e.video_id && !postedIds.has(e.video_id)) {
          unposted.push({ id: e.video_id, score: scores.get(e.video_id) ?? 0 });
        }
      } catch {}
    }
  }
  unposted.sort((a, b) => b.score - a.score);

  // Score distribution
  const scoreValues = unposted.map(v => v.score);
  const avgScore = scoreValues.length > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;
  const high = scoreValues.filter(s => s >= 0.6).length;
  const mid = scoreValues.filter(s => s >= 0.3 && s < 0.6).length;
  const low = scoreValues.filter(s => s < 0.3).length;

  // Top speakers
  const topSpeakers = Array.from(speakers.entries())
    .map(([name, s]) => ({ name, avg: s.totalScore / s.count, count: s.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // Hook diversity
  const hookCount = hooks.size;

  const lines: string[] = [
    '🔍 *Content Quality Audit*',
    '',
    `📦 Total in queue: *${unposted.length}* videos`,
    `📊 Avg viral score: *${Math.round(avgScore * 100)}%*`,
    `🟢 High (60%+): ${high} | 🟡 Mid (30-59%): ${mid} | 🔴 Low (<30%): ${low}`,
    `🎣 Hook diversity: ${hookCount} unique formulas`,
    '',
    '*Top Speakers:*',
  ];
  for (const s of topSpeakers) {
    lines.push(`  ${Math.round(s.avg * 100)}% — ${s.name} (${s.count} clips)`);
  }

  lines.push('');
  lines.push('*Best 5 to post first:*');
  for (const v of unposted.slice(0, 5)) {
    lines.push(`  ${Math.round(v.score * 100)}% — \`${v.id}\``);
  }

  // Posting timeline estimate
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - postedIds.size);
  lines.push('');
  if (postsNeeded > 0) {
    const pace = daysLeft > 0 ? Math.round(postsNeeded / daysLeft * 10) / 10 : postsNeeded;
    lines.push(`⏱ Gate: ${postsNeeded} posts in ${daysLeft} days = ${pace}/day`);
    if (high >= postsNeeded) {
      lines.push('✅ Enough high-quality content to hit the gate');
    } else {
      lines.push(`⚠️ Only ${high} high-quality videos — consider posting mid-tier too`);
    }
  } else {
    lines.push('✅ Gate posts target met!');
  }

  return lines.join('\n');
}

export function cmdStreak(): string {
  const posts = readRealPosts(); // Sprint 1219: was readLines(manual-posts.jsonl) — dry-runs excluded
  if (posts.length === 0) {
    return (
      `🔥 *Posting Streak*\n\n` +
      `No posts recorded yet.\n` +
      `Start posting to build your streak!\n\n` +
      `_Use \`/deliver\` to get videos, then \`/record <id> <views>\` after posting._`
    );
  }

  // Get unique posting days (sorted)
  const daySet: Record<string, number> = {};
  for (const p of posts as any[]) {
    const date = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
    if (date) {
      daySet[date] = (daySet[date] || 0) + 1;
    }
  }
  const days = Object.keys(daySet).sort();

  // Calculate current streak (consecutive days ending at today or yesterday)
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let currentStreak = 0;
  let checkDate = days.includes(today) ? today : (days.includes(yesterday) ? yesterday : null);

  if (checkDate) {
    let d = new Date(checkDate);
    while (daySet[d.toISOString().slice(0, 10)]) {
      currentStreak++;
      d = new Date(d.getTime() - 86400000);
    }
  }

  // Calculate best streak
  let bestStreak = 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]).getTime();
    const curr = new Date(days[i]).getTime();
    if (curr - prev === 86400000) {
      streak++;
    } else {
      bestStreak = Math.max(bestStreak, streak);
      streak = 1;
    }
  }
  bestStreak = Math.max(bestStreak, streak);

  // Today's posts
  const todayPosts = daySet[today] || 0;

  // Pace
  const daysLeft = Math.max(1, Math.ceil((new Date('2026-04-07').getTime() - Date.now()) / 86400000));
  const postsLeft = Math.max(0, 30 - posts.length);
  const pace = postsLeft > 0 ? Math.ceil(postsLeft / daysLeft) : 0;

  const streakEmoji = currentStreak >= 7 ? '🔥🔥🔥' : currentStreak >= 3 ? '🔥🔥' : currentStreak >= 1 ? '🔥' : '❄️';

  return (
    `${streakEmoji} *Posting Streak*\n\n` +
    `Current streak: *${currentStreak} day${currentStreak !== 1 ? 's' : ''}*\n` +
    `Best streak: *${bestStreak} day${bestStreak !== 1 ? 's' : ''}*\n` +
    `Today: *${todayPosts} post${todayPosts !== 1 ? 's' : ''}*\n` +
    `Total: *${posts.length}/30*\n\n` +
    `📊 Gate: ${postsLeft} posts in ${daysLeft}d (${pace}/day needed)\n` +
    `📅 Active days: ${days.length}\n\n` +
    (currentStreak === 0 ? `_Post today to start a new streak!_` : `_Keep it going! Post today to extend your streak._`)
  );
}

export function cmdPace(): string {
  const posts = readRealPosts(); // Sprint 1219: was readLines(manual-posts.jsonl) — dry-runs excluded
  const postCount = posts.length;

  const GATE_TARGET = 30;
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, GATE_TARGET - postCount);

  // Calculate current pace (posts per day since first post)
  let pacePerDay = 0;
  let daysSinceFirst = 0;
  if (posts.length > 0) {
    const dates = posts
      .map((p: any) => new Date(p.posted_at ?? p.recorded_at))
      .filter((d: Date) => !isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    if (dates.length > 0) {
      daysSinceFirst = Math.max(1, Math.ceil((now.getTime() - dates[0].getTime()) / 86_400_000));
      pacePerDay = postCount / daysSinceFirst;
    }
  }

  // Pace needed to hit gate
  const paceNeeded = daysLeft > 0 ? postsNeeded / daysLeft : postsNeeded > 0 ? Infinity : 0;

  // Projection at current pace
  const projectedAtGate = postCount + Math.floor(pacePerDay * daysLeft);
  const willPass = projectedAtGate >= GATE_TARGET;

  // Weekly breakdown (posts per week)
  const weeksLeft = Math.ceil(daysLeft / 7);
  const perWeek = daysLeft > 0 ? Math.ceil(postsNeeded / weeksLeft) : 0;

  // Total views
  const totalViews = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);

  // Sprint 1083: Add current streak to /pace output
  let streak = 0;
  const dailyCounts: Record<string, number> = {};
  for (const p of posts) {
    const d = ((p as any).posted_at ?? (p as any).recorded_at ?? '').slice(0, 10);
    if (d) dailyCounts[d] = (dailyCounts[d] ?? 0) + 1;
  }
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    if ((dailyCounts[d] ?? 0) > 0) streak++;
    else break;
  }

  const lines: string[] = [];
  lines.push('🏃 *Posting Pace — Gate Countdown*');
  lines.push('');
  lines.push(`📅 Gate: Apr 7 · *${daysLeft}d remaining*`);
  lines.push(`📊 Posts: *${postCount}/${GATE_TARGET}* · ${postsNeeded} to go`);
  lines.push(`👁️ Views: ${totalViews}/500`);
  lines.push(`🔥 Streak: *${streak}d* consecutive`);
  lines.push('');

  if (postCount === 0) {
    lines.push('⚠️ *No posts yet!* You need to start posting NOW.');
    lines.push(`📌 Required pace: *${paceNeeded.toFixed(1)} posts/day*`);
    lines.push(`📌 That's *${perWeek} posts/week*`);
  } else {
    // Sprint 1109: show pace gap (obligation vs actual)
    const gap = pacePerDay - paceNeeded;
    const gapStr = gap >= 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1);
    const gapIcon = gap >= 0 ? '✅' : gap >= -0.5 ? '⚠️' : '❌';
    lines.push(`*Current pace:* ${pacePerDay.toFixed(1)} posts/day`);
    lines.push(`*Needed pace:* ${paceNeeded.toFixed(1)} posts/day`);
    lines.push(`${gapIcon} *Gap:* ${gapStr} posts/day`);
    lines.push('');
    lines.push(`*Projection at current pace:* ${projectedAtGate} posts by Apr 7`);
    // Sprint 1112: projected gate completion date
    if (pacePerDay > 0 && postsNeeded > 0) {
      const daysToComplete = Math.ceil(postsNeeded / pacePerDay);
      const etaDate = new Date(now.getTime() + daysToComplete * 86_400_000);
      const etaStr = etaDate.toISOString().slice(0, 10);
      const etaIcon = etaDate <= GATE_DATE ? '✅' : '⚠️';
      lines.push(`${etaIcon} *ETA to 30 posts:* ${etaStr} (${daysToComplete}d from now)`);
    }
    if (willPass) {
      lines.push('✅ *On track* — keep it up!');
    } else {
      const deficit = GATE_TARGET - projectedAtGate;
      lines.push(`❌ *Off track* — ${deficit} posts short`);
      lines.push(`📌 Increase to *${paceNeeded.toFixed(1)} posts/day* (${perWeek}/week)`);
    }
  }

  // Sprint 1126: today's posting obligation action line
  const todayStr = now.toISOString().slice(0, 10);
  const todayPostedCount = Object.entries(dailyCounts).reduce((s, [d, n]) => d === todayStr ? s + n : s, 0);
  const todayObligation = daysLeft > 0 ? Math.ceil(postsNeeded / daysLeft) : 0;
  const todayRemaining = Math.max(0, todayObligation - todayPostedCount);
  if (postsNeeded > 0) {
    lines.push('');
    if (todayRemaining === 0) {
      lines.push(`✅ *Today's target met!* ${todayPostedCount}/${todayObligation} posted today`);
    } else {
      lines.push(`🎯 *Post ${todayRemaining} more today* (${todayPostedCount}/${todayObligation} done)`);
    }
  }

  // Sprint 1140 (wave 17): estimated gate completion date at current pace
  try {
    const mpLines = posts; // Sprint 1219: use already-loaded posts (readRealPosts)
    if (mpLines.length > 1) {
      const timestamps = mpLines
        .map((p: any) => new Date(p.posted_at ?? p.recorded_at).getTime())
        .filter((t: number) => t > 0)
        .sort((a: number, b: number) => a - b);
      const daysSinceFirst = Math.max(1, (Date.now() - timestamps[0]) / 86_400_000);
      const actualPacePerDay = mpLines.length / daysSinceFirst;
      if (actualPacePerDay > 0) {
        const daysToComplete = Math.ceil(postsNeeded / actualPacePerDay);
        const etaDate = new Date(Date.now() + daysToComplete * 86_400_000).toISOString().slice(0, 10);
        const gateDate = '2026-04-07';
        const onTrack = etaDate <= gateDate;
        const etaIcon = onTrack ? '✅' : '⚠️';
        lines.push('');
        lines.push(`${etaIcon} *Gate ETA:* ${etaDate} at *${actualPacePerDay.toFixed(1)}/day* pace${onTrack ? ' — on track' : ' — behind gate!'}`);
      }
    }
  } catch { /* skip */ }

  // Sprint 1137 (wave 16): time-boxed daily posting schedule
  if (postsNeeded > 0 && todayObligation > 0) {
    const slots = ['🌅 7:00 AM', '☀️ 12:00 PM', '🌆 7:00 PM'];
    const slotsToUse = slots.slice(0, Math.min(todayObligation, 3));
    lines.push('');
    lines.push(`*📅 Today's posting slots:* ${slotsToUse.join(' · ')}`);
  }

  // Sprint 1140 (wave 21): cumulative views trend (last 7d vs prior 7d)
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const allPosts = posts; // Sprint 1219: posts already loaded via readRealPosts()
    const last7Views = (allPosts as any[]).filter((p: any) => {
      const d = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
      return d >= sevenDaysAgo;
    }).reduce((s: number, p: any) => s + (p.views ?? 0), 0);
    const prior7Views = (allPosts as any[]).filter((p: any) => {
      const d = (p.posted_at ?? p.recorded_at ?? '').slice(0, 10);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    }).reduce((s: number, p: any) => s + (p.views ?? 0), 0);
    if (last7Views > 0 || prior7Views > 0) {
      const delta = last7Views - prior7Views;
      const trendIcon = delta > 10 ? '📈' : delta < -10 ? '📉' : '➡️';
      const deltaStr = delta >= 0 ? `+${delta}` : String(delta);
      lines.push('');
      lines.push(`${trendIcon} *Views trend:* last 7d *+${last7Views}* vs prior 7d *+${prior7Views}* (${deltaStr})`);
    }
  } catch { /* skip */ }

  // Sprint 1141 (wave 20): queue size vs obligation buffer (Sprint 1221: posts=readRealPosts)
  try {
    const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
    if (fs.existsSync(ledgerPath)) {
      const postedIds2 = new Set<string>(posts.map((p: any) => p.video_id).filter(Boolean));
      let qCount = 0;
      for (const l of fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim())) {
        try { const e = JSON.parse(l); if (e.video_id && !postedIds2.has(e.video_id)) qCount++; } catch {}
      }
      const dailyObligation = daysLeft > 0 ? Math.ceil(postsNeeded / daysLeft) : 0;
      const bufferDays = dailyObligation > 0 ? Math.floor(qCount / dailyObligation) : qCount;
      const bufIcon = bufferDays >= 3 ? '✅' : bufferDays >= 1 ? '⚠️' : '❌';
      lines.push('');
      lines.push(`${bufIcon} *Queue:* ${qCount} videos (${bufferDays}d buffer at ${dailyObligation}/day obligation)`);
    }
  } catch { /* skip */ }

  // Sprint 1141 (wave 19): weekdays remaining until gate (Mon-Fri only)
  try {
    let weekdaysLeft = 0;
    const gateD = new Date('2026-04-07T00:00:00Z');
    const cur = new Date(now.getTime());
    cur.setHours(0, 0, 0, 0);
    while (cur < gateD) {
      cur.setDate(cur.getDate() + 1);
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) weekdaysLeft++;
    }
    if (weekdaysLeft > 0) {
      lines.push('');
      lines.push(`📆 *Weekdays left:* ${weekdaysLeft} (Mon–Fri) until gate`);
    }
  } catch { /* skip */ }

  // Sprint 1140 (wave 22): gate pass probability at current pace
  try {
    if (postsNeeded > 0 && daysLeft > 0 && pacePerDay > 0) {
      const projectedTotal = postCount + Math.floor(pacePerDay * daysLeft);
      const postProb = Math.min(100, Math.round((projectedTotal / GATE_TARGET) * 100));
      const totalViews3 = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
      const viewsPerPost = postCount > 0 ? totalViews3 / postCount : 0;
      const projectedViews = totalViews3 + Math.floor(pacePerDay * daysLeft * viewsPerPost);
      const viewProb = Math.min(100, Math.round((projectedViews / 500) * 100));
      const combined = Math.min(postProb, viewProb);
      const probIcon = combined >= 80 ? '✅' : combined >= 50 ? '⚠️' : '❌';
      lines.push('');
      lines.push(`${probIcon} *Gate probability:* ${combined}% (posts: ${postProb}% · views: ${viewProb}%)`);
    }
  } catch { /* skip */ }

  // Sprint 1140 (wave 25): break-even post count (posts needed to cover pipeline API costs)
  try {
    const statsPath = path.join(ROOT, 'reports', 'stats-latest.json');
    if (fs.existsSync(statsPath)) {
      const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      const costPerVideo = stats.avg_cost_per_video ?? stats.cost_per_video ?? stats.api_cost_avg;
      const revenuePerSub = 9; // €9/mo subscription
      if (costPerVideo && costPerVideo > 0) {
        const breakEvenPosts = Math.ceil(revenuePerSub / costPerVideo);
        const beIcon = postCount >= breakEvenPosts ? '✅' : '⚠️';
        lines.push('');
        lines.push(`${beIcon} *Break-even:* ${breakEvenPosts} posts cover 1 month sub at €${costPerVideo.toFixed(3)}/video (${postCount >= breakEvenPosts ? 'covered' : `${breakEvenPosts - postCount} more needed`})`);
      }
    }
  } catch { /* skip */ }

  // Sprint 1139 (wave 24): views per post as % of gate views target (efficiency metric)
  try {
    const totalViews4 = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
    const GATE_VIEWS = 500;
    if (postCount > 0 && totalViews4 > 0) {
      const viewsPerPost4 = totalViews4 / postCount;
      const pctOfTarget = (viewsPerPost4 / GATE_VIEWS * 100).toFixed(1);
      const effIcon = parseFloat(pctOfTarget) >= 5 ? '✅' : parseFloat(pctOfTarget) >= 2 ? '⚠️' : '❌';
      const viewsNeededPerPost = GATE_VIEWS / Math.max(1, postsNeeded + postCount);
      lines.push('');
      lines.push(`${effIcon} *Views efficiency:* ${viewsPerPost4.toFixed(0)} views/post = ${pctOfTarget}% of target per post (need ${viewsNeededPerPost.toFixed(0)} avg to pass)`);
    }
  } catch { /* skip */ }

  // Sprint 1140 (wave 23): show how many posts are needed this week specifically
  try {
    if (postsNeeded > 0 && daysLeft > 0) {
      const todayDow = now.getDay(); // 0=Sun
      const daysUntilWeekEnd = todayDow === 0 ? 0 : 7 - todayDow; // days until Sunday
      const daysInWeek = Math.min(daysUntilWeekEnd + 1, daysLeft); // remaining days in current week
      const weeksLeft = Math.ceil(daysLeft / 7);
      const postsPerWeek = weeksLeft > 0 ? Math.ceil(postsNeeded / weeksLeft) : postsNeeded;
      // Posts already posted this week
      const weekStart = new Date(now.getTime() - (todayDow === 0 ? 6 : todayDow - 1) * 86_400_000).toISOString().slice(0, 10);
      let thisWeekCount = 0;
      try {
        thisWeekCount = posts.filter((p: any) => (p.posted_at ?? p.recorded_at ?? '').slice(0, 10) >= weekStart).length; // Sprint 1219
      } catch { /* skip */ }
      const thisWeekNeeded = Math.max(0, postsPerWeek - thisWeekCount);
      const weekIcon = thisWeekNeeded === 0 ? '✅' : thisWeekNeeded <= 2 ? '⚠️' : '❌';
      lines.push('');
      lines.push(`${weekIcon} *This week:* ${thisWeekNeeded} posts still needed (${thisWeekCount}/${postsPerWeek} target · ${daysInWeek}d left in week)`);
    }
  } catch { /* skip */ }

  // Sprint 1282: time since last pipeline run (content freshness)
  try {
    const latestRunPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
    if (fs.existsSync(latestRunPath)) {
      const run = JSON.parse(fs.readFileSync(latestRunPath, 'utf-8'));
      const runTs = run.completed_at ?? run.timestamp ?? run.started_at ?? run.ts;
      if (runTs) {
        const ageMs = Date.now() - new Date(runTs).getTime();
        const ageH = ageMs / 3600000;
        const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago`
          : ageH < 24 ? `${Math.round(ageH)}h ago`
          : `${Math.round(ageH / 24)}d ago`;
        const pipeIcon = ageH < 6 ? '✅' : ageH < 24 ? '⚠️' : '🔴';
        const statusStr = run.status ?? run.outcome ?? '';
        lines.push('');
        lines.push(`${pipeIcon} *Last pipeline run:* ${ageStr}${statusStr ? ` · ${statusStr}` : ''}`);
      }
    }
  } catch { /* skip */ }

  lines.push('');
  lines.push('_Use /postnow to get your next video, /posted after posting._');

  return lines.join('\n');
}

export function cmdCalendar(): string {
  const calPath = path.join(ROOT, 'workspace', 'scs001', 'content-calendar.json');
  if (!fs.existsSync(calPath)) {
    return '📅 No content calendar found.\nGenerate one: `npx ts-node scripts/scs001/generate-content-calendar.ts`';
  }

  try {
    const cal = JSON.parse(fs.readFileSync(calPath, 'utf-8'));
    const schedule: Record<string, Array<{ video_id: string; slot: string; viral_score: number | null; speaker: string; topic: string; hook_formula?: string }>> = cal.schedule || {};
    const dates = Object.keys(schedule).sort();

    if (dates.length === 0) {
      return '📅 Calendar is empty — no videos assigned.';
    }

    // Show next 7 days from today
    const today = new Date().toISOString().split('T')[0];
    const upcoming = dates.filter(d => d >= today).slice(0, 7);

    if (upcoming.length === 0) {
      return '📅 No upcoming dates in calendar. Regenerate:\n`npx ts-node scripts/scs001/generate-content-calendar.ts`';
    }

    // Count manual posts (Sprint 1221: use readRealPosts — excludes dry-runs)
    const posted = readRealPosts().length;
    const postsLeft = Math.max(0, 30 - posted);
    const gateDate = new Date('2026-04-07');
    const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

    const lines: string[] = [
      `📅 *Content Calendar — Next 7 Days*`,
      `Gate: ${postsLeft} posts needed, ${daysLeft}d left`,
      '',
    ];

    for (const date of upcoming) {
      const items = schedule[date] || [];
      const dayName = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      lines.push(`*${dayName}:*`);

      if (items.length === 0) {
        lines.push('  (no videos assigned)');
      } else {
        for (const item of items) {
          const vs = item.viral_score != null ? `🧬${item.viral_score}` : '';
          const spk = item.speaker && item.speaker !== 'unknown' ? `🎙️${item.speaker}` : '';
          lines.push(`  ${item.slot} — \`${item.video_id}\` ${vs} ${spk}`);
        }
      }
      lines.push('');
    }

    lines.push(`_Total: ${cal.total_videos_assigned ?? '?'} videos across ${cal.total_days ?? '?'} days_`);
    lines.push(`_Generated: ${cal.generated_at ? cal.generated_at.split('T')[0] : 'unknown'}_`);

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading calendar: ${e.message}`;
  }
}

// Sprint 1008: /gate-audit — reconcile all posting data sources
export function cmdGateAudit(): string {
  const auditPath = path.join(ROOT, 'reports', 'gate-audit.json');

  // Regenerate if missing or stale (>1h)
  const needsRegen = !fs.existsSync(auditPath) ||
    (Date.now() - fs.statSync(auditPath).mtimeMs > 3600000);

  if (needsRegen) {
    try {
      execSync('npx ts-node --transpile-only scripts/scs001/audit-gate-count.ts', {
        cwd: ROOT, timeout: 20000, stdio: 'pipe'
      });
    } catch (e: any) {
      return `❌ Audit failed: ${e.message?.slice(0, 200)}`;
    }
  }

  if (!fs.existsSync(auditPath)) return '❌ No gate audit report found.';

  let a: any;
  try { a = JSON.parse(fs.readFileSync(auditPath, 'utf-8')); } catch {
    return '❌ Could not parse gate-audit.json';
  }

  const lines: string[] = [];
  lines.push('🔍 *Gate Count Audit*');
  lines.push('');

  const mp = a.sources?.manual_posts ?? {};
  lines.push('*manual-posts.jsonl*');
  lines.push(`• Total entries: ${mp.total ?? 0}`);
  lines.push(`• ✅ Real posts: ${mp.real ?? 0}`);
  lines.push(`• 🔧 Dry runs: ${mp.dry_runs ?? 0}`);
  lines.push('');

  const pl = a.sources?.publish_ledger ?? {};
  lines.push('*publish-ledger.jsonl*');
  lines.push(`• Total entries: ${pl.total ?? 0}`);
  lines.push(`• With TikTok post ID: ${pl.with_post_id ?? 0}`);
  lines.push('');

  const gr = a.sources?.gate_report ?? {};
  lines.push('*Gate report*');
  lines.push(`• Stored count: ${gr.gate_count ?? 'N/A'} (${gr.date ?? '?'})`);
  lines.push(`• Urgency: ${gr.urgency ?? 'N/A'}`);
  lines.push('');

  lines.push(`📊 *Reconciled: ${a.reconciled_count ?? 0}/30* (${a.gate_remaining ?? 30} remaining)`);
  if (a.discrepancy_note && a.discrepancy_note !== 'Sources agree.') {
    lines.push(`⚠️ ${a.discrepancy_note}`);
  } else {
    lines.push('✅ Sources agree.');
  }
  lines.push(`_Audited: ${a.audited_at ? a.audited_at.replace('T', ' ').slice(0, 16) : '?'}_`);

  return lines.join('\n');
}

// Sprint 1046: /gate-refresh — regenerate gate + show updated status
export function cmdGateRefresh(): string {
  try {
    execSync('npx ts-node --transpile-only scripts/scs001/generate-phase1-5-gate.ts', {
      cwd: ROOT, timeout: 30000, stdio: 'pipe',
    });
  } catch (e: any) {
    return `❌ Gate regen failed: ${e.message?.slice(0, 120)}`;
  }

  // Return the refreshed gate summary
  return '♻️ *Gate Refreshed*\n\n' + cmdGate();
}

// Sprint 1131: /gate-sim — posting pace simulator
export function cmdGateSim(): string {
  const posts = readRealPosts(); // Sprint 1219: was readLines(manual-posts.jsonl) — dry-runs excluded
  const totalPosts = posts.length;
  const totalViews = posts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
  const now = new Date();
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - totalPosts);

  if (postsNeeded === 0) {
    return '✅ *Gate Simulator* — Post target already met! 30/30 posts recorded.';
  }

  const scenarios = [1, 2, 3, 4, 5];
  const lines: string[] = [
    '🧮 *Gate Pace Simulator*',
    '',
    `📊 Current: *${totalPosts}/30* posts · *${totalViews}/500* views · *${daysLeft}d* left`,
    `📦 Need: *${postsNeeded}* more posts`,
    '',
    '*Scenario Analysis:*',
  ];

  for (const pace of scenarios) {
    const daysToComplete = Math.ceil(postsNeeded / pace);
    const completionDate = new Date(now.getTime() + daysToComplete * 86_400_000);
    const dateStr = completionDate.toISOString().slice(5, 10); // MM-DD
    const onTime = completionDate <= GATE_DATE;
    const margin = Math.round((GATE_DATE.getTime() - completionDate.getTime()) / 86_400_000);

    let effort = '';
    if (pace === 1) effort = '(easy — 5 min/day)';
    else if (pace === 2) effort = '(moderate — 10 min/day)';
    else if (pace === 3) effort = '(focused — 15 min/day)';
    else effort = '(sprint — 20+ min/day)';

    const status = onTime
      ? `✅ ${dateStr} (+${margin}d margin)`
      : `❌ ${dateStr} (${Math.abs(margin)}d late)`;

    lines.push(`  *${pace}/day* → ${daysToComplete}d → ${status} ${effort}`);
  }

  const minPace = Math.ceil(postsNeeded / Math.max(1, daysLeft));
  lines.push('');
  lines.push(`⚡ *Minimum pace for on-time:* ${minPace}/day`);
  lines.push(`💡 *Recommended:* ${Math.min(minPace + 1, 5)}/day (buffer for missed days)`);
  lines.push('');
  lines.push('_Tap /pickup to start posting now_');

  return lines.join('\n');
}
