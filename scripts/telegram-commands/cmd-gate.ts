/**
 * Telegram bot commands — extracted from telegram-bot.ts (Sprint 455)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ROOT, readJSON, readLines, getPm2List, fmtUptime, fmtMem, latestSprintFile,
  findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived, saveArchived, ARCHIVE_PATH,
} from './shared';

export function cmdGate(): string {
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let postCount = 0;
  let totalViews = 0;

  if (fs.existsSync(manualPostsPath)) {
    const lines = fs.readFileSync(manualPostsPath, 'utf-8').split('\n').filter(l => l.trim());
    postCount = lines.length;
    for (const line of lines) {
      try { totalViews += JSON.parse(line).views ?? 0; } catch {}
    }
  }

  const gateDate = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / 86_400_000));
  const postsNeeded = Math.max(0, 30 - postCount);
  const postsPerDay = daysLeft > 0 ? (postsNeeded / daysLeft).toFixed(1) : '∞';
  const viewsNeeded = Math.max(0, 500 - totalViews);

  const postIcon = postCount >= 30 ? '✅' : '⏳';
  const viewIcon = totalViews >= 500 ? '✅' : '⏳';
  const urgency = daysLeft <= 7 ? '🔴 URGENT' : daysLeft <= 14 ? '🟡 WARNING' : '🟢 ON TRACK';

  return (
    `*Phase 1.5 Gate — TikTok Kill Switch*\n` +
    `📅 Apr 7 · ${daysLeft} days remaining · ${urgency}\n\n` +
    `${postIcon} Posts: ${postCount}/30 (need ${postsNeeded} more)\n` +
    `${viewIcon} Views: ${totalViews}/500 (need ${viewsNeeded} more)\n` +
    `📊 Pace needed: ${postsPerDay} posts/day\n\n` +
    `_Record a post: npx ts-node scripts/scs001/record-manual-post.ts --video-id <id> --views <n>_`
  );
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

  // 3. Gate progress
  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  let postsCount = 0;
  let totalViews = 0;
  const mpPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  if (fs.existsSync(mpPath)) {
    const posts = fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim());
    postsCount = posts.length;
    for (const l of posts) {
      try { const p = JSON.parse(l); totalViews += (p.views ?? 0); } catch {}
    }
  }
  const postsLeft = Math.max(0, 30 - postsCount);
  const viewsLeft = Math.max(0, 500 - totalViews);
  const paceNeeded = daysLeft > 0 && postsLeft > 0 ? Math.round(postsLeft / daysLeft * 10) / 10 : 0;

  lines.push('');
  lines.push(`📅 Gate Deadline: Apr 7 (${daysLeft} days left)`);
  lines.push(`📊 Posts: ${postsCount}/30 ${postsLeft > 0 ? `(${postsLeft} more needed)` : '✅'}`);
  lines.push(`👁 Views: ${totalViews}/500 ${viewsLeft > 0 ? `(${viewsLeft} more needed)` : '✅'}`);
  if (paceNeeded > 0) lines.push(`⏱ Pace: ${paceNeeded} posts/day`);

  // 4. Queue
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  let queueCount = 0;
  if (fs.existsSync(ledgerPath)) {
    const postedIds = new Set<string>();
    if (fs.existsSync(mpPath)) {
      for (const l of fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
        try { const p = JSON.parse(l); if (p.video_id) postedIds.add(p.video_id); } catch {}
      }
    }
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
  const mpPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

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

  // Load posted IDs
  const postedIds = new Set<string>();
  if (fs.existsSync(mpPath)) {
    for (const l of fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try { const p = JSON.parse(l); if (p.video_id) postedIds.add(p.video_id); } catch {}
    }
  }

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
  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
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
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const posts = readLines(manualPostsPath);
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

  const lines: string[] = [];
  lines.push('🏃 *Posting Pace — Gate Countdown*');
  lines.push('');
  lines.push(`📅 Gate: Apr 7 · *${daysLeft}d remaining*`);
  lines.push(`📊 Posts: *${postCount}/${GATE_TARGET}* · ${postsNeeded} to go`);
  lines.push(`👁️ Views: ${totalViews}/500`);
  lines.push('');

  if (postCount === 0) {
    lines.push('⚠️ *No posts yet!* You need to start posting NOW.');
    lines.push(`📌 Required pace: *${paceNeeded.toFixed(1)} posts/day*`);
    lines.push(`📌 That's *${perWeek} posts/week*`);
  } else {
    lines.push(`*Current pace:* ${pacePerDay.toFixed(1)} posts/day`);
    lines.push(`*Needed pace:* ${paceNeeded.toFixed(1)} posts/day`);
    lines.push('');
    lines.push(`*Projection at current pace:* ${projectedAtGate} posts by Apr 7`);
    if (willPass) {
      lines.push('✅ *On track* — keep it up!');
    } else {
      const deficit = GATE_TARGET - projectedAtGate;
      lines.push(`❌ *Off track* — ${deficit} posts short`);
      lines.push(`📌 Increase to *${paceNeeded.toFixed(1)} posts/day* (${perWeek}/week)`);
    }
  }

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

    // Count manual posts
    const manualPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
    let posted = 0;
    if (fs.existsSync(manualPath)) {
      posted = fs.readFileSync(manualPath, 'utf-8').split('\n').filter(l => l.trim()).length;
    }
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
